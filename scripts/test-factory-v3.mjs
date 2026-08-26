#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { canonicalHash, canonicalJson, canonicalJsonPretty, deepCopy, fileHash } from './lib/factory-v3/canonical-json.mjs';
import { validateActorCapabilities, validateEffectiveCapabilities } from './lib/factory-v3/capabilities.mjs';
import { EVENT_TYPES, PHASES, validatePlan } from './lib/factory-v3/contract.mjs';
import { appendEventFile, buildEvent, parseEventLog, serializeEventLog, validateEventChain } from './lib/factory-v3/event-log.mjs';
import { classifyArtifactPath, invalidateState, invalidatedGates } from './lib/factory-v3/invalidation.mjs';
import { buildV1Migration } from './lib/factory-v3/legacy-v1.mjs';
import { loadFactoryPackage, validateFactoryPackageV3 } from './lib/factory-v3/package-io.mjs';
import { claimsOverlap, normalizeRepoPath } from './lib/factory-v3/path-claims.mjs';
import {
  observedSourceTreeDigest,
  validateEvidenceDeltaPaths,
  validateEvidenceManifest,
  validateReleaseProvenance,
} from './lib/factory-v3/provenance.mjs';
import { reduceFactory, stateMatchesDerived } from './lib/factory-v3/reducer.mjs';
import { nextWave, validateLotResult, validateReservedWave } from './lib/factory-v3/scheduler.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'factory-fixtures', 'v3');
const fixtureCatalog = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'blocking-cases.json'), 'utf8'));
const fixtures = new Map(fixtureCatalog.map((fixture) => [fixture.id, fixture]));
const RUN_ID = 'RUN-FACTORY-V3-TEST';
const PACKAGE = 'doc/spec/test/factory-v3';
const AT = '2026-08-26T10:00:00.000Z';
const SHA = Object.freeze({
  spec: '1'.repeat(64),
  diff1: '2'.repeat(64),
  diff2: '3'.repeat(64),
  integration: '4'.repeat(64),
  corpus: '5'.repeat(64),
  tests: '6'.repeat(64),
  manifest: '7'.repeat(64),
  candidate: 'a'.repeat(40),
  otherCandidate: 'b'.repeat(40),
  evidence: 'c'.repeat(40),
});

const actors = Object.freeze({
  controller: actor('controller', 'controller-1', ['read', 'write', 'execute']),
  implementer: actor('implementer', 'worker-1', ['read', 'write', 'execute'], 'standard', 'model-standard'),
  reviewer: actor('reviewer', 'reviewer-1', ['read', 'execute'], 'reviewer', 'model-reviewer'),
  acceptance: actor('acceptance', 'acceptance-1', ['read', 'execute'], 'expert', 'model-expert'),
  delivery: actor('delivery', 'delivery-1', ['read', 'execute', 'open_pr'], 'expert', 'model-expert'),
});

test('fixture catalog contains at least 18 unique blocking scenarios', () => {
  assert.ok(fixtureCatalog.length >= 18);
  assert.equal(fixtures.size, fixtureCatalog.length);
  for (const fixture of fixtureCatalog) {
    assert.match(fixture.id, /^BF-\d{3}$/);
    assert.ok(fixture.expected_code);
  }
});

test('canonical JSON and hashing are stable across object insertion order', () => {
  const left = { z: 1, nested: { b: true, a: 'x' }, a: [2, 1] };
  const right = { a: [2, 1], nested: { a: 'x', b: true }, z: 1 };
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(canonicalHash(left), canonicalHash(right));
  assert.equal(canonicalJson({ n: -0 }), '{"n":0}');
});

test('JSON schemas and executable vocabularies stay aligned', () => {
  const eventSchema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'factory', 'v3', 'event.schema.json'), 'utf8'));
  const stateSchema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'factory', 'v3', 'state.schema.json'), 'utf8'));
  const planSchema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schemas', 'factory', 'v3', 'plan.schema.json'), 'utf8'));
  assert.deepEqual([...eventSchema.properties.type.enum].sort(), [...EVENT_TYPES].sort());
  assert.deepEqual(stateSchema.properties.phase.enum, PHASES);
  assert.deepEqual(planSchema.$defs.lot.properties.model_role.enum, ['economy', 'standard', 'expert']);
  assert.deepEqual(planSchema.$defs.lot.properties.agent_role.enum, ['implementer', 'migration']);
  assert.equal(planSchema.$defs.lot.properties.max_attempts.maximum, 2);
  assert.equal(planSchema.$defs.lot.properties.capabilities.items.enum.includes('git_commit'), false);
  assert.equal(eventSchema.properties.actor.properties.capabilities.items.enum.includes('git_commit'), false);
});

test('[BF-001] non-canonical JSONL is rejected', () => {
  const events = approvedHistory(validPlan()).slice(0, 1);
  expectCode('BF-001', () => parseEventLog(`${JSON.stringify(events[0])}\n`));
});

test('[BF-002] mutation of a prior event breaks the hash chain', () => {
  const events = approvedHistory(validPlan()).slice(0, 2);
  events[0].data.injected = true;
  expectFinding('BF-002', validateEventChain(events));
});

test('[BF-003] run_id cannot change inside one event stream', () => {
  const events = approvedHistory(validPlan()).slice(0, 2);
  events[1].run_id = 'RUN-DIFFERENT';
  expectFinding('BF-003', validateEventChain(events));
});

test('non-object event records produce deterministic findings instead of crashing', () => {
  const findings = validateEventChain([null]);
  assert.ok(findings.some((finding) => finding.code === 'factory-event-not-object'));
  assert.throws(() => reduceFactory({ plan: validPlan(), events: [null] }), (error) => error.code === 'factory-event-not-object');
});

test('[BF-004] optimistic append rejects a stale expected sequence', () => {
  const events = approvedHistory(validPlan()).slice(0, 1);
  expectCode('BF-004', () => buildEvent(events, eventInput('package_initialized', {}, { expected_previous_seq: 0 })));
});

