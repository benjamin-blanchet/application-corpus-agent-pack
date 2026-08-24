#!/usr/bin/env node
//
// Deterministic validation of the factory artefacts in a spec package.
//
// The factory's guarantees are written in skills, and a skill is read by a
// model when it happens to. This file is what makes the same guarantees hold
// when nobody is reading: an invalid state, code before approval, a cyclic
// dependency graph, two lots owning one path in the same wave, an uncovered
// acceptance criterion, a lot with no verification, absent model provenance
// and an inconsistent tested SHA are rejected here rather than noticed later.
//
// Usage:
//   node scripts/validate-factory.mjs                 every package under doc/spec/
//   node scripts/validate-factory.mjs <package-dir>   one package
//   node scripts/validate-factory.mjs --self-test     fixtures, valid and invalid
//   node scripts/validate-factory.mjs --json
//
// Exit codes, three-valued as everywhere in the pack:
//   0  clean · 1  the validator itself failed · 2  at least one finding
//
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const jsonMode = argv.includes('--json');
const selfTest = argv.includes('--self-test');
const target = argv.find((a) => !a.startsWith('--'));

// The only states the factory recognises, in order. A package in an
// undeclared state has gates that cannot be checked.
const STATES = [
  'specification_pending_approval',
  'specification_approved',
  'technical_plan_awaiting_approval',
  'implementation_in_progress',
  'implementation_completed',
  'consolidated_review_completed',
  'corpus_closed',
  'acceptance_ready',
  'acceptance_completed',
  'release_ready',
  'human_merge_pending',
];
const IMPLEMENTING = STATES.indexOf('implementation_in_progress');
const PLANNED = STATES.indexOf('technical_plan_awaiting_approval');
const RELEASING = STATES.indexOf('release_ready');

// ---------------------------------------------------------------------------
// Minimal YAML reading. Deliberately small: this validates a template-shaped
// file, and a full parser would be a dependency for no additional guarantee.

function readText(abs) {
  const raw = fs.readFileSync(abs, 'utf8');
  const noBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return noBom.replace(/\r\n/g, '\n');
}

