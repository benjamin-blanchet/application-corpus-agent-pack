import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SHA_PATTERN = /^[0-9a-f]{40}$/i;
export const OUTCOMES = new Set(['passed', 'failed', 'blocked', 'skipped', 'waived']);
export const READY_OUTCOME = 'passed';

const INTERNAL_OUTCOME_MAP = new Map([
  ['pass', 'passed'],
  ['passed', 'passed'],
  ['fail', 'failed'],
  ['failed', 'failed'],
  ['error', 'failed'],
  ['timedout', 'failed'],
  ['flaky', 'failed'],
  ['blocked', 'blocked'],
  ['skipped', 'skipped'],
  ['waived', 'waived'],
]);

// This is the sole boundary between adapter-internal statuses and the public
// evidence vocabulary. A retry-only success is deliberately canonicalized as
// failed so it can never become an approved case by presentation alone.
export function canonicalizeCaseOutcome(value, attempts = 1) {
  const raw = String(value || '').toLowerCase();
  const mapped = INTERNAL_OUTCOME_MAP.get(raw);
  if (mapped === 'passed' && Number(attempts) > 1) return { outcome: 'failed', reason: 'flaky_retry' };
  if (raw === 'flaky') return { outcome: 'failed', reason: 'flaky_retry' };
  if (!mapped) return { outcome: 'blocked', reason: 'invalid_adapter_outcome' };
  return { outcome: mapped, reason: null };
}

export function finding(code, message, file = null, detail = null, severity = 'P0') {
  return { severity, code, message, ...(file ? { file } : {}), ...(detail ? { detail } : {}) };
}

export function requiredObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function ensureRequired(object, keys, scope, findings, file) {
  if (!requiredObject(object)) {
    findings.push(finding('delivery-invalid-shape', `${scope} must be a mapping`, file));
    return;
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key) || object[key] === null || object[key] === '') {
      findings.push(finding('delivery-required-field-missing', `${scope}.${key} is required`, file));
    }
  }
}

export function duplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of asArray(items)) {
    if (!item?.id) continue;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Buffer(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

export function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

export function sha256Object(value) {
  return sha256Buffer(Buffer.from(stableJson(value)));
}

export function isWithin(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function safeRelative(root, candidate) {
  if (!isWithin(root, candidate)) throw new Error(`${candidate} escapes ${root}`);
  return path.relative(path.resolve(root), path.resolve(candidate)).split(path.sep).join('/');
}

export function resolveContainedRegularFile(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = safeRelative(resolvedRoot, resolvedCandidate);
  if (!fs.existsSync(resolvedRoot)) throw new Error(`artifact root does not exist: ${resolvedRoot}`);
  const rootStat = fs.lstatSync(resolvedRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`artifact root must be a real directory: ${resolvedRoot}`);
  }
  let cursor = resolvedRoot;
  for (const part of relative.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) throw new Error(`artifact file is absent: ${relative}`);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`symbolic links are forbidden in artifact paths: ${relative}`);
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const realCandidate = fs.realpathSync(resolvedCandidate);
  if (!isWithin(realRoot, realCandidate)) throw new Error(`${relative} escapes its artifact root after canonicalization`);
  if (!fs.statSync(realCandidate).isFile()) throw new Error(`artifact is not a regular file: ${relative}`);
  return { absolute: realCandidate, relative };
}

export function resolveContainedDirectory(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = safeRelative(resolvedRoot, resolvedCandidate);
  if (!fs.existsSync(resolvedRoot)) throw new Error(`directory root does not exist: ${resolvedRoot}`);
  if (fs.lstatSync(resolvedRoot).isSymbolicLink() || !fs.statSync(resolvedRoot).isDirectory()) throw new Error(`directory root must be a real directory: ${resolvedRoot}`);
  let cursor = resolvedRoot;
  for (const part of relative.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) throw new Error(`directory is absent: ${relative}`);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`symbolic links are forbidden in operation paths: ${relative}`);
  }
  const realRoot = fs.realpathSync(resolvedRoot);
  const realCandidate = fs.realpathSync(resolvedCandidate);
  if (!isWithin(realRoot, realCandidate)) throw new Error(`${relative} escapes its root after canonicalization`);
  if (!fs.statSync(realCandidate).isDirectory()) throw new Error(`operation cwd is not a directory: ${relative}`);
  return { absolute: realCandidate, relative };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) out._.push(arg);
    else {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        index += 1;
      } else out[key] = true;
    }
  }
  return out;
}

export function printResult(result, jsonMode = false) {
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.title || 'Factory delivery');
    if (result.summary) console.log(Object.entries(result.summary).map(([key, value]) => `${key}: ${value}`).join('  '));
    for (const item of result.findings || []) {
      console.log(`[${item.severity}] ${item.code}: ${item.message}${item.file ? ` (${item.file})` : ''}`);
    }
    if (result.message) console.log(result.message);
  }
}

export function exitCodeFor(findings, internalError = false) {
  if (internalError) return 1;
  return findings.length ? 2 : 0;
}