test('[BF-005] dependency cycles are blocking plan findings', () => {
  const plan = validPlan([
    lot('LOT-1', { dependencies: ['LOT-2'], write_claims: [{ kind: 'prefix', path: 'src/a' }] }),
    lot('LOT-2', { dependencies: ['LOT-1'], write_claims: [{ kind: 'prefix', path: 'src/b' }] }),
  ]);
  expectFinding('BF-005', validatePlan(plan));
});

test('[BF-006] a dependency and its consumer cannot run in the same wave', () => {
  const plan = validPlan([
    lot('LOT-1', { write_claims: [{ kind: 'prefix', path: 'src/a' }] }),
    lot('LOT-2', { dependencies: ['LOT-1'], write_claims: [{ kind: 'prefix', path: 'src/b' }] }),
  ]);
  const state = reduceFactory({ plan, events: approvedHistory(plan) });
  assert.deepEqual(nextWave(plan, state).map((item) => item.lot_id), ['LOT-1']);
  expectFinding('BF-006', validateReservedWave(plan, state, [
    { lot_id: 'LOT-1', reservation_id: 'RES-1' },
    { lot_id: 'LOT-2', reservation_id: 'RES-2' },
  ]));
});

test('[BF-007] normalized parent/child claims collide', () => {
  const plan = validPlan([
    lot('LOT-1', { write_claims: [{ kind: 'prefix', path: './src/a/' }] }),
    lot('LOT-2', { write_claims: [{ kind: 'exact', path: 'src/a/file.js' }] }),
  ]);
  const state = reduceFactory({ plan, events: approvedHistory(plan) });
  expectFinding('BF-007', validateReservedWave(plan, state, [
    { lot_id: 'LOT-1', reservation_id: 'RES-1' },
    { lot_id: 'LOT-2', reservation_id: 'RES-2' },
  ]));
  assert.equal(claimsOverlap(plan.lots[0].write_claims[0], plan.lots[1].write_claims[0]), true);
  assert.equal(normalizeRepoPath('./src/a/'), 'src/a');
});

test('[BF-008] a worker result cannot escape its active reservation', () => {
  const plannedLot = lot('LOT-1');
  const findings = validateLotResult(plannedLot, result(SHA.diff1, ['src/elsewhere.js']), {
    status: 'active', lot_id: 'LOT-1', claims: plannedLot.write_claims,
  });
  expectFinding('BF-008', findings);
});

test('[BF-009] a result cannot touch a forbidden subtree', () => {
  const plannedLot = lot('LOT-1', {
    write_claims: [{ kind: 'prefix', path: 'src' }],
    forbidden_paths: ['src/private'],
  });
  const findings = validateLotResult(plannedLot, result(SHA.diff1, ['src/private/key.js']), {
    status: 'active', lot_id: 'LOT-1', claims: plannedLot.write_claims,
  });
  expectFinding('BF-009', findings);
});

test('[BF-010] economy is forbidden for control-plane-critical work', () => {
  const plan = validPlan([lot('LOT-1', { model_role: 'economy', control_plane_critical: true })]);
  expectFinding('BF-010', validatePlan(plan));
});

test('[BF-011] only delivery may receive open-PR capability', () => {
  const plan = validPlan([lot('LOT-1', { capabilities: ['read', 'write', 'execute', 'open_pr'] })]);
  expectFinding('BF-011', validatePlan(plan));
  expectFinding('BF-011', validateActorCapabilities({ role: 'implementer', capabilities: ['read', 'open_pr'] }));
});

test('effective capabilities must exactly match the bounded work package', () => {
  const plannedLot = lot('LOT-1');
  assert.equal(validateEffectiveCapabilities(plannedLot, actors.implementer).length, 0);
  assert.ok(validateEffectiveCapabilities(plannedLot, { capabilities: ['read', 'write', 'execute', 'network'] }).some((finding) => finding.code === 'factory-capability-not-authorized'));
  assert.ok(validateEffectiveCapabilities(plannedLot, { capabilities: ['read'] }).some((finding) => finding.code === 'factory-capability-not-effective'));
});

test('[BF-012] a lot author cannot review their own diff', () => {
  const plan = validPlan();
  const events = throughLotResult(plan);
  push(events, 'lot_reviewed', {
    diff_sha256: SHA.diff1, verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: { ...deepCopy(actors.reviewer), execution_id: actors.implementer.execution_id } });
  expectCode('BF-012', () => reduceFactory({ plan, events }));
});

test('[BF-013] review findings must be actionable and structured', () => {
  const plan = validPlan();
  const events = throughLotResult(plan);
  push(events, 'lot_reviewed', {
    diff_sha256: SHA.diff1,
    verdict: 'failed',
    fresh_context: true,
    findings: [{ severity: 'P0', status: 'open' }],
  }, { lotId: 'LOT-1', actor: actors.reviewer });
  expectCode('BF-013', () => reduceFactory({ plan, events }));
});

test('[BF-014] correction/re-review loops stop at the plan attempt budget', () => {
  const plan = validPlan([lot('LOT-1', { max_attempts: 2 })]);
  const events = throughLotResult(plan);
  pushFailedReview(events, SHA.diff1, 'finding-1');
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'lot_result_reported', { result: result(SHA.diff2, ['src/app/fixed.js']) }, { lotId: 'LOT-1', actor: actors.implementer });
  pushFailedReview(events, SHA.diff2, 'finding-2');
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  expectCode('BF-014', () => reduceFactory({ plan, events }));
});

test('[BF-015] a specification change makes a released state stale', () => {
  const state = releasedStateAfterChange(['spec_contract']);
  assert.equal(state.gates.specification.status, 'stale', expected('BF-015'));
  assert.equal(state.gates.release.status, 'stale', expected('BF-015'));
  assert.notEqual(state.phase, 'release_ready', expected('BF-015'));
});

test('[BF-016] an implementation change invalidates reviews through release', () => {
  const state = releasedStateAfterChange(['implementation'], ['LOT-1']);
  assert.equal(state.lots['LOT-1'].status, 'stale', expected('BF-016'));
  assert.equal(state.gates.lot_reviews.status, 'stale', expected('BF-016'));
  assert.equal(state.gates.release.status, 'stale', expected('BF-016'));
});

