import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { minimalChildEnvironment } from './child-environment.mjs';
import { canonicalHash, canonicalJsonPretty, normalizeText, sha256 } from './canonical-json.mjs';
import { buildEvent, serializeEventLog } from './event-log.mjs';
import { reduceFactory } from './reducer.mjs';
import { fail } from './errors.mjs';

export function inspectV1State(text) {
  const source = normalizeText(text);
  const snapshot = {
    version: Number(scalarValue(topScalar(source, 'version')) || 0),
    state: topScalar(source, 'state') || 'unknown',
    spec: mapSection(source, 'spec', ['status', 'approved_by', 'approved_at']),
    technical_plan: mapSection(source, 'technical_plan', ['status', 'approved_by', 'approved_at']),
    execution_policy: mapSection(source, 'execution_policy', ['mode', 'catalogue_observed_at', 'advanced_model', 'bounded_implementation_model', 'reviewer_model']),
    gates: mapSection(source, 'gates', ['implementation', 'consolidated_review', 'corpus_closeout', 'acceptance', 'final_release_readiness']),
    lots: parseLotMap(source),
    tested_code_sha: scalarValue(topScalar(source, 'tested_code_sha')),
    evidence_commit_sha: scalarValue(topScalar(source, 'evidence_commit_sha')),
  };
  return snapshot;
}

export function migrateV1Plan(text) {
  const source = normalizeText(text);
  const criteria = listAt(source, 'acceptance_criteria', 0);
  const lots = itemBlocks(source, 'lots').map((item) => ({
    id: item.id,
    kind: 'implementation',
    objective: scalarValue(blockScalar(item.text, 'objective')) || `Legacy lot ${item.id}`,
    acceptance_criteria: listAt(item.text, 'acceptance_criteria'),
    dependencies: listAt(item.text, 'dependencies'),
    // V1 never carried an auditable read surface or digest-bound handoff.
    // Keep those fields empty so migration remains explicitly review-required.
    read_claims: [],
    write_claims: [],
    forbidden_paths: listAt(item.text, 'forbidden_paths'),
    contracts: {
      inputs: listInNested(item.text, 'contracts', 'inputs'),
      outputs: listInNested(item.text, 'contracts', 'outputs'),
      invariants: listInNested(item.text, 'contracts', 'invariants'),
      non_goals: listInNested(item.text, 'contracts', 'non_goals'),
    },
    handoff: { inputs: [], outputs: [], include_private_reasoning: false },
    verification: listAt(item.text, 'verification'),
    stop_rules: ['stop until an operator maps V1 paths and handoff digests'],
    risk: scalarValue(blockScalar(item.text, 'risk')) || 'high',
    control_plane_critical: true,
    complexity: scalarValue(blockScalar(item.text, 'complexity')) || 'reasoning',
    agent_role: 'implementer',
    model_role: legacyModelProfile(scalarValue(blockScalar(item.text, 'model_role'))),
    capabilities: ['read', 'write', 'execute'],
    decision_domains: [],
    max_attempts: Number(scalarValue(blockScalar(item.text, 'max_attempts')) || 2),
  }));
  return {
    v: 3,
    spec_path: scalarValue(topScalar(source, 'spec')) || 'SPECIFICATION.md',
    environment_contract: null,
    acceptance_criteria: criteria.map((id) => ({ id, proved_by: [] })),
    lots,
  };
}

export function buildV1Migration({ stateText, planText, packageRef, at = new Date().toISOString() }) {
  const snapshot = inspectV1State(stateText);
  const planVersion = Number(scalarValue(topScalar(normalizeText(planText), 'version')) || 0);
  if (snapshot.version !== 1 || planVersion !== 1) fail('factory-migration-not-v1', `migration accepts version 1 only (state=${snapshot.version}, plan=${planVersion})`);
  const plan = migrateV1Plan(planText);
  const legacyPaths = Object.fromEntries(itemBlocks(normalizeText(planText), 'lots').map((item) => [item.id, listAt(item.text, 'allowed_paths')]));
  const blockers = [
    'V3 plan needs operator mapping of every imported legacy path to exact/prefix write_claims.',
    'Acceptance criteria need explicit proved_by test IDs.',
    'Legacy completed lots have no machine-verifiable independent review and remain unreviewed.',
    'Legacy release readiness is an attestation without a V3 basis and must be re-established.',
    'A candidate SHA is mandatory even when acceptance was not applicable.',
  ];
  const event = buildEvent([], {
    run_id: `MIG-${sha256(`${packageRef}\n${normalizeText(stateText)}\n${normalizeText(planText)}`).slice(0, 20)}`,
    type: 'legacy_v1_imported',
    at,
    controller_id: 'factory-v1-migration',
    expected_previous_seq: 0,
    actor: {
      role: 'migration', execution_id: 'factory-v1-migration',
      capabilities: ['read'],
      model: { planned: null, requested: null, used: null, model_family: 'legacy-unknown-family' },
    },
    subject: { package: packageRef, lot_id: null },
    basis: { spec_sha256: null, plan_sha256: canonicalHash(plan), candidate_sha: null, diff_sha256: null },
    data: {
      source: {
        factory_state_sha256: sha256(normalizeText(stateText)),
        technical_plan_sha256: sha256(normalizeText(planText)),
      },
      snapshot,
      legacy_paths: legacyPaths,
      migration_status: 'review_required',
      blockers,
    },
  });
  const state = reduceFactory({ plan, events: [event], allowInvalidPlan: true });
  return { plan, events: [event], state, report: { status: 'review_required', blockers, source_snapshot: snapshot } };
}

