import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { minimalChildEnvironment } from './child-environment.mjs';
import { canonicalHash, canonicalJson, sha256 } from './canonical-json.mjs';
import { validateEventShape } from './contract.mjs';
import { FactoryV3Error, fail } from './errors.mjs';
import { appendConfinedFile, assertConfinedDirectory, readConfinedFile } from './safe-path.mjs';

export const GENESIS_HASH = 'GENESIS';

export function parseEventLog(text) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) fail('factory-event-log-blank-line', `blank line at event log line ${index + 1}`);
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch (error) {
      fail('factory-event-log-json', `invalid JSON at event log line ${index + 1}: ${error.message}`);
    }
    if (lines[index] !== canonicalJson(event)) fail('factory-event-log-not-canonical', `event log line ${index + 1} is not canonical JSON`);
    events.push(event);
  }
  return events;
}

export function serializeEventLog(events) {
  return events.length ? `${events.map(canonicalJson).join('\n')}\n` : '';
}

export function eventHash(event) {
  return canonicalHash(event);
}

export function eventLogHash(events) {
  return sha256(serializeEventLog(events));
}

export function validateEventChain(events) {
  const findings = [];
  let previousHash = GENESIS_HASH;
  let runId = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const shapeFindings = validateEventShape(event);
    findings.push(...shapeFindings.map((finding) => ({ ...finding, event_id: event?.event_id, index })));
    const expectedSeq = index + 1;
    if (event?.seq !== expectedSeq) findings.push(finding('factory-event-sequence', `event ${index + 1} has seq ${String(event?.seq)}; expected ${expectedSeq}`, event));
    if (event?.expected_previous_seq !== index) findings.push(finding('factory-event-optimistic-sequence', `${event?.event_id || `<line-${index + 1}>`}: expected_previous_seq must be ${index}`, event));
    if (event?.previous_event_sha256 !== previousHash) findings.push(finding('factory-event-chain-broken', `${event?.event_id || `<line-${index + 1}>`}: previous event hash does not match`, event));
    if (index === 0) runId = event?.run_id;
    else if (event?.run_id !== runId) findings.push(finding('factory-event-run-id-changed', `${event?.event_id || `<line-${index + 1}>`}: run_id differs from the first event`, event));
    previousHash = eventHash(event);
  }
  return findings;
}

export function assertEventChain(events) {
  const findings = validateEventChain(events);
  if (findings.length) throw new FactoryV3Error(findings[0].code, findings[0].message, { findings });
  return events;
}

export function buildEvent(events, input) {
  assertEventChain(events);
  const seq = events.length + 1;
  const event = {
    v: 3,
    run_id: input.run_id || events.at(-1)?.run_id,
    seq,
    event_id: `EVT-${String(seq).padStart(6, '0')}`,
    type: input.type,
    at: input.at || new Date().toISOString(),
    controller_id: input.controller_id,
    expected_previous_seq: input.expected_previous_seq ?? events.length,
    previous_event_sha256: events.length ? eventHash(events.at(-1)) : GENESIS_HASH,
    actor: input.actor,
    subject: input.subject,
    basis: input.basis || {},
    data: input.data || {},
  };
  const shapeFindings = validateEventShape(event);
  if (shapeFindings.length) throw new FactoryV3Error(shapeFindings[0].code, shapeFindings[0].message, { findings: shapeFindings });
  if (event.expected_previous_seq !== events.length) {
    fail('factory-event-concurrent-append', `append expected seq ${event.expected_previous_seq}, current seq is ${events.length}`);
  }
  return event;
}

export function readEventFile(file, { repoRoot = null } = {}) {
  if (!repoRoot) {
    if (!fs.existsSync(file)) return [];
    return assertEventChain(parseEventLog(fs.readFileSync(file, 'utf8')));
  }
  const text = readConfinedFile({ repoRoot, file, encoding: 'utf8', allowMissing: true, label: 'factory event log' });
  return text === null ? [] : assertEventChain(parseEventLog(text));
}