test('[BF-017] evidence-only changes preserve acceptance but invalidate release', () => {
  const state = releasedStateAfterChange(['evidence']);
  assert.equal(state.gates.acceptance.status, 'waived', expected('BF-017'));
  assert.equal(state.gates.evidence.status, 'stale', expected('BF-017'));
  assert.equal(state.gates.release.status, 'stale', expected('BF-017'));
});

test('[BF-018] unknown artifact classes fail closed from specification onward', () => {
  const state = releasedStateAfterChange(['new_unclassified_type']);
  assert.equal(state.gates.specification.status, 'stale', expected('BF-018'));
  assert.equal(state.gates.release.status, 'stale', expected('BF-018'));
});

test('invalidation and path classification cover all controlled artifact classes', () => {
  assert.equal(classifyArtifactPath('doc/spec/1/T/SPECIFICATION.md'), 'spec_contract');
  assert.equal(classifyArtifactPath('doc/spec/1/T/factory/plan.v3.json'), 'plan_contract');
  assert.equal(classifyArtifactPath('doc/spec/1/T/factory/events.v3.jsonl'), 'control');
  assert.equal(classifyArtifactPath('doc/spec/1/T/evidence/screen.png'), 'evidence');
  assert.equal(classifyArtifactPath('tests/browser.spec.ts'), 'acceptance_script');
  assert.equal(classifyArtifactPath('src/index.js'), 'implementation');
  assert.deepEqual(invalidatedGates(['control']), []);
});

test('[BF-019] passing acceptance must test the frozen candidate exactly', () => {
  const plan = validPlan();
  const events = throughCandidate(plan);
  push(events, 'acceptance_started', {}, { actor: actors.acceptance });
  push(events, 'acceptance_completed', {
    status: 'passed', tested_sha: SHA.otherCandidate, test_bundle_sha256: SHA.tests,
  }, { actor: actors.acceptance });
  expectCode('BF-019', () => reduceFactory({ plan, events }));
});

test('[BF-020] an acceptance waiver cannot precede candidate freeze', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  pushWaiver(events);
  expectCode('BF-020', () => reduceFactory({ plan, events }));
});

test('[BF-021] package validation detects a manually edited derived snapshot', (t) => {
  const root = temporary(t);
  const packageDir = path.join(root, 'package');
  const factoryDir = path.join(packageDir, 'factory');
  fs.mkdirSync(factoryDir, { recursive: true });
  const plan = validPlan();
  const events = releasedHistory(plan);
  const state = reduceFactory({ plan, events });
  state.phase = 'draft';
  fs.writeFileSync(path.join(factoryDir, 'plan.v3.json'), canonicalJsonPretty(plan));
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(state));
  expectFinding('BF-021', validateFactoryPackageV3(packageDir));
});

test('[BF-022] V1 release-ready migration remains review-required and non-green', () => {
  const legacy = path.join(fixtureRoot, 'legacy-release-ready');
  const migrated = buildV1Migration({
    stateText: fs.readFileSync(path.join(legacy, 'factory-state.yaml'), 'utf8'),
    planText: fs.readFileSync(path.join(legacy, 'technical-plan.yaml'), 'utf8'),
    packageRef: 'doc/spec/legacy',
    at: AT,
  });
  assert.equal(migrated.report.status, 'review_required', expected('BF-022'));
  assert.notEqual(migrated.state.phase, 'release_ready', expected('BF-022'));
  assert.equal(migrated.state.lots['LOT-1'].status, 'legacy_completed_unreviewed');
  assert.equal(migrated.state.provenance.candidate_sha, null);
  assert.equal(migrated.state.provenance.tested_sha, null);
  assert.equal(migrated.state.provenance.evidence_sha, null);
  assert.deepEqual(migrated.events[0].data.legacy_paths['LOT-1'], ['src']);
  assert.ok(validatePlan(migrated.plan).length > 0);
});

test('migration rejects inputs that are not explicitly V1', () => {
  assert.throws(() => buildV1Migration({
    stateText: 'version: 2\nstate: release_ready\n',
    planText: 'version: 1\nspec: SPECIFICATION.md\nacceptance_criteria: []\nlots: []\n',
    packageRef: 'doc/spec/not-v1',
    at: AT,
  }), (error) => error.code === 'factory-migration-not-v1');
});

test('[BF-023] evidence manifest verifies bytes, not filenames alone', (t) => {
  const packageDir = temporary(t);
  fs.mkdirSync(path.join(packageDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'evidence', 'screen.txt'), 'actual bytes\n');
  const manifest = evidenceManifest({ entryHash: '0'.repeat(64) });
  const options = {
    manifestPath: path.join(packageDir, 'evidence-manifest.json'),
    artifactsRoot: path.join(packageDir, 'evidence'),
    requireFiles: true,
  };
  expectFinding('BF-023', validateEvidenceManifest(manifest, options));
  manifest.artifacts[0].sha256 = `sha256:${fileHash(path.join(packageDir, 'evidence', 'screen.txt'))}`;
  manifest.publication.bundle_digest = `sha256:${canonicalHash(manifest.artifacts)}`;
  assert.deepEqual(validateEvidenceManifest(manifest, options), []);
});

test('[BF-024] evidence commits cannot smuggle application changes', () => {
  const findings = validateEvidenceDeltaPaths(
    ['doc/spec/x/evidence/screen.png', 'src/app.js'],
    [{ kind: 'prefix', path: 'doc/spec/x/evidence' }],
  );
  expectFinding('BF-024', findings);
});

