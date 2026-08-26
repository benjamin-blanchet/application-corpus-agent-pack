import fs from 'node:fs';
import path from 'node:path';

import { fileHash } from './canonical-json.mjs';
import { normalizeRepoPath } from './path-claims.mjs';
import {
  FILE_ARTIFACT_HASH_ALGORITHM,
  TREE_ARTIFACT_HASH_ALGORITHM,
  treeArtifactDigest,
} from './proof-contracts.mjs';

export function repositoryFileObservation({ repoRoot, repoPath }) {
  const node = resolveRepositoryNode(repoRoot, repoPath);
  if (!node.exists) return { exists: false, kind: null, sha256: null };
  if (node.stat.isFile()) return { exists: true, kind: 'file', sha256: fileHash(node.realPath), bytes: node.stat.size };
  if (node.stat.isDirectory()) return { exists: true, kind: 'tree', sha256: null };
  return { exists: true, kind: 'unsupported', sha256: null };
}

export function repositoryArtifactDigest({ repoRoot, repoPath }) {
  const node = resolveRepositoryNode(repoRoot, repoPath);
  if (!node.exists) fail('factory-artifact-missing', `artifact is missing: ${node.relative}`);
  if (node.stat.isFile()) return { kind: 'file', algorithm: FILE_ARTIFACT_HASH_ALGORITHM, sha256: fileHash(node.realPath), inventory: null };
  if (!node.stat.isDirectory()) fail('factory-artifact-node-unsupported', `artifact must be a regular file or directory: ${node.relative}`);

  const inventory = [];
  collectTree(node.realRoot, node.realPath, node.realPath, inventory);
  inventory.sort((left, right) => left.relative_path < right.relative_path ? -1 : left.relative_path > right.relative_path ? 1 : 0);
  return { kind: 'tree', algorithm: TREE_ARTIFACT_HASH_ALGORITHM, sha256: treeArtifactDigest(inventory), inventory };
}

function resolveRepositoryNode(repoRoot, repoPath) {
  if (typeof repoRoot !== 'string' || !repoRoot) fail('factory-artifact-repository-missing', 'artifact verification requires a repository root');
  let relative;
  try {
    relative = normalizeRepoPath(repoPath);
  } catch (error) {
    fail(error.code || 'factory-path-invalid', error.message);
  }

  const lexicalRoot = path.resolve(repoRoot);
  let realRoot;
  try {
    const rootStat = fs.lstatSync(lexicalRoot);
    if (rootStat.isSymbolicLink()) fail('factory-artifact-symlink', 'repository root must not be a symbolic link');
    if (!rootStat.isDirectory()) fail('factory-artifact-repository-invalid', 'artifact repository root must be a directory');
    realRoot = fs.realpathSync(lexicalRoot);
  } catch (error) {
    if (error.code?.startsWith('factory-')) throw error;
    fail('factory-artifact-repository-unreadable', `cannot resolve artifact repository root: ${error.message}`);
  }

  const target = path.resolve(lexicalRoot, ...relative.split('/'));
  if (!isStrictDescendant(lexicalRoot, target)) fail('factory-artifact-outside-repository', `artifact escapes repository: ${relative}`);

  let cursor = lexicalRoot;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error.code === 'ENOENT') return { exists: false, relative, realRoot, target };
      fail('factory-artifact-unreadable', `cannot inspect artifact path ${relative}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) fail('factory-artifact-symlink', `symbolic links are forbidden in artifact path: ${relative}`);
    let realCursor;
    try {
      realCursor = fs.realpathSync(cursor);
    } catch (error) {
      fail('factory-artifact-unreadable', `cannot resolve artifact path ${relative}: ${error.message}`);
    }
    if (realCursor !== realRoot && !isStrictDescendant(realRoot, realCursor)) fail('factory-artifact-outside-repository', `artifact escapes repository: ${relative}`);
  }

  let realPath;
  let stat;
  try {
    realPath = fs.realpathSync(target);
    stat = fs.lstatSync(realPath);
  } catch (error) {
    fail('factory-artifact-unreadable', `cannot resolve artifact ${relative}: ${error.message}`);
  }
  return { exists: true, relative, realRoot, realPath, stat };
}

function collectTree(realRoot, treeRoot, directory, inventory) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  } catch (error) {
    fail('factory-artifact-unreadable', `cannot read artifact tree: ${error.message}`);
  }

  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    let stat;
    let realCandidate;
    try {
      stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink()) fail('factory-artifact-symlink', `symbolic links are forbidden in artifact tree: ${path.relative(treeRoot, candidate).replace(/\\/g, '/')}`);
      realCandidate = fs.realpathSync(candidate);
    } catch (error) {
      if (error.code?.startsWith('factory-')) throw error;
      fail('factory-artifact-unreadable', `cannot inspect artifact tree entry: ${error.message}`);
    }
    if (!isStrictDescendant(realRoot, realCandidate)) fail('factory-artifact-outside-repository', 'artifact tree entry escapes repository');
    if (stat.isDirectory()) {
      collectTree(realRoot, treeRoot, realCandidate, inventory);
    } else if (stat.isFile()) {
      inventory.push({
        relative_path: path.relative(treeRoot, realCandidate).replace(/\\/g, '/'),
        sha256: fileHash(realCandidate),
      });
    } else {
      fail('factory-artifact-node-unsupported', `artifact tree contains a non-file node: ${path.relative(treeRoot, candidate).replace(/\\/g, '/')}`);
    }
  }
}

function isStrictDescendant(root, candidate) {
  return candidate.startsWith(`${root}${path.sep}`);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
