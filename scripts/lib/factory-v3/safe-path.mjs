import fs from 'node:fs';
import path from 'node:path';

import { fail } from './errors.mjs';

const NO_FOLLOW = fs.constants.O_NOFOLLOW || 0;

export function assertConfinedRegularFile({ repoRoot, file, allowMissing = false, label = 'file' }) {
  const { root, target } = confinedTarget(repoRoot, file, label, false);
  const relative = path.relative(root, target);
  assertNoSymlinkComponents(root, relative, { allowMissingLeaf: allowMissing, label });
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return { root, target, exists: false, stat: null };
    fail('factory-confined-file-missing', `${label} is missing: ${relative}`);
  }
  if (stat.isSymbolicLink()) fail('factory-confined-file-symlink', `${label} must not be a symbolic link: ${relative}`);
  if (!stat.isFile()) fail('factory-confined-file-not-regular', `${label} must be a regular file: ${relative}`);
  return { root, target, exists: true, stat };
}

export function readConfinedFile({ repoRoot, file, encoding = null, allowMissing = false, label = 'file' }) {
  const checked = assertConfinedRegularFile({ repoRoot, file, allowMissing, label });
  if (!checked.exists) return null;
  const flags = fs.constants.O_RDONLY | NO_FOLLOW;
  const fd = fs.openSync(checked.target, flags);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== checked.stat.dev || opened.ino !== checked.stat.ino) {
      fail('factory-confined-file-raced', `${label} changed while it was opened`);
    }
    return fs.readFileSync(fd, encoding === null ? undefined : { encoding });
  } finally {
    fs.closeSync(fd);
  }
}

export function appendConfinedFile({ repoRoot, file, value, label = 'file' }) {
  const checked = assertConfinedRegularFile({ repoRoot, file, allowMissing: true, label });
  const parent = path.dirname(checked.target);
  assertConfinedDirectory({ repoRoot: checked.root, directory: parent, label: `${label} parent` });
  const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | NO_FOLLOW;
  const fd = fs.openSync(checked.target, flags, 0o600);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile()) fail('factory-confined-file-not-regular', `${label} must remain a regular file`);
    if (checked.exists && (opened.dev !== checked.stat.dev || opened.ino !== checked.stat.ino)) {
      fail('factory-confined-file-raced', `${label} changed while it was opened`);
    }
    const reopened = fs.lstatSync(checked.target);
    if (reopened.isSymbolicLink() || reopened.dev !== opened.dev || reopened.ino !== opened.ino) {
      fail('factory-confined-file-raced', `${label} path no longer names the opened file`);
    }
    writeAll(fd, value);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function assertConfinedDirectory({ repoRoot, directory, label = 'directory' }) {
  const { root, target } = confinedTarget(repoRoot, directory, label, true);
  const relative = path.relative(root, target);
  assertNoSymlinkComponents(root, relative, { label });
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('factory-confined-directory-invalid', `${label} must be a real directory`);
  const real = fs.realpathSync(target);
  if (real !== target) fail('factory-confined-directory-symlink', `${label} must not traverse symbolic links`);
  return { root, target, stat };
}

function realDirectory(candidate, code) {
  let resolved;
  try {
    resolved = fs.realpathSync(path.resolve(candidate));
  } catch (error) {
    fail(code, `cannot resolve repository root: ${error.message}`);
  }
  if (!fs.statSync(resolved).isDirectory()) fail(code, 'repository root is not a directory');
  return resolved;
}

function confinedTarget(repoRoot, candidate, label, allowRoot) {
  const lexicalRoot = path.resolve(repoRoot);
  const lexicalTarget = path.resolve(candidate);
  assertLexicallyInside(lexicalRoot, lexicalTarget, label, allowRoot);
  const root = realDirectory(lexicalRoot, 'factory-repository-unreadable');
  const relative = path.relative(lexicalRoot, lexicalTarget);
  return { root, target: path.resolve(root, relative) };
}

function assertLexicallyInside(root, target, label, allowRoot = false) {
  if ((!allowRoot && target === root) || (target !== root && !target.startsWith(`${root}${path.sep}`))) {
    fail('factory-confined-path-escape', `${label} escapes the repository`);
  }
}

function assertNoSymlinkComponents(root, relative, { allowMissingLeaf = false, label }) {
  let cursor = root;
  const parts = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (allowMissingLeaf && index === parts.length - 1 && error.code === 'ENOENT') return;
      fail('factory-confined-path-unreadable', `${label} path cannot be inspected: ${error.message}`);
    }
    if (stat.isSymbolicLink()) fail('factory-confined-path-symlink', `${label} path contains a symbolic link: ${path.relative(root, cursor)}`);
    if (index < parts.length - 1 && !stat.isDirectory()) fail('factory-confined-path-parent', `${label} parent is not a directory`);
  }
}

function writeAll(fd, value) {
  const buffer = Buffer.from(value, 'utf8');
  let offset = 0;
  while (offset < buffer.length) offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
}