export function migrateV1Package({ repoRoot, packageDir, apply = false, at }) {
  const stateFile = path.join(packageDir, 'factory-state.yaml');
  const planFile = path.join(packageDir, 'technical-plan.yaml');
  const targetDir = path.join(packageDir, 'factory');
  if (!fs.existsSync(stateFile) || !fs.existsSync(planFile)) fail('factory-migration-source-missing', 'factory-state.yaml and technical-plan.yaml are both required');
  if (fs.existsSync(path.join(targetDir, 'events.v3.jsonl')) || fs.existsSync(path.join(targetDir, 'state.v3.json')) || fs.existsSync(path.join(targetDir, 'plan.v3.json'))) {
    fail('factory-migration-target-exists', 'V3 factory files already exist; migration never overwrites them');
  }
  const packageRef = path.relative(repoRoot, packageDir).split(path.sep).join('/');
  const result = buildV1Migration({ stateText: fs.readFileSync(stateFile, 'utf8'), planText: fs.readFileSync(planFile, 'utf8'), packageRef, at });
  if (!apply) return { ...result, applied: false };
  assertPackageClean(repoRoot, packageDir);
  fs.mkdirSync(targetDir, { recursive: true });
  writeNew(path.join(targetDir, 'plan.v3.json'), canonicalJsonPretty(result.plan));
  writeNew(path.join(targetDir, 'events.v3.jsonl'), serializeEventLog(result.events));
  writeNew(path.join(targetDir, 'state.v3.json'), canonicalJsonPretty(result.state));
  return { ...result, applied: true };
}

function assertPackageClean(repoRoot, packageDir) {
  const relative = path.relative(repoRoot, packageDir) || '.';
  const result = spawnSync('git', ['status', '--porcelain', '--', relative], { cwd: repoRoot, encoding: 'utf8', env: minimalChildEnvironment() });
  if (result.status !== 0) fail('factory-migration-git-status', result.stderr.trim() || 'git status failed');
  if (result.stdout.trim()) fail('factory-migration-dirty-package', `migration target has uncommitted changes: ${relative}`);
}

function writeNew(file, content) {
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function topScalar(text, key) {
  const match = text.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.*)$`, 'm'));
  return match?.[1];
}

function mapSection(text, name, keys) {
  const section = sectionUnder(text, name);
  return Object.fromEntries(keys.map((key) => [key, scalarValue(blockScalar(section, key))]));
}

function parseLotMap(text) {
  const section = sectionUnder(text, 'lots');
  const lines = section.split('\n');
  const lots = {};
  let current = null;
  for (const line of lines) {
    const match = line.match(/^  ([A-Za-z0-9._-]+):\s*$/);
    if (match) { current = match[1]; lots[current] = {}; continue; }
    if (!current) continue;
    const field = line.match(/^    ([A-Za-z_][\w-]*):\s*(.*)$/);
    if (field) lots[current][field[1]] = scalarValue(field[2]);
  }
  return lots;
}

function sectionUnder(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${escapeRegExp(name)}:\\s*$`).test(line));
  if (start === -1) return '';
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] && !/^\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n');
}

function blockScalar(text, key) {
  const match = text.match(new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.*)$`, 'm'));
  return match?.[1];
}

function listAt(text, key, indent) {
  const prefix = indent === undefined ? '\\s*' : ` {${indent}}`;
  const inline = text.match(new RegExp(`^${prefix}${escapeRegExp(key)}:\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (inline) return splitInline(inline[1]);
  const lines = text.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${prefix}${escapeRegExp(key)}:\\s*$`).test(line));
  if (start === -1) return [];
  const base = lines[start].match(/^\s*/)[0].length;
  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const depth = lines[index].match(/^\s*/)[0].length;
    if (lines[index].trim() && depth <= base) break;
    const item = lines[index].match(/^\s*-\s+(.*)$/);
    if (item) values.push(scalarValue(item[1]));
  }
  return values.filter(Boolean);
}

function listInNested(text, parent, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^\\s*${escapeRegExp(parent)}:\\s*$`).test(line));
  if (start === -1) return [];
  const base = lines[start].match(/^\s*/)[0].length;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const depth = lines[index].match(/^\s*/)[0].length;
    if (lines[index].trim() && depth <= base) break;
    body.push(lines[index]);
  }
  return listAt(body.join('\n'), key);
}

function itemBlocks(text, key) {
  const section = sectionUnder(text, key);
  const lines = section.split('\n');
  const items = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(/^\s*-\s+id:\s*(.*)$/);
    if (match) { current = { id: scalarValue(match[1]), text: '' }; items.push(current); }
    else if (current) current.text += `${line}\n`;
  }
  return items;
}

function splitInline(value) {
  if (!value.trim()) return [];
  return value.split(',').map(scalarValue).filter(Boolean);
}

function scalarValue(value) {
  if (value === undefined || value === null) return null;
  const clean = String(value).replace(/\s+#.*$/, '').trim();
  if (!clean || clean === 'null' || clean === '~') return null;
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) return clean.slice(1, -1);
  return clean;
}

function legacyModelProfile(value) {
  if (value === 'reviewer') return 'reviewer';
  if (value === 'bounded_implementation') return 'standard';
  if (['economy', 'standard', 'expert'].includes(value)) return value;
  return 'expert';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
