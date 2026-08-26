import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { canonicalJson, fileHash, sha256 } from './canonical-json.mjs';
import { normalizeRepoPath } from './path-claims.mjs';
import {
  WORKSPACE_DELTA_ALGORITHM,
  WORKSPACE_SNAPSHOT_ALGORITHM,
  changeInventoryDigest,
  workspaceSnapshotDigest,
} from './proof-contracts.mjs';

export function captureWorkspaceSnapshot({
  workspaceRoot,
  repositoryRoot,
  baseRevision = null,
  exclusions = [],
  allowHeadDivergence = false,
  attestationMode = 'live',
}) {
  const workspace = resolveGitWorkspace(workspaceRoot);
  const repository = resolveGitWorkspace(repositoryRoot);
  if (workspace.commonDirectory !== repository.commonDirectory) fail('factory-workspace-repository-mismatch', 'workspace root must be the repository or a linked Git worktree');
  const revision = baseRevision || workspace.head;
  if (baseRevision && !allowHeadDivergence && workspace.head !== baseRevision) fail('factory-workspace-head-mismatch', `workspace HEAD ${workspace.head} differs from lot base_revision ${baseRevision}`);
  assertGitCommit(workspace.root, revision);
  if (!['live', 'retrospective_attestation'].includes(attestationMode)) fail('factory-workspace-attestation-mode', 'workspace attestation mode is invalid');
  const normalizedExclusions = [...new Set(exclusions.map(normalizeRepoPath))].sort();
  const tracked = nulPaths(runGit(workspace.root, ['diff', '--name-only', '-z', '--no-renames', revision, '--']));
  const untracked = nulPaths(runGit(workspace.root, ['ls-files', '--others', '--exclude-standard', '-z', '--']));
  const origins = new Map();
  for (const candidate of tracked) if (!isExcluded(candidate, normalizedExclusions)) origins.set(normalizeRepoPath(candidate), 'tracked');
  for (const candidate of untracked) if (!isExcluded(candidate, normalizedExclusions) && !origins.has(candidate)) origins.set(normalizeRepoPath(candidate), 'untracked');

  const entries = [...origins.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([repoPath, origin]) => {
    const target = resolveWorkspacePath(workspace.root, repoPath);
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT' && origin === 'tracked') return { path: repoPath, origin, status: 'deleted', sha256: null };
      fail('factory-workspace-path-unreadable', `cannot inspect workspace path ${repoPath}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) fail('factory-workspace-symlink', `symbolic links are forbidden in attested workspace paths: ${repoPath}`);
    if (!stat.isFile()) fail('factory-workspace-node-unsupported', `workspace attestation supports regular files only: ${repoPath}`);
    return { path: repoPath, origin, status: 'present', sha256: fileHash(target) };
  });
  const snapshot = {
    v: 1,
    algorithm: WORKSPACE_SNAPSHOT_ALGORITHM,
    workspace_id: sha256(workspace.root),
    workspace_mode: workspace.root === repository.root ? 'repository' : 'isolated_worktree',
    attestation_mode: attestationMode,
    base_revision: revision,
    exclusions: normalizedExclusions,
    entries,
    snapshot_sha256: null,
  };
  snapshot.snapshot_sha256 = workspaceSnapshotDigest(snapshot);
  return snapshot;
}

export function createRetrospectiveBaseline({ workspaceRoot, repositoryRoot, baseRevision, exclusions = [] }) {
  const observed = captureWorkspaceSnapshot({
    workspaceRoot,
    repositoryRoot,
    baseRevision,
    exclusions,
    allowHeadDivergence: true,
    attestationMode: 'retrospective_attestation',
  });
  const snapshot = { ...observed, entries: [], snapshot_sha256: null };
  snapshot.snapshot_sha256 = workspaceSnapshotDigest(snapshot);
  return snapshot;
}

export function createWorkspaceDeltaAttestation({ fromSnapshot, toSnapshot, workspaceRoot, metrics = null, budget = null }) {
  validateSnapshotLink(fromSnapshot, toSnapshot);
  const files = deriveWorkspaceDeltaFiles({ fromSnapshot, toSnapshot, gitRoot: workspaceRoot });
  return {
    files,
    delta: {
      algorithm: WORKSPACE_DELTA_ALGORITHM,
      from_snapshot_sha256: fromSnapshot.snapshot_sha256,
      to_snapshot: toSnapshot,
      files_sha256: changeInventoryDigest(files),
      metrics,
      budget,
    },
  };
}

export function controllerWorkspaceExclusions(packageRef) {
  const root = normalizeRepoPath(packageRef);
  return [
    `${root}/acceptance/runs`,
    `${root}/factory/events.v3.jsonl`,
    `${root}/factory/state.v3.json`,
  ].sort();
}

export function deriveWorkspaceDeltaFiles({ fromSnapshot, toSnapshot, gitRoot }) {
  validateSnapshotLink(fromSnapshot, toSnapshot);
  const before = new Map((fromSnapshot.entries || []).map((entry) => [entry.path, entry]));
  const after = new Map((toSnapshot.entries || []).map((entry) => [entry.path, entry]));
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter((repoPath) => canonicalJson(before.get(repoPath) ?? null) !== canonicalJson(after.get(repoPath) ?? null))
    .sort();
  return changed.map((repoPath) => {
    const current = after.get(repoPath);
    if (current?.status === 'present') return { path: repoPath, status: 'present', sha256: current.sha256 };
    if (current?.status === 'deleted') return { path: repoPath, status: 'deleted', sha256: null };
    const prior = before.get(repoPath);
    if (prior?.origin === 'untracked') return { path: repoPath, status: 'deleted', sha256: null };
    const baseBytes = readGitFile(gitRoot, fromSnapshot.base_revision, repoPath);
    return baseBytes === null
      ? { path: repoPath, status: 'deleted', sha256: null }
      : { path: repoPath, status: 'present', sha256: sha256(baseBytes) };
  });
}

export function validateWorkspaceSnapshotShape(snapshot) {
  const findings = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [{ code: 'factory-workspace-snapshot-shape', message: 'workspace snapshot must be an object' }];
  if (snapshot.algorithm !== WORKSPACE_SNAPSHOT_ALGORITHM) findings.push({ code: 'factory-workspace-snapshot-algorithm', message: 'workspace snapshot algorithm is invalid' });
  if (workspaceSnapshotDigest(snapshot) !== snapshot.snapshot_sha256) findings.push({ code: 'factory-workspace-snapshot-digest-mismatch', message: 'workspace snapshot digest is not recomputable' });
  return findings;
}

function validateSnapshotLink(fromSnapshot, toSnapshot) {
  if (workspaceSnapshotDigest(fromSnapshot) !== fromSnapshot.snapshot_sha256) fail('factory-workspace-snapshot-digest-mismatch', 'from workspace snapshot digest is invalid');
  if (workspaceSnapshotDigest(toSnapshot) !== toSnapshot.snapshot_sha256) fail('factory-workspace-snapshot-digest-mismatch', 'to workspace snapshot digest is invalid');
  for (const key of ['workspace_id', 'base_revision', 'attestation_mode']) {
    if (fromSnapshot[key] !== toSnapshot[key]) fail('factory-workspace-snapshot-link', `workspace snapshots disagree on ${key}`);
  }
  if (canonicalJson(fromSnapshot.exclusions) !== canonicalJson(toSnapshot.exclusions)) fail('factory-workspace-snapshot-link', 'workspace snapshots disagree on exclusions');
}

function resolveGitWorkspace(candidate) {
  if (typeof candidate !== 'string' || !candidate) fail('factory-workspace-root-missing', 'workspace root is required');
  let root;
  try {
    root = fs.realpathSync(path.resolve(candidate));
  } catch (error) {
    fail('factory-workspace-root-unreadable', `cannot resolve workspace root: ${error.message}`);
  }
  const top = fs.realpathSync(runGit(root, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  if (top !== root) fail('factory-workspace-root-not-toplevel', 'workspace root must be the exact Git worktree top-level');
  const commonRaw = runGit(root, ['rev-parse', '--git-common-dir']).toString('utf8').trim();
  const commonDirectory = fs.realpathSync(path.resolve(root, commonRaw));
  const head = runGit(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(head)) fail('factory-workspace-head-invalid', 'workspace HEAD must be a full Git object id');
  return { root, commonDirectory, head };
}

export function assertGitCommit(root, revision) {
  runGit(root, ['cat-file', '-e', `${revision}^{commit}`]);
}

function readGitFile(root, revision, repoPath) {
  const result = spawnSync('git', ['-C', root, 'cat-file', 'blob', `${revision}:${repoPath}`], { encoding: null, stdio: 'pipe' });
  if (result.status === 0) return result.stdout;
  if (result.status === 128) return null;
  fail('factory-workspace-base-read-failed', `cannot read ${repoPath} at ${revision}: ${String(result.stderr || '').trim()}`);
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: null, stdio: 'pipe' });
  if (result.status !== 0) fail('factory-workspace-git-failed', `git ${args[0]} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function nulPaths(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean).map(normalizeRepoPath);
}

function isExcluded(candidate, exclusions) {
  const normalized = normalizeRepoPath(candidate);
  return exclusions.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}

function resolveWorkspacePath(root, repoPath) {
  const target = path.resolve(root, ...repoPath.split('/'));
  if (!target.startsWith(`${root}${path.sep}`)) fail('factory-workspace-path-escape', `workspace path escapes root: ${repoPath}`);
  return target;
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
