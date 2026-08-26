import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { SHA_PATTERN, isWithin, sha256Buffer, sha256File } from './core.mjs';

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function resolveCommit(repo, revision) {
  const sha = git(repo, ['rev-parse', '--verify', `${revision}^{commit}`]).trim();
  if (!SHA_PATTERN.test(sha)) throw new Error(`${revision} did not resolve to a full commit SHA`);
  return sha.toLowerCase();
}

export function sourceTreeDigest(repo, revision, { excludedPrefixes = [] } = {}) {
  const sha = resolveCommit(repo, revision);
  const prefixes = excludedPrefixes.map((prefix) => prefix.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/?$/, '/'));
  const lines = git(repo, ['ls-tree', '-r', '--full-tree', sha]).split('\n').filter(Boolean).filter((line) => {
    const tab = line.indexOf('\t');
    const file = tab === -1 ? '' : line.slice(tab + 1);
    return !prefixes.some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix));
  });
  return `sha256:${crypto.createHash('sha256').update(lines.sort().join('\n')).digest('hex')}`;
}

export function verifyEvidenceOnlyCommit(repo, subjectSha, evidenceSha, allowedPrefixes) {
  const subject = resolveCommit(repo, subjectSha);
  const evidence = resolveCommit(repo, evidenceSha);
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', subject, evidence], { cwd: repo });
  if (ancestor.status !== 0) return { ok: false, code: 'evidence-subject-not-ancestor', changed: [] };
  const changed = git(repo, ['diff', '--name-only', subject, evidence]).split('\n').filter(Boolean);
  const normalized = allowedPrefixes.map((prefix) => prefix.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/?$/, '/'));
  const forbidden = changed.filter((file) => !normalized.some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix)));
  if (forbidden.length) return { ok: false, code: 'evidence-commit-touches-source', changed, forbidden };
  const before = sourceTreeDigest(repo, subject, { excludedPrefixes: allowedPrefixes });
  const after = sourceTreeDigest(repo, evidence, { excludedPrefixes: allowedPrefixes });
  return { ok: before === after, code: before === after ? null : 'evidence-source-tree-changed', changed, before, after };
}

export function currentHead(repo) {
  return resolveCommit(repo, 'HEAD');
}

export function repositoryRelative(repo, file) {
  return path.relative(path.resolve(repo), path.resolve(file)).split(path.sep).join('/');
}

export function verifyFileAtRevision(repo, file, revision) {
  const absolute = path.resolve(file);
  if (!isWithin(repo, absolute)) return { ok: false, code: 'revision-file-outside-repository' };
  const relative = repositoryRelative(repo, absolute);
  const content = git(repo, ['show', `${resolveCommit(repo, revision)}:${relative}`]);
  const committedDigest = sha256Buffer(Buffer.from(content));
  const workingDigest = sha256File(absolute);
  return { ok: committedDigest === workingDigest, relative, committedDigest, workingDigest };
}