export function appendEventFile({ repoRoot, packageDir, eventInput, apply = false, validateEvent = null }) {
  const eventFile = path.join(packageDir, 'factory', 'events.v3.jsonl');
  assertConfinedDirectory({ repoRoot, directory: packageDir, label: 'factory package' });
  assertConfinedDirectory({ repoRoot, directory: path.dirname(eventFile), label: 'factory control directory' });
  const existing = readEventFile(eventFile, { repoRoot });
  const event = buildEvent(existing, eventInput);
  if (!apply) return { applied: false, event, events: [...existing, event] };

  const release = acquireControllerLock(repoRoot, packageDir, eventInput.controller_id);
  try {
    const current = readEventFile(eventFile, { repoRoot });
    const checked = buildEvent(current, eventInput);
    if (checked.seq !== event.seq || checked.previous_event_sha256 !== event.previous_event_sha256) {
      fail('factory-event-concurrent-append', 'event log advanced while the append was waiting for the controller lock');
    }
    if (validateEvent) validateEvent(checked);
    appendConfinedFile({ repoRoot, file: eventFile, value: `${canonicalJson(checked)}\n`, label: 'factory event log' });
    return { applied: true, event: checked, events: [...current, checked] };
  } finally {
    release();
  }
}

function acquireControllerLock(repoRoot, packageDir, controllerId) {
  const gitDir = resolveGitDir(repoRoot);
  const lockDir = path.join(gitDir, 'factory-locks');
  try {
    const stat = fs.lstatSync(lockDir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(lockDir) !== lockDir) fail('factory-controller-lock-directory', 'factory lock directory must be a real directory without symlink traversal');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    fs.mkdirSync(lockDir, { mode: 0o700 });
  }
  const key = sha256(path.resolve(packageDir)).slice(0, 24);
  const lockFile = path.join(lockDir, `${key}.lock`);
  let fd;
  try {
    fd = fs.openSync(lockFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    const opened = fs.fstatSync(fd);
    const named = fs.lstatSync(lockFile);
    if (!opened.isFile() || named.isSymbolicLink() || opened.dev !== named.dev || opened.ino !== named.ino) fail('factory-controller-lock-raced', 'factory lock path does not name the opened regular file');
    fs.writeFileSync(fd, `${controllerId}\n`, 'utf8');
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') fail('factory-controller-lock-held', `another controller holds ${lockFile}`);
    throw error;
  }
  const identity = fs.fstatSync(fd);
  return () => {
    try { fs.closeSync(fd); } finally {
      try {
        const named = fs.lstatSync(lockFile);
        if (!named.isSymbolicLink() && named.dev === identity.dev && named.ino === identity.ino) fs.unlinkSync(lockFile);
      } catch {}
    }
  };
}

function resolveGitDir(repoRoot) {
  const root = fs.realpathSync(path.resolve(repoRoot));
  const marker = path.join(root, '.git');
  if (!fs.existsSync(marker)) fail('factory-controller-no-git-dir', `cannot acquire controller lock: ${marker} does not exist`);
  const markerStat = fs.lstatSync(marker);
  if (markerStat.isSymbolicLink()) fail('factory-controller-git-dir-symlink', '.git must not be a symbolic link');
  if (!markerStat.isDirectory() && !markerStat.isFile()) fail('factory-controller-git-dir-invalid', '.git must be a directory or regular gitdir file');
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--git-common-dir'], { encoding: 'utf8', stdio: 'pipe', env: minimalChildEnvironment() });
  if (result.status !== 0) fail('factory-controller-git-dir-invalid', `cannot resolve Git common directory: ${String(result.stderr || '').trim()}`);
  const raw = result.stdout.trim();
  const lexical = path.resolve(root, raw);
  let stat;
  try { stat = fs.lstatSync(lexical); } catch (error) { fail('factory-controller-git-dir-invalid', `cannot inspect Git common directory: ${error.message}`); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('factory-controller-git-dir-symlink', 'Git common directory must be a real directory');
  const real = fs.realpathSync(lexical);
  if (real !== lexical) fail('factory-controller-git-dir-symlink', 'Git common directory path must not traverse symbolic links');
  return real;
}

function finding(code, message, event) {
  return { severity: 'P0', code, message, event_id: event?.event_id };
}