test('[BF-025] failed and blocked acceptance are honest states, never green gates', () => {
  for (const status of ['failed', 'blocked']) {
    const plan = validPlan();
    const events = throughCandidate(plan);
    push(events, 'acceptance_started', {}, { actor: actors.acceptance });
    push(events, 'acceptance_completed', { status, tested_sha: null, reason: `${status} by environment` }, { actor: actors.acceptance });
    const state = reduceFactory({ plan, events });
    assert.equal(state.gates.acceptance.status, status);
    assert.notEqual(state.phase, 'acceptance_complete');
    push(events, 'evidence_committed', {
      evidence_manifest_path: 'factory/evidence-manifest.v3.json',
      evidence_manifest_sha256: SHA.manifest,
      evidence_sha: SHA.evidence,
      publication: { mode: 'evidence_only_commit' },
    });
    expectCode('BF-025', () => reduceFactory({ plan, events }));
  }
});

test('[BF-026] delivery is typed, post-release and draft-only', () => {
  const plan = validPlan();
  const events = releasedHistory(plan);
  expectCode('BF-026', () => push(events, 'draft_pr_planned', {
    draft: false, actions: ['open_draft_pr'], candidate_sha: SHA.candidate, payload_sha256: SHA.manifest,
  }, { actor: actors.delivery }));
});

test('[BF-027] git_push is forbidden even for Delivery', () => {
  expectFinding('BF-027', validateActorCapabilities({ role: 'delivery', capabilities: ['read', 'open_pr', 'git_push'] }));
});

test('[BF-028] a passing campaign cannot hide failed or user-visible-error cases', () => {
  for (const caseResults of [
    [{ id: 'CASE-1', outcome: 'failed', oracle_results: [{ id: 'oracle', outcome: 'failed' }] }],
    ['user_visible_error'],
  ]) {
    const plan = validPlan();
    const events = throughCandidate(plan);
    push(events, 'acceptance_started', {}, { actor: actors.acceptance });
    push(events, 'acceptance_completed', {
      status: 'passed', tested_sha: SHA.candidate, test_bundle_sha256: SHA.tests, case_results: caseResults,
    }, { actor: actors.acceptance });
    expectCode('BF-028', () => reduceFactory({ plan, events }));
  }
});

test('[BF-029] git_commit is forbidden to every factory role', () => {
  expectFinding('BF-029', validatePlan(validPlan([lot('LOT-1', {
    capabilities: ['read', 'write', 'execute', 'git_commit'],
  })])));
  expectFinding('BF-029', validateActorCapabilities({ role: 'delivery', capabilities: ['read', 'open_pr', 'git_commit'] }));
});

test('[BF-030] economy cannot own migration work', () => {
  expectFinding('BF-030', validatePlan(validPlan([lot('LOT-1', { agent_role: 'migration', model_role: 'economy' })])));
});

test('[BF-031] economy cannot receive data_mutation', () => {
  expectFinding('BF-031', validatePlan(validPlan([lot('LOT-1', {
    model_role: 'economy', capabilities: ['read', 'write', 'execute', 'data_mutation'],
  })])));
});

test('[BF-032] attempt budgets greater than two are rejected', () => {
  expectFinding('BF-032', validatePlan(validPlan([lot('LOT-1', { max_attempts: 3 })])));
});

test('[BF-033] a running reservation cannot be released without a typed terminal event', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'reservation_released', { reservation_id: 'RES-1' }, { lotId: 'LOT-1' });
  expectCode('BF-033', () => reduceFactory({ plan, events }));
});

test('[BF-034] upstream invalidation stales every transitive dependent and no unrelated lot', () => {
  const plan = validPlan([
    lot('LOT-A', { write_claims: [{ kind: 'prefix', path: 'src/a' }] }),
    lot('LOT-B', { dependencies: ['LOT-A'], write_claims: [{ kind: 'prefix', path: 'src/b' }] }),
    lot('LOT-C', { dependencies: ['LOT-B'], write_claims: [{ kind: 'prefix', path: 'src/c' }] }),
    lot('LOT-D', { write_claims: [{ kind: 'prefix', path: 'src/d' }] }),
  ]);
  const state = reduceFactory({ plan, events: approvedHistory(plan) });
  for (const lotState of Object.values(state.lots)) lotState.status = 'integrated';
  invalidateState(state, ['implementation'], 'upstream changed', ['LOT-A'], plan);
  for (const id of ['LOT-A', 'LOT-B', 'LOT-C']) assert.equal(state.lots[id].status, 'stale', expected('BF-034'));
  assert.equal(state.lots['LOT-D'].status, 'integrated');
});

test('[BF-035] scalar or merge delivery actions cannot bypass the draft-only contract', () => {
  const events = releasedHistory(validPlan());
  expectCode('BF-035', () => push(events, 'draft_pr_planned', {
    draft: true, actions: 'merge', candidate_sha: SHA.candidate, payload_sha256: SHA.manifest,
  }, { actor: actors.delivery }));
});

test('[BF-036] CI artifact mode closes evidence without an invented Git SHA', () => {
  const plan = validPlan();
  const events = throughPassingAcceptance(plan);
  const publication = ciEventPublication();
  push(events, 'evidence_committed', {
    evidence_manifest_path: 'acceptance/runs/RUN/evidence-manifest.json',
    evidence_manifest_sha256: SHA.manifest,
    publication,
  });
  const state = reduceFactory({ plan, events });
  assert.equal(state.gates.evidence.status, 'valid');
  assert.equal(state.provenance.evidence_sha, null);
  assert.deepEqual(state.provenance.publication, { manifest_path: 'acceptance/runs/RUN/evidence-manifest.json', ...publication });

  expectCode('BF-036', () => push([...throughPassingAcceptance(plan)], 'evidence_committed', {
    evidence_manifest_path: 'acceptance/runs/RUN/evidence-manifest.json',
    evidence_manifest_sha256: SHA.manifest,
    evidence_sha: SHA.evidence,
    publication,
  }));
});

test('[BF-037] status and next-wave fail closed when an approved specification disappears', (t) => {
  const built = validGitBackedPackage(t);
  assert.deepEqual(validateFactoryPackageV3(built.packageDir), []);
  assert.equal(runControl('status', built.packageDir).status, 0);
  fs.unlinkSync(built.specPath);
  const loaded = loadFactoryPackage(built.packageDir);
  assert.notEqual(loaded.derived.phase, 'release_ready');
  for (const command of ['status', 'next-wave']) {
    const result = runControl(command, built.packageDir);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).error.code, expected('BF-037'));
  }
});

