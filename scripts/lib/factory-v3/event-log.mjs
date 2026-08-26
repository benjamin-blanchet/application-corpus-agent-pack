import fs from 'node:fs';
import path from 'node:path';
import { canonicalHash, canonicalJson, sha256 } from './canonical-json.mjs';
import { validateEventShape } from './contract.mjs';
import { FactoryV3Error, fail } from './errors.mjs';

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

export function readEventFile(file) {
  if (!fs.existsSync(file)) return [];
  return assertEventChain(parseEventLog(fs.readFileSync(file, 'utf8')));
}

export function appendEventFile({ repoRoot, packageDir, eventInput, apply = false }) {
  const eventFile = path.join(packageDir, 'factory', 'events.v3.jsonl');
  const existing = readEventFile(eventFile);
  const event = buildEvent(existing, eventInput);
  if (!apply) return { applied: false, event, events: [...existing, event] };

  const release = acquireControllerLock(repoRoot, packageDir, eventInput.controller_id);
  try {
    const current = readEventFile(eventFile);
    const checked = buildEvent(current, eventInput);
    if (checked.seq !== event.seq || checked.previous_event_sha256 !== event.previous_event_sha256) {
      fail('factory-event-concurrent-append', 'event log advanced while the append was waiting for the controller lock');
    }
    fs.mkdirSync(path.dirname(eventFile), { recursive: true });
    const fd = fs.openSync(eventFile, 'a');
    try {
      writeAll(fd, `${canonicalJson(checked)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return { applied: true, event: checked, events: [...current, checked] };
  } finally {
    release();
  }
}

function writeAll(fd, value) {
  const buffer = Buffer.from(value, 'utf8');
  let offset = 0;
  while (offset < buffer.length) offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
}

function acquireControllerLock(repoRoot, packageDir, controllerId) {
  const gitDir = resolveGitDir(repoRoot);
  const lockDir = path.join(gitDir, 'factory-locks');
  fs.mkdirSync(lockDir, { recursive: true });
  const key = sha256(path.resolve(packageDir)).slice(0, 24);
  const lockFile = path.join(lockDir, `${key}.lock`);
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx');
    fs.writeFileSync(fd, `${controllerId}\n`, 'utf8');
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') fail('factory-controller-lock-held', `another controller holds ${lockFile}`);
    throw error;
  }
  return () => {
    try { fs.closeSync(fd); } finally { fs.unlinkSync(lockFile); }
  };
}

function resolveGitDir(repoRoot) {
  const marker = path.join(repoRoot, '.git');
  if (!fs.existsSync(marker)) fail('factory-controller-no-git-dir', `cannot acquire controller lock: ${marker} does not exist`);
  if (fs.statSync(marker).isDirectory()) return marker;
  const match = fs.readFileSync(marker, 'utf8').trim().match(/^gitdir:\s*(.+)$/);
  if (!match) fail('factory-controller-git-dir-invalid', `${marker} is neither a Git directory nor a gitdir reference`);
  return path.resolve(repoRoot, match[1]);
}

function finding(code, message, event) {
  return { severity: 'P0', code, message, event_id: event?.event_id };
}
