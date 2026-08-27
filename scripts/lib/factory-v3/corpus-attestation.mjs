import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { canonicalHash, fileHash } from './canonical-json.mjs';
import { minimalChildEnvironment } from './child-environment.mjs';
import { normalizeRepoPath } from './path-claims.mjs';
import {
  CORPUS_TREE_ALGORITHM,
  CORPUS_VALIDATION_ALGORITHM,
  corpusTreeDigest,
} from './proof-contracts.mjs';

export const CORPUS_ROOT_PATH = 'doc';
export const CORPUS_VALIDATOR_PATH = 'scripts/validate-corpus.mjs';

export function controllerCorpusExclusions(packageRef) {
  const root = normalizeRepoPath(packageRef);
  return [
    'doc/_site',
    `${root}/acceptance/runs`,
    `${root}/factory/evidence-manifest.v3.json`,
    `${root}/factory/events.v3.jsonl`,
    `${root}/factory/state.v3.json`,
  ].sort();
}

export function captureCorpusTree({ repoRoot, packageRef }) {
  const root = realRepositoryRoot(repoRoot);
  const rootPath = CORPUS_ROOT_PATH;
  const corpusRoot = confinedNode(root, rootPath, { kind: 'directory' });
  const exclusions = controllerCorpusExclusions(packageRef);
  const files = [];
  collect(root, corpusRoot, exclusions, files);
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return {
    root_path: rootPath,
    algorithm: CORPUS_TREE_ALGORITHM,
    exclusions,
    files,
    corpus_tree_sha256: corpusTreeDigest({ root_path: rootPath, exclusions, files }),
  };
}

// The subject's own validator bytes, named and hashed without running them.
// Everything a privileged context is allowed to learn about a candidate's
// corpus validation lives here: a digest is evidence, an execution is trust.
export function observeCorpusValidator({ repoRoot }) {
  const root = realRepositoryRoot(repoRoot);
  const validator = confinedNode(root, CORPUS_VALIDATOR_PATH, { kind: 'file' });
  return {
    algorithm: CORPUS_VALIDATION_ALGORITHM,
    validator_path: CORPUS_VALIDATOR_PATH,
    validator_sha256: fileHash(validator),
    arguments: ['--json'],
    status: 'passed',
  };
}

// Runs the subject's validator. Only ever call this where the subject is
// trusted — the local controller on its own checkout. Never from a workflow
// that loaded a candidate: the candidate would be the code being run.
export function observeCorpusValidation({ repoRoot }) {
  const root = realRepositoryRoot(repoRoot);
  const validator = confinedNode(root, CORPUS_VALIDATOR_PATH, { kind: 'file' });
  // Hash before spawning, so the digest names the bytes that ran rather than
  // whatever the run may have left in their place.
  const declared = observeCorpusValidator({ repoRoot });
  const result = spawnSync(process.execPath, [validator, '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
    env: minimalChildEnvironment(),
  });
  if (result.error) fail('factory-corpus-validator-failed', `corpus validator could not run: ${result.error.message}`);
  if (result.status !== 0) fail('factory-corpus-validator-failed', `corpus validator exited ${String(result.status)}: ${String(result.stderr || '').trim()}`);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    fail('factory-corpus-validator-output', `corpus validator did not return JSON: ${error.message}`);
  }
  if (parsed?.summary?.ok !== true || parsed?.summary?.counts?.P0 !== 0) fail('factory-corpus-validator-not-clean', 'corpus validator did not report a clean P0 result');
  return { ...declared, result_sha256: canonicalHash(parsed) };
}

export function captureCorpusCloseout({ repoRoot, packageRef }) {
  const tree = captureCorpusTree({ repoRoot, packageRef });
  return { ...tree, validation: observeCorpusValidation({ repoRoot }) };
}

function collect(repoRoot, directory, exclusions, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    const relative = path.relative(repoRoot, candidate).replace(/\\/g, '/');
    if (isExcluded(relative, exclusions)) continue;
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) fail('factory-corpus-tree-symlink', `corpus tree contains symbolic link ${relative}`);
    if (stat.isDirectory()) collect(repoRoot, candidate, exclusions, files);
    else if (stat.isFile()) files.push({ path: relative, sha256: fileHash(candidate) });
    else fail('factory-corpus-tree-node', `corpus tree contains unsupported node ${relative}`);
  }
}

function realRepositoryRoot(candidate) {
  const lexical = path.resolve(candidate);
  const stat = fs.lstatSync(lexical);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('factory-corpus-repository-invalid', 'corpus repository root must be a real directory');
  return fs.realpathSync(lexical);
}

function confinedNode(root, relative, { kind }) {
  const normalized = normalizeRepoPath(relative);
  let cursor = root;
  for (const part of normalized.split('/')) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) fail('factory-corpus-tree-symlink', `corpus control path contains symbolic link ${normalized}`);
  }
  const stat = fs.lstatSync(cursor);
  if (kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) fail('factory-corpus-control-node', `${normalized} is not a ${kind}`);
  return cursor;
}

function isExcluded(candidate, exclusions) {
  return exclusions.some((excluded) => candidate === excluded || candidate.startsWith(`${excluded}/`));
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