test('[BF-038] unresolvable candidate and evidence commit objects block release provenance', (t) => {
  const repoRoot = temporary(t);
  git(repoRoot, ['init', '-q']);
  const state = reduceFactory({ plan: validPlan(), events: releasedHistory(validPlan()) });
  const manifest = evidenceManifest({ entryHash: '0'.repeat(64) });
  manifest.publication = { mode: 'evidence_only_commit' };
  manifest.subject.tested_sha = null;
  manifest.waiver = { reason: 'fixture waiver', approved_by: 'quality-owner', approved_at: AT };
  manifest.verdict = 'waived';
  manifest.cases = [];
  manifest.summary = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  expectFinding('BF-038', validateReleaseProvenance({ repoRoot, state, manifest }));
});

test('[BF-039] a new commit after evidence binding invalidates release readiness', (t) => {
  const built = validGitBackedPackage(t);
  assert.deepEqual(validateFactoryPackageV3(built.packageDir), []);
  fs.writeFileSync(path.join(built.repoRoot, 'src', 'later.js'), 'export const later = true;\n');
  git(built.repoRoot, ['add', 'src/later.js']);
  git(built.repoRoot, ['commit', '-qm', 'advance head']);
  const loaded = loadFactoryPackage(built.packageDir);
  assert.equal(loaded.derived.gates.release.status, 'stale');
  expectFinding('BF-039', validateFactoryPackageV3(built.packageDir));
});

test('[BF-040] a work package requires readable paths, stop rules and a digest-bound handoff', () => {
  const plannedLot = lot('LOT-1');
  delete plannedLot.handoff;
  expectFinding('BF-040', validatePlan(validPlan([plannedLot])));
});

test('a complete CI-artifact envelope with resolvable Git provenance is release-ready', (t) => {
  const built = validGitBackedPackage(t);
  const loaded = loadFactoryPackage(built.packageDir);
  assert.deepEqual(loaded.provenanceFindings, []);
  assert.equal(loaded.derived.phase, 'release_ready');
  assert.equal(loaded.derived.provenance.evidence_sha, null);
  assert.deepEqual(validateFactoryPackageV3(built.packageDir), []);
});

test('evidence-only publication binds its Git commit in the event without a self-referential manifest SHA', (t) => {
  const built = validGitBackedPackage(t, { publicationMode: 'evidence_only_commit' });
  assert.equal(Object.hasOwn(built.manifest.subject, 'evidence_commit_sha'), false);
  const loaded = loadFactoryPackage(built.packageDir);
  assert.deepEqual(loaded.provenanceFindings, []);
  assert.equal(loaded.derived.phase, 'release_ready');
  assert.equal(loaded.derived.provenance.evidence_sha, built.evidenceSha);
  assert.deepEqual(validateFactoryPackageV3(built.packageDir), []);
});

test('acceptance becomes valid only when every case and oracle passed', () => {
  const plan = validPlan();
  const events = throughCandidate(plan);
  push(events, 'acceptance_started', {}, { actor: actors.acceptance });
  push(events, 'acceptance_completed', {
    status: 'passed',
    tested_sha: SHA.candidate,
    test_bundle_sha256: SHA.tests,
    case_results: [{ id: 'CASE-1', outcome: 'passed', oracle_results: [{ id: 'oracle-1', outcome: 'passed' }] }],
  }, { actor: actors.acceptance });
  const state = reduceFactory({ plan, events });
  assert.equal(state.gates.acceptance.status, 'valid');
  assert.equal(state.provenance.tested_sha, SHA.candidate);
});

test('approved waived cases keep their canonical outcome without becoming passed', () => {
  const plan = validPlan();
  const events = throughCandidate(plan);
  push(events, 'acceptance_started', {}, { actor: actors.acceptance });
  push(events, 'acceptance_completed', {
    status: 'passed',
    tested_sha: SHA.candidate,
    test_bundle_sha256: SHA.tests,
    case_results: [{
      id: 'CASE-WAIVED',
      outcome: 'waived',
      waiver: { reason: 'approved exception', approver_ref: 'quality-owner', approved_at: AT },
    }],
  }, { actor: actors.acceptance });
  assert.equal(reduceFactory({ plan, events }).gates.acceptance.status, 'valid');

  const incomplete = throughCandidate(plan);
  push(incomplete, 'acceptance_started', {}, { actor: actors.acceptance });
  push(incomplete, 'acceptance_completed', {
    status: 'passed', tested_sha: SHA.candidate, test_bundle_sha256: SHA.tests,
    case_results: [{ id: 'CASE-WAIVED', outcome: 'waived', waiver: { reason: 'missing approval' } }],
  }, { actor: actors.acceptance });
  assert.throws(() => reduceFactory({ plan, events: incomplete }), (error) => error.code === 'factory-acceptance-waiver-incomplete');
});

test('Delivery criterion waivers are complete, approved and plan-bound', () => {
  const manifest = evidenceManifest({ entryHash: '0'.repeat(64) });
  manifest.cases = [];
  manifest.artifacts = [];
  manifest.summary = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  manifest.publication.bundle_digest = `sha256:${canonicalHash([])}`;
  manifest.criteria_waivers = [{ criterion_id: 'AC-001', reason: 'approved exception', approver_ref: 'quality-owner', approved_at: AT }];
  assert.deepEqual(validateEvidenceManifest(manifest, { plan: validPlan() }), []);
  delete manifest.criteria_waivers[0].approver_ref;
  assert.ok(validateEvidenceManifest(manifest, { plan: validPlan() }).some((finding) => finding.code === 'factory-evidence-waiver-approver'));
});