function scalar(raw) {
  if (raw === undefined || raw === null) return undefined;
  let v = String(raw).trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v.replace(/\s+#.*$/, '').trim();
}

// A key at the given block's own indentation, never a nested one: reading the
// first match anywhere lets a nested map answer for its parent.
function keyAt(block, name) {
  const lines = block.split('\n').filter((l) => /^\s*[A-Za-z_][\w-]*:/.test(l));
  if (lines.length === 0) return undefined;
  const base = Math.min(...lines.map((l) => l.match(/^\s*/)[0].length));
  for (const line of lines) {
    const m = line.match(new RegExp(`^(\\s*)${name}:\\s*(.*)$`));
    if (m && m[1].length === base) return scalar(m[2]) || undefined;
  }
  return undefined;
}

// Everything nested under a top-level key, stopping at the next key at the
// same depth.
function sectionUnder(text, name, atIndent) {
  const lines = text.split('\n');
  const anchor = atIndent === undefined ? `^(\\s*)${name}:` : `^( {${atIndent}})${name}:`;
  const start = lines.findIndex((l) => new RegExp(`${anchor}\\s*(\\[.*\\])?\\s*$`).test(l));
  if (start === -1) return '';
  const indent = lines[start].match(/^\s*/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() && lines[i].match(/^\s*/)[0].length <= indent) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

// `atIndent` anchors the lookup, because the same key name appears at two
// depths: a plan declares `acceptance_criteria` at the top level and every lot
// declares its own. An unanchored match reads a lot's list as the plan's, and
// then reports every criterion the other lots cover as undeclared.
function inlineList(text, name, atIndent) {
  const pattern = atIndent === undefined ? `^\\s*${name}:` : `^ {${atIndent}}${name}:`;
  const m = text.match(new RegExp(`${pattern}\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (!m) return null;
  return m[1].split(',').map((x) => scalar(x)).filter(Boolean);
}

function listOf(text, name, atIndent) {
  const inline = inlineList(text, name, atIndent);
  if (inline) return inline;
  return sectionUnder(text, name, atIndent)
    .split('\n')
    .map((l) => (l.match(/^\s*-\s+(.*)$/) || [])[1])
    .filter(Boolean)
    .map((v) => scalar(v))
    .filter(Boolean);
}

// One block per `- id:` under a named key.
function itemsUnder(text, name, atIndent) {
  const section = sectionUnder(text, name, atIndent);
  if (!section) return [];
  const lines = section.split('\n');
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^(\s*)-\s+id:\s*(.*)$/);
    if (m) {
      current = { id: scalar(m[2]), text: line.replace(/^(\s*)-\s+/, '$1  ') + '\n' };
      out.push(current);
    } else if (current) current.text += line + '\n';
  }
  return out;
}

// A mapping whose keys are the ids: `lots:\n  LOT-1:\n    status: ...`
function mappingUnder(text, name) {
  const section = sectionUnder(text, name);
  const lines = section.split('\n');
  const keyed = lines.filter((l) => /^\s*\S+:\s*$/.test(l));
  if (keyed.length === 0) return [];
  const base = Math.min(...keyed.map((l) => l.match(/^\s*/)[0].length));
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^(\s*)(\S+):\s*$/);
    if (m && m[1].length === base) {
      current = { id: m[2], text: '' };
      out.push(current);
    } else if (current) current.text += line + '\n';
  }
  return out;
}

// ---------------------------------------------------------------------------

function validatePackage(rootDir, dirRel, findings) {
  const add = (severity, code, message, file) => findings.push({ severity, code, message, file });
  const dirAbs = path.join(rootDir, dirRel);
  const hasState = fs.existsSync(path.join(dirAbs, 'factory-state.yaml'));
  const hasPlan = fs.existsSync(path.join(dirAbs, 'technical-plan.yaml'));
  if (!hasState && !hasPlan) return;

  const stateRel = `${dirRel}/factory-state.yaml`;
  const planRel = `${dirRel}/technical-plan.yaml`;

  if (!hasState) {
    add('P0', 'factory-state-missing', 'technical-plan.yaml exists without factory-state.yaml; a plan with no recorded state cannot be gated', planRel);
    return;
  }

  const state = readText(path.join(dirAbs, 'factory-state.yaml'));
  const stateName = keyAt(state, 'state');
  const stage = STATES.indexOf(stateName);

  if (stage === -1) {
    add('P0', 'factory-unknown-state', `state: ${stateName} is not a declared transition`, stateRel);
  }

  const specSection = sectionUnder(state, 'spec');
  const specStatus = keyAt(specSection, 'status');
  const specApprover = keyAt(specSection, 'approved_by');
  const planStatus = keyAt(sectionUnder(state, 'technical_plan'), 'status');

  // Code before approval — the failure the whole gate model exists to prevent.
  if (stage >= IMPLEMENTING) {
    if (specStatus !== 'approved' || !specApprover || specApprover === 'null') {
      add('P0', 'factory-implementation-without-spec-approval', `state is ${stateName} but no human approval of the specification is recorded`, stateRel);
    }
    if (planStatus !== 'approved') {
      add('P0', 'factory-implementation-without-plan-approval', `state is ${stateName} but the technical plan is not approved`, stateRel);
    }
  }

  // Provenance. A proof is only a proof of the revision it was produced against.
  if (stage >= RELEASING) {
    const acceptance = keyAt(sectionUnder(state, 'gates'), 'acceptance');
    const sha = keyAt(state, 'tested_code_sha');
    if (acceptance === 'not_applicable') {
      const reason = keyAt(state, 'acceptance_not_applicable_reason');
      const approver = keyAt(state, 'acceptance_not_applicable_approved_by');
      if (!reason || reason === 'null' || !approver || approver === 'null') {
        add('P0', 'factory-acceptance-waived-without-reason', 'acceptance is not_applicable with no written reason and no named approver; a waiver is a decision, not a default', stateRel);
      }
    } else if (!sha || sha === 'null' || sha.length < 40) {
      add('P0', 'factory-release-without-tested-sha', `${stateName} requires a full tested_code_sha; an absent or abbreviated SHA cannot bind evidence to a revision`, stateRel);
    }
  }

  for (const lot of mappingUnder(state, 'lots')) {
    if (keyAt(lot.text, 'status') === 'completed') {
      const used = keyAt(lot.text, 'model_used');
      if (!used || used === 'null') {
        add('P1', 'factory-lot-without-model-provenance', `${lot.id} is completed with no model_used; planned, requested and used legitimately differ, and the difference is what an audit needs`, stateRel);
      }
    }
  }

  if (!hasPlan) {
    if (stage >= PLANNED) add('P0', 'factory-plan-missing', `state is ${stateName} but technical-plan.yaml does not exist`, stateRel);
    return;
  }

  const plan = readText(path.join(dirAbs, 'technical-plan.yaml'));
  const lots = itemsUnder(plan, 'lots', 0).map((l) => ({
    id: l.id,
    criteria: listOf(l.text, 'acceptance_criteria'),
    deps: listOf(l.text, 'dependencies'),
    allowed: listOf(l.text, 'allowed_paths'),
    verification: listOf(l.text, 'verification'),
  }));

  if (lots.length === 0) add('P1', 'factory-plan-without-lots', 'the plan declares no lot', planRel);

  const byId = new Map(lots.map((l) => [l.id, l]));
  const colour = new Map();
  const reported = new Set();
  const visit = (id, trail) => {
    if (colour.get(id) === 'done') return;
    if (colour.get(id) === 'open') {
      const key = [...trail.slice(trail.indexOf(id)), id].join('->');
      if (!reported.has(key)) {
        reported.add(key);
        add('P0', 'factory-dag-cycle', `dependency cycle: ${[...trail, id].join(' -> ')}`, planRel);
      }
      return;
    }
    colour.set(id, 'open');
    for (const dep of byId.get(id)?.deps || []) if (byId.has(dep)) visit(dep, [...trail, id]);
    colour.set(id, 'done');
  };
  for (const lot of lots) visit(lot.id, []);

  for (const lot of lots) {
    for (const dep of lot.deps) {
      if (!byId.has(dep)) add('P1', 'factory-unknown-dependency', `${lot.id} depends on ${dep}, which is not declared`, planRel);
    }
    if (lot.verification.length === 0) {
      add('P1', 'factory-lot-without-verification', `${lot.id} declares no verification; a lot that cannot be verified alone is not a lot`, planRel);
    }
  }

  // One path, one owner, per wave. Two lots sharing a path in one wave is a
  // collision even when their workers promise to coordinate.
  for (const [i, wave] of waves(lots, byId).entries()) {
    const owners = new Map();
    for (const lot of wave) {
      for (const p of lot.allowed) {
        if (owners.has(p)) add('P0', 'factory-path-collision', `wave ${i + 1}: ${owners.get(p)} and ${lot.id} both own ${p}`, planRel);
        else owners.set(p, lot.id);
      }
    }
  }

  const declared = listOf(plan, 'acceptance_criteria', 0)
    .concat(itemsUnder(plan, 'acceptance_criteria', 0).map((c) => c.id))
    .filter(Boolean);
  const covered = new Set(lots.flatMap((l) => l.criteria));
  for (const c of new Set(declared)) {
    if (!covered.has(c)) {
      add('P0', 'factory-criterion-uncovered', `${c} is covered by no lot; an uncovered criterion is a planning defect, not a later surprise`, planRel);
    }
  }
  for (const c of covered) {
    if (declared.length && !declared.includes(c)) {
      add('P1', 'factory-criterion-unknown', `a lot covers ${c}, which the plan does not declare`, planRel);
    }
  }

  // Reviewer capacity. Generating faster than anyone can review converts a
  // delivery gain into a queue, and the queue is invisible until it exists.
  const budget = sectionUnder(plan, 'review_budget');
  if (budget && keyAt(budget, 'exceeds_capacity') === 'true' && keyAt(budget, 'operator_accepted_queue') !== 'true') {
    add('P1', 'factory-review-budget-exceeded', 'the review budget exceeds remaining capacity with no recorded operator acceptance; split the change or record the decision', planRel);
  }
}

function waves(lots, byId) {
  const out = [];
  const done = new Set();
  let rest = [...lots];
  while (rest.length) {
    const ready = rest.filter((l) => l.deps.every((d) => !byId.has(d) || done.has(d)));
    if (ready.length === 0) break; // cycle, already reported
    out.push(ready);
    ready.forEach((l) => done.add(l.id));
    rest = rest.filter((l) => !done.has(l.id));
  }
  return out;
}

function packagesUnder(rootDir, rel) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (r) => {
    for (const entry of fs.readdirSync(path.join(rootDir, r), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = `${r}/${entry.name}`;
      // The shipped template is a shape, not a package: its placeholders are
      // deliberately empty and validating them reports the template as broken.
      if (entry.name === 'template') continue;
      if (fs.existsSync(path.join(rootDir, child, 'factory-state.yaml'))) out.push(child);
      else walk(child);
    }
  };
  walk(rel);
  return out;
}

// ---------------------------------------------------------------------------

if (selfTest) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-selftest-'));
  const write = (name, state, plan) => {
    fs.mkdirSync(path.join(tmp, name), { recursive: true });
    fs.writeFileSync(path.join(tmp, name, 'factory-state.yaml'), state);
    if (plan) fs.writeFileSync(path.join(tmp, name, 'technical-plan.yaml'), plan);
  };
  const okState = [
    'version: 1',
    'state: implementation_in_progress',
    'spec:',
    '  status: approved',
    '  approved_by: operator',
    'technical_plan:',
    '  status: approved',
    'gates:',
    '  acceptance: pending',
    'lots:',
    '  LOT-1:',
    '    status: pending',
    '    model_used: null',
    'tested_code_sha: null',
    '',
  ].join('\n');
  const okPlan = [
    'version: 1',
    'acceptance_criteria: [AC1]',
    'lots:',
    '  - id: LOT-1',
    '    acceptance_criteria: [AC1]',
    '    allowed_paths:',
    '      - src/a',
    '    dependencies: []',
    '    verification: [unit]',
    '',
  ].join('\n');

  write('valid', okState, okPlan);
  write('no-spec-approval', okState.replace('  status: approved\n  approved_by: operator', '  status: pending\n  approved_by: null'), okPlan);
  write('cycle', okState, [
    'version: 1', 'acceptance_criteria: [AC1]', 'lots:',
    '  - id: LOT-1', '    acceptance_criteria: [AC1]', '    dependencies: [LOT-2]', '    verification: [x]',
    '  - id: LOT-2', '    acceptance_criteria: [AC1]', '    dependencies: [LOT-1]', '    verification: [x]', '',
  ].join('\n'));
  write('path-collision', okState, [
    'version: 1', 'acceptance_criteria: [AC1]', 'lots:',
    '  - id: LOT-1', '    acceptance_criteria: [AC1]', '    allowed_paths:', '      - src/a', '    dependencies: []', '    verification: [x]',
    '  - id: LOT-2', '    acceptance_criteria: [AC1]', '    allowed_paths:', '      - src/a', '    dependencies: []', '    verification: [x]', '',
  ].join('\n'));
  write('uncovered-criterion', okState, [
    'version: 1', 'acceptance_criteria: [AC1, AC2]', 'lots:',
    '  - id: LOT-1', '    acceptance_criteria: [AC1]', '    dependencies: []', '    verification: [x]', '',
  ].join('\n'));
  write('no-verification', okState, [
    'version: 1', 'acceptance_criteria: [AC1]', 'lots:',
    '  - id: LOT-1', '    acceptance_criteria: [AC1]', '    dependencies: []', '    verification: []', '',
  ].join('\n'));
  write('release-without-sha', okState.replace('state: implementation_in_progress', 'state: release_ready'), okPlan);
  write('completed-lot-without-model', okState.replace('    status: pending\n    model_used: null', '    status: completed\n    model_used: null'), okPlan);

  const cases = [
    ['valid', []],
    ['no-spec-approval', ['factory-implementation-without-spec-approval']],
    ['cycle', ['factory-dag-cycle']],
    ['path-collision', ['factory-path-collision']],
    ['uncovered-criterion', ['factory-criterion-uncovered']],
    ['no-verification', ['factory-lot-without-verification']],
    ['release-without-sha', ['factory-release-without-tested-sha']],
    ['completed-lot-without-model', ['factory-lot-without-model-provenance']],
  ];

  let failed = 0;
  for (const [name, expected] of cases) {
    const findings = [];
    validatePackage(tmp, name, findings);
    const codes = new Set(findings.map((f) => f.code));
    const missing = expected.filter((c) => !codes.has(c));
    const spurious = expected.length === 0 ? [...codes] : [];
    if (missing.length === 0 && spurious.length === 0) console.log(`ok    ${name}`);
    else {
      failed += 1;
      console.log(`FAIL  ${name}`);
      if (missing.length) console.log(`        expected but absent: ${missing.join(', ')}`);
      if (spurious.length) console.log(`        unexpected: ${spurious.join(', ')}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${cases.length - failed}/${cases.length} passing`);
  process.exit(failed ? 2 : 0);
}

const root = process.cwd();
const findings = [];
const packages = target ? [target.replace(/\/+$/, '')] : packagesUnder(root, 'doc/spec');
for (const pkg of packages) validatePackage(root, pkg, findings);

const counts = findings.reduce((a, f) => ({ ...a, [f.severity]: (a[f.severity] || 0) + 1 }), {});
if (jsonMode) {
  console.log(JSON.stringify({ summary: { packages: packages.length, counts }, findings }, null, 2));
} else {
  console.log(`Factory validation — ${packages.length} package(s)`);
  console.log(`P0: ${counts.P0 || 0}  P1: ${counts.P1 || 0}`);
  for (const f of findings) console.log(`[${f.severity}] ${f.code}: ${f.message} (${f.file})`);
  if (!findings.length) console.log('No findings.');
}
process.exit(findings.length ? 2 : 0);
