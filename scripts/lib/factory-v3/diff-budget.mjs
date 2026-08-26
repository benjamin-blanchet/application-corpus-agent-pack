import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { normalizeRepoPath } from './path-claims.mjs';

export const CHANGE_METRICS_ALGORITHM = 'git-numstat-plus-untracked-v1';

export function defaultDiffBudget(lot) {
  return lot?.complexity === 'reasoning'
    ? { max_files: 30, max_added_lines: 2000, max_deleted_lines: 2000, max_binary_files: 0 }
    : { max_files: 12, max_added_lines: 800, max_deleted_lines: 800, max_binary_files: 0 };
}

export function observeChangeMetrics({ workspaceRoot, baseRevision, files }) {
  const metrics = { algorithm: CHANGE_METRICS_ALGORITHM, files: files.length, added_lines: 0, deleted_lines: 0, binary_files: 0 };
  for (const entry of files) {
    const repoPath = normalizeRepoPath(entry.path);
    const stat = gitNumstat(workspaceRoot, baseRevision, repoPath);
    if (stat) {
      if (stat.binary) metrics.binary_files += 1;
      else {
        metrics.added_lines += stat.added;
        metrics.deleted_lines += stat.deleted;
      }
      continue;
    }
    if (entry.status === 'present') {
      const target = path.resolve(workspaceRoot, ...repoPath.split('/'));
      const node = fs.lstatSync(target);
      if (node.isSymbolicLink() || !node.isFile()) fail('factory-diff-budget-node', `${repoPath}: changed path must be a regular file`);
      const bytes = fs.readFileSync(target);
      if (bytes.includes(0)) metrics.binary_files += 1;
      else metrics.added_lines += lineCount(bytes);
    } else if (gitBlob(workspaceRoot, baseRevision, repoPath) !== null) {
      fail('factory-diff-budget-git', `${repoPath}: deleted tracked file produced no Git numstat`);
    }
  }
  return metrics;
}

export function exceededDiffBudget(metrics, limits) {
  return [
    ['files', 'max_files'],
    ['added_lines', 'max_added_lines'],
    ['deleted_lines', 'max_deleted_lines'],
    ['binary_files', 'max_binary_files'],
  ].filter(([metric, limit]) => metrics[metric] > limits[limit]).map(([metric, limit]) => ({ metric, observed: metrics[metric], limit: limits[limit] }));
}

function gitNumstat(root, revision, repoPath) {
  const result = spawnSync('git', ['-C', root, 'diff', '--no-renames', '--numstat', '-z', revision, '--', repoPath], { encoding: null, stdio: 'pipe' });
  if (result.status !== 0) fail('factory-diff-budget-git', `cannot compute Git numstat for ${repoPath}`);
  if (result.stdout.length === 0) return null;
  const records = result.stdout.toString('utf8').split('\0').filter(Boolean);
  if (records.length !== 1) fail('factory-diff-budget-git', `${repoPath}: expected exactly one Git numstat record`);
  const [added, deleted, observedPath] = records[0].split('\t');
  if (observedPath !== repoPath) fail('factory-diff-budget-git', `${repoPath}: Git numstat path mismatch`);
  if (added === '-' && deleted === '-') return { binary: true, added: null, deleted: null };
  if (!/^\d+$/.test(added) || !/^\d+$/.test(deleted)) fail('factory-diff-budget-git', `${repoPath}: invalid Git numstat counts`);
  return { binary: false, added: Number(added), deleted: Number(deleted) };
}

function gitBlob(root, revision, repoPath) {
  const result = spawnSync('git', ['-C', root, 'cat-file', 'blob', `${revision}:${repoPath}`], { encoding: null, stdio: 'pipe' });
  if (result.status === 0) return result.stdout;
  if (result.status === 128) return null;
  fail('factory-diff-budget-git', `cannot read ${repoPath} at ${revision}`);
}

function lineCount(bytes) {
  if (!bytes.length) return 0;
  let count = 0;
  for (const byte of bytes) if (byte === 10) count += 1;
  return count + (bytes.at(-1) === 10 ? 0 : 1);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