test('typed delivery plan/result records a draft PR without changing release provenance', () => {
  const plan = validPlan();
  const events = releasedHistory(plan);
  push(events, 'draft_pr_planned', {
    draft: true, actions: ['open_draft_pr'], candidate_sha: SHA.candidate, payload_sha256: SHA.manifest,
  }, { actor: actors.delivery });
  push(events, 'draft_pr_created', {
    draft: true, actions: ['open_draft_pr'], candidate_sha: SHA.candidate, pr_url: 'https://github.example/pull/42',
  }, { actor: actors.delivery });
  const state = reduceFactory({ plan, events });
  assert.equal(state.phase, 'release_ready');
  assert.equal(state.delivery.status, 'draft_created');
  assert.equal(state.provenance.candidate_sha, SHA.candidate);
});

test('candidate refreeze clears proof bound to the prior candidate', () => {
  const plan = validPlan();
  const events = releasedHistory(plan);
  push(events, 'candidate_frozen', { candidate_sha: SHA.otherCandidate });
  const state = reduceFactory({ plan, events });
  assert.equal(state.provenance.candidate_sha, SHA.otherCandidate);
  assert.equal(state.provenance.tested_sha, null);
  assert.equal(state.provenance.evidence_sha, null);
  assert.equal(state.gates.acceptance.status, 'stale');
  assert.equal(state.gates.release.status, 'stale');
});

test('scheduler is pure and deterministic', () => {
  const plan = validPlan([
    lot('LOT-B', { write_claims: [{ kind: 'prefix', path: 'src/b' }] }),
    lot('LOT-A', { write_claims: [{ kind: 'prefix', path: 'src/a' }] }),
  ]);
  const state = reduceFactory({ plan, events: approvedHistory(plan) });
  const before = canonicalJson({ plan, state });
  const first = nextWave(plan, state);
  const second = nextWave(plan, state);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.lot_id), ['LOT-A', 'LOT-B']);
  assert.equal(canonicalJson({ plan, state }), before);
});

test('controlled append is dry-run by default and writes one canonical line under lock', (t) => {
  const repoRoot = temporary(t);
  const packageDir = path.join(repoRoot, 'package');
  fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
  const input = eventInput('package_initialized', {}, { run_id: 'RUN-CONTROLLED-APPEND' });
  const preview = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: false });
  const eventFile = path.join(packageDir, 'factory', 'events.v3.jsonl');
  assert.equal(preview.applied, false);
  assert.equal(fs.existsSync(eventFile), false);
  const applied = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: true });
  assert.equal(applied.applied, true);
  assert.deepEqual(parseEventLog(fs.readFileSync(eventFile, 'utf8')), applied.events);
  assert.equal(fs.readdirSync(path.join(repoRoot, '.git', 'factory-locks')).length, 0);
});

function validPlan(lots = [lot('LOT-1')]) {
  return {
    v: 3,
    spec_path: 'SPECIFICATION.md',
    environment_contract: null,
    acceptance_criteria: [{ id: 'AC-001', proved_by: ['unit'] }],
    lots,
  };
}

function lot(id, overrides = {}) {
  const writeClaims = deepCopy(overrides.write_claims || [{ kind: 'prefix', path: 'src/app' }]);
  const outputClaim = writeClaims[0];
  const defaultOutputPath = outputClaim?.kind === 'exact' ? outputClaim.path : `${outputClaim?.path || 'src/app'}/${id}.result.json`;
  return {
    id,
    kind: 'implementation',
    objective: `Implement ${id}`,
    acceptance_criteria: ['AC-001'],
    dependencies: [],
    read_claims: [{ kind: 'prefix', path: 'src' }, { kind: 'exact', path: 'SPECIFICATION.md' }],
    write_claims: writeClaims,
    forbidden_paths: ['src/private'],
    contracts: { inputs: ['spec'], outputs: ['code'], invariants: ['preserve API'], non_goals: ['refactor'] },
    handoff: {
      inputs: [{ id: 'spec', path: 'SPECIFICATION.md', sha256: SHA.spec }],
      outputs: [{ id: 'result', path: defaultOutputPath }],
      include_private_reasoning: false,
    },
    verification: ['unit'],
    stop_rules: ['stop when work would escape the declared write claims'],
    risk: 'medium',
    control_plane_critical: false,
    complexity: 'bounded',
    agent_role: 'implementer',
    model_role: 'standard',
    capabilities: ['read', 'write', 'execute'],
    decision_domains: [],
    max_attempts: 2,
    ...deepCopy(overrides),
  };
}

function actor(role, executionId, capabilities, planned = null, used = null) {
  return {
    role,
    execution_id: executionId,
    capabilities,
    model: { planned, requested: used, used },
  };
}

function eventInput(type, data = {}, overrides = {}) {
  return {
    run_id: overrides.run_id || RUN_ID,
    type,
    at: AT,
    controller_id: 'controller-1',
    expected_previous_seq: overrides.expected_previous_seq,
    actor: deepCopy(overrides.actor || actors.controller),
    subject: { package: PACKAGE, lot_id: overrides.lotId || null },
    basis: { spec_sha256: SHA.spec, plan_sha256: overrides.planHash || null, candidate_sha: null, diff_sha256: null },
    data: deepCopy(data),
  };
}

function push(events, type, data = {}, overrides = {}) {
  const event = buildEvent(events, eventInput(type, data, {
    ...overrides,
    run_id: events[0]?.run_id || overrides.run_id || RUN_ID,
    expected_previous_seq: events.length,
  }));
  events.push(event);
  return event;
}

function approvedHistory(plan, { specSha = SHA.spec } = {}) {
  const events = [];
  push(events, 'package_initialized', { package_version: 3 });
  push(events, 'spec_proposed', { spec_sha256: specSha });
  push(events, 'spec_approved', { spec_sha256: specSha, approved_by: 'product-owner', approved_at: AT });
  const planHash = canonicalHash(plan);
  push(events, 'plan_proposed', { plan_sha256: planHash }, { planHash });
  push(events, 'plan_approved', { plan_sha256: planHash, approved_by: 'tech-owner', approved_at: AT }, { planHash });
  push(events, 'execution_policy_resolved', {
    mode: 'balanced',
    observed_at: AT,
    models: {
      economy: 'model-economy',
      standard: 'model-standard',
      expert: 'model-expert',
      reviewer: 'model-reviewer',
    },
  });
  return events;
}

function throughLotResult(plan, options = {}) {
  const events = approvedHistory(plan, options);
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'lot_result_reported', { result: result(SHA.diff1, ['src/app/index.js']) }, { lotId: 'LOT-1', actor: actors.implementer });
  return events;
}

function throughCandidate(plan, { candidateSha = SHA.candidate, ...options } = {}) {
  const events = throughLotResult(plan, options);
  push(events, 'lot_reviewed', {
    diff_sha256: SHA.diff1, verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer });
  push(events, 'lot_integrated', {}, { lotId: 'LOT-1' });
  push(events, 'integration_verified', { status: 'passed', verification_sha256: SHA.integration });
  push(events, 'consolidated_reviewed', { verdict: 'passed', findings: [], fresh_context: true }, { actor: actors.reviewer });
  push(events, 'corpus_closed', { corpus_manifest_sha256: SHA.corpus });
  push(events, 'candidate_frozen', { candidate_sha: candidateSha });
  return events;
}

function throughPassingAcceptance(plan, options = {}) {
  const candidateSha = options.candidateSha || SHA.candidate;
  const events = throughCandidate(plan, options);
  push(events, 'acceptance_started', {}, { actor: actors.acceptance });
  push(events, 'acceptance_completed', {
    status: 'passed',
    tested_sha: candidateSha,
    test_bundle_sha256: SHA.tests,
    case_results: [{ id: 'CASE-001', outcome: 'passed', oracle_results: [{ id: 'oracle-1', outcome: 'passed' }] }],
  }, { actor: actors.acceptance });
  return events;
}

function releasedHistory(plan) {
  const events = throughCandidate(plan);
  pushWaiver(events);
  push(events, 'evidence_committed', {
    evidence_manifest_path: 'factory/evidence-manifest.v3.json',
    evidence_manifest_sha256: SHA.manifest,
    evidence_sha: SHA.evidence,
    publication: { mode: 'evidence_only_commit' },
  });
  push(events, 'release_reviewed', { verdict: 'passed', fresh_context: true }, { actor: actors.reviewer });
  return events;
}

function pushWaiver(events) {
  push(events, 'acceptance_waived', {
    reason: 'No executable behavior in test fixture', approved_by: 'quality-owner', approved_at: AT,
  }, { actor: actors.acceptance });
}

function pushFailedReview(events, diffSha, rule) {
  push(events, 'lot_reviewed', {
    diff_sha256: diffSha,
    verdict: 'failed',
    fresh_context: true,
    findings: [{
      severity: 'P0', rule, location: 'src/app/index.js:1', evidence: 'reproduced', impact: 'release blocker', status: 'open',
    }],
  }, { lotId: 'LOT-1', actor: actors.reviewer });
}

function result(diffSha, changedPaths) {
  return { diff_sha256: diffSha, changed_paths: changedPaths, verification: [{ id: 'unit', status: 'passed' }] };
}

function releasedStateAfterChange(classes, affectedLots = []) {
  const plan = validPlan();
  const events = releasedHistory(plan);
  push(events, 'artifact_change_observed', { classes, affected_lots: affectedLots, reason: 'test mutation' });
  return reduceFactory({ plan, events });
}

function evidenceManifest({ entryHash }) {
  const artifacts = [{ id: 'screen', path: 'screen.txt', sha256: `sha256:${entryHash}`, media_type: 'text/plain', bytes: 13 }];
  return {
    schema_version: 1,
    run_id: RUN_ID,
    generated_at: AT,
    spec_package: PACKAGE,
    subject: {
      head_sha: SHA.candidate,
      tested_sha: SHA.candidate,
      source_tree_digest: `sha256:${SHA.tests}`,
    },
    environment: {
      profile: 'local-acceptance',
      contract_digest: `sha256:${SHA.spec}`,
      instance_id: 'fixture-1',
      deployed_revision: SHA.candidate,
      build_or_image: 'fixture-build',
      schema_version: 'schema-1',
      dataset_id: 'dataset-1',
      dataset_version: 'dataset-v1',
      auth_actor_type: 'test-user',
    },
    toolchain: { adapter: 'playwright', adapter_version: '1.0.0', browser: 'chromium', browser_version: '1.0.0' },
    acceptance: { plan_path: `${PACKAGE}/acceptance-plan.yaml`, plan_digest: `sha256:${SHA.tests}` },
    publication: {
      mode: 'ci_artifact',
      ci_run_id: 'ci-123',
      artifact_id: 'bundle-123',
      artifact_url: 'https://ci.example/artifacts/bundle-123',
      retention_days: 30,
      bundle_digest: `sha256:${canonicalHash(artifacts)}`,
    },
    criteria_waivers: [],
    cases: [{
      id: 'unit', criteria: ['AC-001'], outcome: 'passed', attempts: 1,
      oracle_results: [{ id: 'oracle-1', outcome: 'passed' }], evidence_ids: ['screen'], evidence_bindings: [],
    }],
    mutations: [],
    artifacts,
    summary: { passed: 1, failed: 0, blocked: 0, skipped: 0, waived: 0 },
    verdict: 'ready',
    generation_findings: [],
  };
}

function ciEventPublication(overrides = {}) {
  return {
    mode: 'ci_artifact',
    artifact_locator: 'https://ci.example/artifacts/bundle-123',
    artifact_digest: `sha256:${'9'.repeat(64)}`,
    media_type: 'application/zip',
    ...overrides,
  };
}

function validGitBackedPackage(t, { publicationMode = 'ci_artifact' } = {}) {
  const repoRoot = temporary(t);
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'factory@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Factory Test']);

  const packageRef = 'doc/spec/1.0.0/FEATURE-1';
  const packageDir = path.join(repoRoot, packageRef);
  const factoryDir = path.join(packageDir, 'factory');
  const runDir = path.join(packageDir, 'acceptance', 'runs', RUN_ID);
  const specPath = path.join(packageDir, 'SPECIFICATION.md');
  const environmentPath = path.join(packageDir, 'environment-contract.yaml');
  const acceptancePath = path.join(packageDir, 'acceptance-plan.yaml');
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src', 'app'), { recursive: true });
  fs.writeFileSync(specPath, '# Approved specification\n\nAC-001: behavior works.\n');
  fs.writeFileSync(environmentPath, 'schema_version: 1\nprofile: local-acceptance\n');
  fs.writeFileSync(acceptancePath, 'schema_version: 1\ncases:\n  - id: CASE-001\n');
  fs.writeFileSync(path.join(repoRoot, 'src', 'app', 'index.js'), 'export const value = 1;\n');
  const specSha = fileHash(specPath);
  const plan = validPlan([lot('LOT-1', {
    read_claims: [
      { kind: 'prefix', path: 'src' },
      { kind: 'exact', path: `${packageRef}/SPECIFICATION.md` },
    ],
    handoff: {
      inputs: [{ id: 'spec', path: `${packageRef}/SPECIFICATION.md`, sha256: specSha }],
      outputs: [{ id: 'result', path: 'src/app/LOT-1.result.json' }],
      include_private_reasoning: false,
    },
  })]);
  plan.environment_contract = 'environment-contract.yaml';
  plan.acceptance_criteria[0].proved_by = ['CASE-001'];
  fs.writeFileSync(path.join(factoryDir, 'plan.v3.json'), canonicalJsonPretty(plan));

  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'candidate']);
  const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const tree = observedSourceTreeDigest(repoRoot, candidateSha, [`${packageRef}/acceptance/runs`]);
  assert.deepEqual(tree.findings, []);

  fs.mkdirSync(runDir, { recursive: true });
  const artifactPath = path.join(runDir, 'screen.txt');
  fs.writeFileSync(artifactPath, 'verified screen\n');
  const artifacts = [{
    id: 'screen', path: 'screen.txt', media_type: 'text/plain',
    sha256: `sha256:${fileHash(artifactPath)}`, bytes: fs.statSync(artifactPath).size,
  }];
  const manifest = {
    schema_version: 1,
    run_id: RUN_ID,
    generated_at: AT,
    spec_package: packageRef,
    subject: { head_sha: candidateSha, tested_sha: candidateSha, source_tree_digest: tree.digest },
    environment: {
      profile: 'local-acceptance',
      contract_digest: `sha256:${fileHash(environmentPath)}`,
      instance_id: 'local-fixture-1',
      deployed_revision: candidateSha,
      build_or_image: 'fixture-build-1',
      schema_version: 'schema-1',
      dataset_id: 'dataset-1',
      dataset_version: 'dataset-v1',
      auth_actor_type: 'test-user',
    },
    toolchain: { adapter: 'playwright', adapter_version: '1.0.0', browser: 'chromium', browser_version: '140.0' },
    acceptance: { plan_path: `${packageRef}/acceptance-plan.yaml`, plan_digest: `sha256:${fileHash(acceptancePath)}` },
    publication: publicationMode === 'ci_artifact' ? {
      mode: 'ci_artifact',
      ci_run_id: 'ci-run-123',
      artifact_id: 'artifact-123',
      artifact_url: 'https://ci.example/artifacts/artifact-123',
      retention_days: 30,
      bundle_digest: `sha256:${canonicalHash(artifacts)}`,
    } : { mode: 'evidence_only_commit' },
    criteria_waivers: [],
    cases: [{
      id: 'CASE-001', criteria: ['AC-001'], outcome: 'passed', attempts: 1,
      oracle_results: [{ id: 'oracle-1', outcome: 'passed' }], evidence_ids: ['screen'], evidence_bindings: [],
    }],
    mutations: [],
    artifacts,
    summary: { passed: 1, failed: 0, blocked: 0, skipped: 0, waived: 0 },
    verdict: 'ready',
    generation_findings: [],
  };
  const manifestPath = path.join(runDir, 'evidence-manifest.json');
  fs.writeFileSync(manifestPath, canonicalJsonPretty(manifest));

  let evidenceSha = null;
  if (publicationMode === 'evidence_only_commit') {
    git(repoRoot, ['add', `${packageRef}/acceptance/runs`]);
    git(repoRoot, ['commit', '-qm', 'publish evidence']);
    evidenceSha = git(repoRoot, ['rev-parse', 'HEAD']);
  }

  const events = throughPassingAcceptance(plan, { specSha, candidateSha });
  const publication = publicationMode === 'ci_artifact' ? ciEventPublication({
    artifact_locator: manifest.publication.artifact_url,
    artifact_digest: manifest.publication.bundle_digest,
  }) : { mode: 'evidence_only_commit' };
  push(events, 'evidence_committed', {
    evidence_manifest_path: `${packageRef}/acceptance/runs/${RUN_ID}/evidence-manifest.json`,
    evidence_manifest_sha256: canonicalHash(manifest),
    publication,
    ...(evidenceSha ? { evidence_sha: evidenceSha } : {}),
  });
  push(events, 'release_reviewed', { verdict: 'passed', fresh_context: true }, { actor: actors.reviewer });
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  const loaded = loadFactoryPackage(packageDir);
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(loaded.derived));
  return { repoRoot, packageDir, factoryDir, specPath, environmentPath, acceptancePath, manifestPath, plan, manifest, candidateSha, evidenceSha };
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function runControl(command, packageDir) {
  return spawnSync(process.execPath, [path.join(here, 'factory-control.mjs'), command, packageDir, '--json'], {
    cwd: path.dirname(here),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function expected(id) {
  const fixture = fixtures.get(id);
  assert.ok(fixture, `unknown fixture ${id}`);
  return fixture.expected_code;
}

function expectCode(id, operation) {
  const code = expected(id);
  assert.throws(operation, (error) => {
    assert.equal(error.code, code, `${id}: expected ${code}, received ${error.code}: ${error.message}`);
    return true;
  });
}

function expectFinding(id, findings) {
  const code = expected(id);
  assert.ok(findings.some((finding) => finding.code === code), `${id}: missing ${code} in ${JSON.stringify(findings)}`);
}

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-v3-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
