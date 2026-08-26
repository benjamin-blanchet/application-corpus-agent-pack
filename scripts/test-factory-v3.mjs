#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { canonicalHash, canonicalJson, canonicalJsonPretty, deepCopy, fileHash, normalizedFileHash, sha256 } from './lib/factory-v3/canonical-json.mjs';
import {
  loadRoleCapabilityPolicy,
  validateActorCapabilities,
  validateEffectiveCapabilities,
  validateRoleCapabilityPolicy,
} from './lib/factory-v3/capabilities.mjs';
import { repositoryArtifactDigest, repositoryFileObservation } from './lib/factory-v3/artifact-digest.mjs';
import { captureCorpusCloseout } from './lib/factory-v3/corpus-attestation.mjs';
import { captureWorkspaceSnapshot, controllerWorkspaceExclusions } from './lib/factory-v3/workspace-attestation.mjs';
import { observeChangeMetrics } from './lib/factory-v3/diff-budget.mjs';
import { EVENT_DATA_FIELDS, EVENT_DATA_REQUIRED_FIELDS, EVENT_TYPES, PHASES, validateEventShape, validatePlan } from './lib/factory-v3/contract.mjs';
import { appendEventFile, buildEvent, parseEventLog, readEventFile, serializeEventLog, validateEventChain } from './lib/factory-v3/event-log.mjs';
import { classifyArtifactPath, invalidateState, invalidatedGates } from './lib/factory-v3/invalidation.mjs';
import { buildV1Migration } from './lib/factory-v3/legacy-v1.mjs';
import { loadFactoryPackage, resolvePackageLocalReference, resolveRepositoryReference, validateFactoryPackageV3 } from './lib/factory-v3/package-io.mjs';
import { claimsOverlap, normalizeRepoPath } from './lib/factory-v3/path-claims.mjs';
import {
  observedSourceTreeDigest,
  validateEvidenceDeltaPaths,
  validateEvidenceManifest,
  validateReleaseProvenance,
} from './lib/factory-v3/provenance.mjs';
import { reduceFactory, stateMatchesDerived } from './lib/factory-v3/reducer.mjs';
import { nextWave, readyLots, validateLotResult, validateReservedWave } from './lib/factory-v3/scheduler.mjs';
import {
  ENVELOPE_HASH_ALGORITHM,
  CORPUS_TREE_ALGORITHM,
  CORPUS_VALIDATION_ALGORITHM,
  FILE_ARTIFACT_HASH_ALGORITHM,
  TREE_ARTIFACT_HASH_ALGORITHM,
  WORKSPACE_DELTA_ALGORITHM,
  WORKSPACE_SNAPSHOT_ALGORITHM,
  changeInventoryDigest,
  corpusTreeDigest,
  integrationVerificationDigest,
  lotResultDigest,
  preimplementationConventionDigest,
  reviewFindingDigest,
  treeArtifactDigest,
  workspaceSnapshotDigest,
} from './lib/factory-v3/proof-contracts.mjs';
import {
  CANDIDATE_BINDING_ALGORITHM,
  CONTROL_TRANSITION_ALGORITHM,
  REVIEWED_TREE_ALGORITHM,
  buildCandidateBinding,
  candidateBindingDigest,
  captureGitCommitSnapshot,
  controlTransitionDigest,
  reviewedSnapshotDigest,
} from './lib/factory-v3/git-review-attestation.mjs';
import { VERIFICATION_RECEIPT_ALGORITHM, verificationReceiptDigest } from './lib/factory-v3/verification-receipt.mjs';

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
  base: 'd'.repeat(40),
});

const actors = Object.freeze({
  controller: actor('controller', 'controller-1', ['read', 'write', 'execute']),
  implementer: actor('implementer', 'worker-1', ['read', 'write', 'execute'], 'standard', 'model-standard', 'model-standard-family'),
  reviewer: actor('reviewer', 'reviewer-1', ['read', 'execute'], 'reviewer', 'model-reviewer', 'model-reviewer-family'),
  acceptance: actor('acceptance', 'acceptance-1', ['read', 'execute'], 'expert', 'model-expert', 'model-expert-family'),
  delivery: actor('delivery', 'delivery-1', ['read', 'execute', 'network', 'open_pr'], 'expert', 'model-expert', 'model-expert-family'),
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
  assert.equal(eventSchema.properties.actor.properties.capability_grants.maxItems, 0);
  assert.deepEqual(stateSchema.properties.phase.enum, PHASES);
  assert.deepEqual(planSchema.$defs.lot.properties.model_role.enum, ['economy', 'standard', 'expert']);
  assert.deepEqual(planSchema.$defs.lot.properties.agent_role.enum, ['implementer', 'migration']);
  assert.equal(planSchema.$defs.lot.properties.max_attempts.maximum, 2);
  assert.equal(planSchema.$defs.lot.properties.capabilities.items.enum.includes('git_commit'), false);
  assert.equal(eventSchema.properties.actor.properties.capabilities.items.enum.includes('git_commit'), false);
  assert.equal(eventSchema.oneOf.length, EVENT_TYPES.size);
  const schemaPayloadFields = {};
  for (const variant of eventSchema.oneOf) {
    const variantName = variant.$ref.split('/').at(-1);
    const variantSchema = eventSchema.$defs[variantName];
    const type = variantSchema.properties.type.const;
    const payloadName = variantSchema.properties.data.$ref.split('/').at(-1);
    schemaPayloadFields[type] = Object.keys(eventSchema.$defs[payloadName].properties || {}).sort();
  }
  assert.deepEqual(Object.keys(schemaPayloadFields).sort(), [...EVENT_TYPES].sort());
  for (const type of EVENT_TYPES) assert.deepEqual(schemaPayloadFields[type], [...EVENT_DATA_FIELDS[type]].sort(), `${type} schema/validator payload drift`);
  for (const variant of eventSchema.oneOf) {
    const variantSchema = eventSchema.$defs[variant.$ref.split('/').at(-1)];
    const type = variantSchema.properties.type.const;
    const payload = eventSchema.$defs[variantSchema.properties.data.$ref.split('/').at(-1)];
    assert.deepEqual([...(payload.required || [])].sort(), [...EVENT_DATA_REQUIRED_FIELDS[type]].sort(), `${type} required-field drift`);
  }
  assert.deepEqual(Object.keys(eventSchema.$defs.evidencePublication.properties.publication.properties).sort(), ['media_type', 'mode']);
  assert.deepEqual(
    eventSchema.$defs.fileDigest.oneOf.map((variant) => variant.properties.status.const).sort(),
    ['deleted', 'present'],
  );
  assert.deepEqual(
    eventSchema.$defs.outputDigest.oneOf
      .map((variant) => `${variant.properties.kind.const}:${variant.properties.algorithm.const}`)
      .sort(),
    [`file:${FILE_ARTIFACT_HASH_ALGORITHM}`, `tree:${TREE_ARTIFACT_HASH_ALGORITHM}`],
  );
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
  expectCode('BF-004', () => buildEvent(events, eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { expected_previous_seq: 0 })));
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

test('an unrecognised artifact class fails closed on lots, not only on gates', () => {
  // The exact inversion this replaces: an operator who meant 'implementation'
  // and typed 'implementaion' used to invalidate more gates and no lots, so
  // every lot stayed integrated and every review stayed passed.
  const declared = releasedStateAfterChange(['implementation']);
  const mistyped = releasedStateAfterChange(['implementaion']);

  for (const [label, state] of [['declared', declared], ['mistyped', mistyped]]) {
    assert.equal(state.gates.lot_reviews.status, 'stale', label);
    for (const [lotId, entry] of Object.entries(state.lots)) {
      assert.equal(entry.status, 'stale', `${label}: ${lotId} must not survive the invalidation`);
      if (entry.review) assert.equal(entry.review.status, 'stale', `${label}: ${lotId} review`);
    }
  }

  // And it stays at least as conservative as the class it was mistaken for.
  assert.ok(invalidatedGates(['implementaion']).length >= invalidatedGates(['implementation']).length);
  assert.equal(invalidatedGates(['control']).length, 0);
});

test('a superseded blocker is history, not an obstacle to scheduling', () => {
  const plan = validPlan();
  const state = reduceFactory({ plan, events: approvedHistory(plan) });
  assert.deepEqual(readyLots(plan, state).map((lot) => lot.id), ['LOT-1']);

  // The reducer mints 'superseded' whenever a failed review is overtaken by a
  // passing one, and offers no path back to 'resolved'. A scheduler that
  // blocks on anything other than 'open' therefore stops for good.
  const superseded = deepCopy(state);
  superseded.blockers = [{ id: 'EV-1', kind: 'consolidated_review', status: 'superseded', reason: 'overtaken' }];
  assert.deepEqual(readyLots(plan, superseded).map((lot) => lot.id), ['LOT-1']);
  assert.deepEqual(nextWave(plan, superseded).map((item) => item.lot_id), ['LOT-1']);

  const open = deepCopy(state);
  open.blockers = [{ id: 'EV-1', kind: 'consolidated_review', status: 'open', reason: 'review failed' }];
  assert.deepEqual(readyLots(plan, open), []);

  const resolved = deepCopy(state);
  resolved.blockers = [{ id: 'EV-1', kind: 'consolidated_review', status: 'resolved', reason: 'recovered' }];
  assert.deepEqual(readyLots(plan, resolved).map((lot) => lot.id), ['LOT-1']);
});

test('[BF-048] reservation requires a preimplementation convention contract', () => {
  const plan = validPlan();
  const events = approvedHistory(plan, { includePreimplementationContracts: false });
  const state = reduceFactory({ plan, events });
  assert.deepEqual(nextWave(plan, state), []);
  expectFinding('BF-048', validateReservedWave(plan, state, [
    { lot_id: 'LOT-1', reservation_id: 'RES-1' },
  ]));
  push(events, 'wave_reserved', { reservations: [{ lot_id: 'LOT-1', reservation_id: 'RES-1' }] });
  expectCode('BF-048', () => reduceFactory({ plan, events }));
});

test('[BF-049] convention observation is immutable once a lot is reserved', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  push(events, 'wave_reserved', { reservations: [{ lot_id: 'LOT-1', reservation_id: 'RES-1' }] });
  push(events, 'lot_conventions_observed', testPreimplementationConventionContract(), {
    lotId: 'LOT-1',
    planHash: canonicalHash(plan),
    actor: conventionObserver(plan.lots[0]),
  });
  expectCode('BF-049', () => reduceFactory({ plan, events }));
});

test('[BF-050] lot start must use the exact convention-observation revision', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  push(events, 'wave_reserved', { reservations: [{ lot_id: 'LOT-1', reservation_id: 'RES-1' }] });
  push(events, 'lot_started', {
    reservation_id: 'RES-1',
    workspace_snapshot: testWorkspaceSnapshot({ baseRevision: SHA.otherCandidate }),
  }, { lotId: 'LOT-1', actor: actors.implementer });
  expectCode('BF-050', () => reduceFactory({ plan, events }));
});

test('[BF-051] result binds and reapplies the pre-observed convention rules', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  const contract = events.find((event) => event.type === 'lot_conventions_observed').data;
  push(events, 'wave_reserved', { reservations: [{ lot_id: 'LOT-1', reservation_id: 'RES-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });

  const wrongDigest = result(['src/app/index.js'], { preimplementationContractSha: SHA.tests });
  push(events, 'lot_result_reported', { result: wrongDigest }, { lotId: 'LOT-1', actor: actors.implementer });
  expectCode('BF-051', () => reduceFactory({ plan, events }));

  const ruleDrift = result(['src/app/index.js'], {
    preimplementationContractSha: contract.contract_sha256,
    observedConventions: [{
      id: contract.observed_conventions[0].id,
      rule: 'introduce a replacement architecture',
      examples: [{ path: 'src/app/index.js', sha256: SHA.integration, bytes: 1 }],
    }],
  });
  const corrected = events.slice(0, -1);
  push(corrected, 'lot_result_reported', { result: ruleDrift }, { lotId: 'LOT-1', actor: actors.implementer });
  assert.throws(() => reduceFactory({ plan, events: corrected }), (error) => error.code === 'factory-convention-application-mismatch');

  const valid = throughLotResult(plan);
  const state = reduceFactory({ plan, events: valid });
  assert.equal(state.lots['LOT-1'].status, 'completed_pending_review');
  assert.equal(
    valid.at(-1).data.result.preimplementation_contract_sha256,
    valid.find((event) => event.type === 'lot_conventions_observed').data.contract_sha256,
  );
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
  const findings = validateLotResult(plannedLot, result(['src/elsewhere.js']), {
    status: 'active', lot_id: 'LOT-1', claims: plannedLot.write_claims,
  });
  expectFinding('BF-008', findings);
});

test('[BF-009] a result cannot touch a forbidden subtree', () => {
  const plannedLot = lot('LOT-1', {
    write_claims: [{ kind: 'prefix', path: 'src' }],
    forbidden_paths: ['src/private'],
  });
  const findings = validateLotResult(plannedLot, result(['src/private/key.js']), {
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

test('deny-by-default role capability policy is executable and drift-checked', () => {
  const policy = loadRoleCapabilityPolicy();
  assert.deepEqual(validateRoleCapabilityPolicy(policy), []);
  assert.equal(policy.version, 2);
  assert.deepEqual(Object.keys(policy.conditional_event_capabilities.acceptance.network).sort(), ['control_plane', 'prerequisite']);
  assert.equal(policy.conditional_event_capabilities.acceptance.network.control_plane, 'deny');
  assert.equal(policy.conditional_event_capabilities.acceptance.network.prerequisite, 'external_attested_executor');
  const drifted = deepCopy(policy);
  drifted.event_actor_capabilities.controller.push('network');
  assert.ok(validateRoleCapabilityPolicy(drifted).some((finding) => finding.code === 'factory-role-policy-profile-drift'));
  assert.ok(validateActorCapabilities({ role: 'controller', capabilities: ['read', 'write', 'execute', 'network'] })
    .some((finding) => finding.code === 'factory-role-capability-not-authorized'));
  assert.ok(validateActorCapabilities({ role: 'delivery', capabilities: ['read', 'execute', 'network', 'open_pr', 'data_mutation'] })
    .some((finding) => finding.code === 'factory-role-capability-not-authorized'));
  assert.ok(validateActorCapabilities({ role: 'delivery', capabilities: ['read', 'execute', 'open_pr'] })
    .some((finding) => finding.code === 'factory-role-capability-missing'));
  for (const mutate of [
    (candidate) => { candidate.capabilities.delivery.git_push = 'allow'; },
    (candidate) => { candidate.capabilities.acceptance.network = 'internet-anywhere'; },
    (candidate) => { candidate.capabilities.planner.write = ['source']; },
  ]) {
    const contradiction = deepCopy(policy);
    mutate(contradiction);
    assert.ok(validateRoleCapabilityPolicy(contradiction).some((finding) => finding.code === 'factory-role-policy-capabilities-drift'));
  }
  assert.deepEqual(policy.non_event_roles.sort(), ['corpus', 'functional-analyst', 'planner']);
});

test('acceptance conditional capabilities remain unavailable without an integrated isolated executor verifier', () => {
  const missing = { ...deepCopy(actors.acceptance), capabilities: ['read', 'execute', 'network'] };
  assert.ok(validateActorCapabilities(missing).some((finding) => finding.code === 'factory-conditional-capability-unavailable'));

  const dataActor = {
    ...deepCopy(actors.acceptance),
    capabilities: ['read', 'execute', 'data_mutation'],
    capability_grants: [{
      capability: 'data_mutation', authorization_ref: 'AUTH-1', target: 'dataset-fixture', environment: 'non_production',
      side_effects: ['reset fixture rows'], approved_by: 'quality-owner', approved_at: AT,
    }],
  };
  assert.ok(validateActorCapabilities(dataActor).some((finding) => finding.code === 'factory-conditional-capability-unavailable'));
  assert.throws(
    () => buildEvent([], eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { actor: dataActor })),
    (error) => error.details?.findings?.some((finding) => finding.code === 'factory-conditional-capability-unavailable'),
  );

  const networkActor = {
    ...deepCopy(actors.acceptance),
    capabilities: ['read', 'execute', 'network'],
    capability_grants: [{
      capability: 'network', authorization_ref: 'AUTH-2', target: 'acceptance-env', run_id: RUN_ID,
      runner_trust: 'protected', egress_allowlist: ['test.example.invalid:443'], secret_refs: ['acceptance-token'],
      approved_by: 'quality-owner', approved_at: AT,
    }],
  };
  assert.throws(
    () => buildEvent([], eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { actor: networkActor })),
    (error) => error.details?.findings?.some((finding) => finding.code === 'factory-conditional-capability-unavailable'),
  );

  const approvalOnly = {
    ...deepCopy(actors.acceptance),
    capability_grants: [{ authorization_ref: 'github-environment/approved', runner_trust: 'protected' }],
  };
  assert.throws(
    () => buildEvent([], eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { actor: approvalOnly })),
    (error) => error.details?.findings?.some((finding) => finding.code === 'factory-conditional-capability-unavailable'),
  );

  const signedString = { ...deepCopy(actors.acceptance), capability_grants: 'signed-protected-environment-approval' };
  assert.throws(
    () => buildEvent([], eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { actor: signedString })),
    (error) => error.details?.findings?.some((finding) => finding.code === 'factory-capability-grants-shape'),
  );

  assert.deepEqual(validateActorCapabilities({ ...deepCopy(actors.acceptance), capability_grants: [] }), []);
});

test('[BF-012] a lot author cannot review their own diff', () => {
  const plan = validPlan();
  const events = throughLotResult(plan);
  push(events, 'lot_reviewed', {
    diff_sha256: lastLotDiff(events), verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: { ...deepCopy(actors.reviewer), execution_id: actors.implementer.execution_id } });
  expectCode('BF-012', () => reduceFactory({ plan, events }));
});

test('[BF-013] review findings must be actionable and structured', () => {
  const plan = validPlan();
  const events = throughLotResult(plan);
  expectCode('BF-013', () => push(events, 'lot_reviewed', {
    diff_sha256: lastLotDiff(events),
    verdict: 'failed',
    fresh_context: true,
    findings: [{ severity: 'P0', status: 'open' }],
  }, { lotId: 'LOT-1', actor: actors.reviewer }));
});

test('P0/P1 review dispositions require diff-bound correction proof or operator waiver', () => {
  const plan = validPlan();
  const planHash = canonicalHash(plan);
  const events = throughLotResult(plan);
  const diffSha = lastLotDiff(events);
  const unapproved = reviewFinding({ severity: 'P0', status: 'accepted' });
  assert.throws(() => push(events, 'lot_reviewed', {
    diff_sha256: diffSha, verdict: 'passed', findings: [unapproved], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer, planHash }), (error) => error.details?.findings?.some((finding) => finding.code === 'factory-contract-object-shape'));

  const accepted = reviewFinding({ severity: 'P0', status: 'accepted' });
  accepted.waiver = {
    reason: 'Operator accepts this bounded release risk',
    approved_by: 'release-owner',
    approved_at: AT,
    finding_sha256: reviewFindingDigest(accepted),
    diff_sha256: diffSha,
    plan_sha256: planHash,
  };
  push(events, 'lot_reviewed', {
    diff_sha256: diffSha, verdict: 'passed', findings: [accepted], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer, planHash });
  assert.equal(reduceFactory({ plan, events }).lots['LOT-1'].status, 'reviewed');

  const correctedEvents = throughLotResult(plan);
  const correctedDiff = lastLotDiff(correctedEvents);
  const resolved = reviewFinding({ severity: 'P1', status: 'resolved' });
  resolved.resolution = { diff_sha256: correctedDiff, evidence_sha256: SHA.tests, reviewed_at: AT };
  push(correctedEvents, 'lot_reviewed', {
    diff_sha256: correctedDiff, verdict: 'passed', findings: [resolved], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer, planHash });
  assert.equal(reduceFactory({ plan, events: correctedEvents }).lots['LOT-1'].review.verdict, 'passed');
});

test('review finding IDs are mandatory and unique within every review', () => {
  const plan = validPlan();
  const missing = throughLotResult(plan);
  const withoutId = reviewFinding();
  delete withoutId.id;
  assert.throws(() => push(missing, 'lot_reviewed', {
    diff_sha256: lastLotDiff(missing), verdict: 'failed', findings: [withoutId], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer }), (error) => error.message === 'review finding requires id');

  const duplicate = throughLotResult(plan);
  assert.throws(() => push(duplicate, 'lot_reviewed', {
    diff_sha256: lastLotDiff(duplicate), verdict: 'failed',
    findings: [reviewFinding({ id: 'FINDING-1' }), reviewFinding({ id: 'FINDING-1' })], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer }), (error) => error.code === 'factory-review-finding-id-duplicate');
});

test('same-family reviews require an exact operator exception, including consolidated review authors at release', () => {
  const plan = validPlan();
  const sharedActor = actor('implementer', 'worker-shared', ['read', 'write', 'execute'], 'standard', 'model-standard', 'shared-family');
  const sharedReviewer = actor('reviewer', 'reviewer-shared', ['read', 'execute'], 'reviewer', 'model-reviewer', 'shared-family');
  const modelFamilies = { economy: 'economy-family', standard: 'shared-family', expert: 'expert-family', reviewer: 'shared-family' };
  const denied = throughLotResult(plan, { modelFamilies, implementerActor: sharedActor });
  push(denied, 'lot_reviewed', {
    diff_sha256: lastLotDiff(denied), verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: sharedReviewer });
  assert.throws(() => reduceFactory({ plan, events: denied }), (error) => error.code === 'factory-review-model-independence');

  const allowed = throughLotResult(plan, { modelFamilies, implementerActor: sharedActor });
  push(allowed, 'lot_reviewed', {
    diff_sha256: lastLotDiff(allowed), verdict: 'passed', findings: [], fresh_context: true,
    independence_exception: modelIndependenceException(plan, ['shared-family'], 'shared-family'),
  }, { lotId: 'LOT-1', actor: sharedReviewer, planHash: canonicalHash(plan) });
  assert.equal(reduceFactory({ plan, events: allowed }).lots['LOT-1'].status, 'reviewed');

  const releaseDenied = releasedHistory(plan).slice(0, -1);
  push(releaseDenied, 'release_reviewed', { verdict: 'passed', fresh_context: true, findings: [] }, {
    actor: actors.reviewer, planHash: canonicalHash(plan),
  });
  assert.throws(() => reduceFactory({ plan, events: releaseDenied }), (error) => error.code === 'factory-review-model-independence');
});

test('a completed refactor cannot self-authorize without the linked escalation and controller approval', () => {
  const plan = validPlan();
  const approvedAssessment = {
    status: 'approved',
    locations: ['src/app/index.js'],
    evidence: [{ path: 'src/app/index.js', sha256: SHA.tests, bytes: 1 }],
    why_blocking: 'the existing boundary prevents the approved behavior',
    smallest_refactor: 'extract the bounded seam only',
    alternatives: ['keep the current boundary and block delivery'],
    blast_radius: ['src/app'],
    tests: ['unit'],
    amendment_ref: 'PLAN-AMENDMENT-1',
    escalation_event_id: 'EVT-000008',
    approval_event_id: 'EVT-000009',
  };
  const forged = throughLotResult(plan, { refactorAssessment: approvedAssessment });
  assert.throws(() => reduceFactory({ plan, events: forged }), (error) => error.code === 'factory-refactor-approval-missing');

  const events = approvedHistory(plan);
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  const escalation = push(events, 'lot_blocked', {
    reason: 'existing architecture blocks the bounded change',
    refactor_escalation: {
      locations: ['src/app/index.js'], evidence: [{ path: 'src/app/index.js', sha256: SHA.tests, bytes: 1 }],
      why_blocking: 'the existing boundary prevents the approved behavior', smallest_refactor: 'extract the bounded seam only',
      alternatives: ['keep the current boundary and block delivery'], blast_radius: ['src/app'], tests: ['unit'],
    },
  }, { lotId: 'LOT-1', actor: actors.implementer });
  const approval = push(events, 'refactor_approved', {
    escalation_event_id: escalation.event_id, amendment_ref: 'PLAN-AMENDMENT-1',
    reason: 'Operator approves the smallest bounded refactor', approved_by: 'tech-owner', approved_at: AT,
    amended_plan_sha256: canonicalHash(plan),
  }, { lotId: 'LOT-1', planHash: canonicalHash(plan) });
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-2', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-2' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'lot_result_reported', { result: result(['src/app/index.js'], {
    refactorAssessment: { ...approvedAssessment, escalation_event_id: escalation.event_id, approval_event_id: approval.event_id },
  }) }, { lotId: 'LOT-1', actor: actors.implementer });
  assert.equal(reduceFactory({ plan, events }).lots['LOT-1'].status, 'completed_pending_review');
});

test('consolidated review cannot pass with an unapproved accepted critical finding', () => {
  const plan = validPlan();
  const events = throughLotResult(plan);
  push(events, 'lot_reviewed', { diff_sha256: lastLotDiff(events), verdict: 'passed', findings: [], fresh_context: true }, { lotId: 'LOT-1', actor: actors.reviewer });
  push(events, 'lot_integrated', {}, { lotId: 'LOT-1' });
  push(events, 'integration_verified', integrationResult());
  assert.throws(() => push(events, 'consolidated_reviewed', {
    verdict: 'passed', findings: [reviewFinding({ severity: 'P1', status: 'accepted' })], fresh_context: true,
    reviewed_snapshot: testReviewedSnapshot(),
  }, { actor: actors.reviewer, planHash: canonicalHash(plan), diffSha: SHA.integration }), (error) => error.details?.findings?.some((finding) => finding.code === 'factory-contract-object-shape'));
});

test('[BF-014] correction/re-review loops stop at the plan attempt budget', () => {
  const plan = validPlan([lot('LOT-1', { max_attempts: 2 })]);
  const events = throughLotResult(plan);
  pushFailedReview(events, lastLotDiff(events), 'finding-1');
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'lot_result_reported', { result: result(['src/app/fixed.js']) }, { lotId: 'LOT-1', actor: actors.implementer });
  pushFailedReview(events, lastLotDiff(events), 'finding-2');
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
    case_results: [{ id: 'CASE-1', outcome: 'passed', oracle_results: [{ id: 'oracle', outcome: 'passed' }] }],
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
  git(root, ['init', '-q']);
  const packageDir = path.join(root, 'package');
  const factoryDir = path.join(packageDir, 'factory');
  fs.mkdirSync(factoryDir, { recursive: true });
  const plan = validPlan();
  const events = throughCandidate(plan);
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
      manifest_locator: repoManifestLocator(),
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
  for (const [caseResults, expectedCode] of [
    [[{ id: 'CASE-1', outcome: 'failed', oracle_results: [{ id: 'oracle', outcome: 'failed' }] }], expected('BF-028')],
    [[{ id: 'CASE-1', outcome: 'passed', user_visible_error: true, oracle_results: [{ id: 'oracle', outcome: 'passed' }] }], 'factory-acceptance-user-visible-error'],
  ]) {
    const plan = validPlan();
    const events = throughCandidate(plan);
    push(events, 'acceptance_started', {}, { actor: actors.acceptance });
    push(events, 'acceptance_completed', {
      status: 'passed', tested_sha: SHA.candidate, test_bundle_sha256: SHA.tests, case_results: caseResults,
    }, { actor: actors.acceptance });
    assert.throws(() => reduceFactory({ plan, events }), (error) => error.code === expectedCode);
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
    manifest_locator: ciManifestLocator(),
    evidence_manifest_sha256: SHA.manifest,
    publication,
  });
  const state = reduceFactory({ plan, events });
  assert.equal(state.gates.evidence.status, 'valid');
  assert.equal(state.provenance.evidence_sha, null);
  assert.deepEqual(state.provenance.publication, { manifest_locator: ciManifestLocator(), ...publication });

  expectCode('BF-036', () => push([...throughPassingAcceptance(plan)], 'evidence_committed', {
    manifest_locator: ciManifestLocator(),
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
  expectFinding('BF-038', validateReleaseProvenance({ repoRoot, state, manifest, expectedPackageRef: PACKAGE }));
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

test('[BF-041] approvals require package initialization, a proposal and a non-null digest', () => {
  const plan = validPlan();
  const withoutInitialization = [];
  push(withoutInitialization, 'spec_approved', { spec_sha256: SHA.spec, approved_by: 'owner', approved_at: AT });
  assert.throws(
    () => reduceFactory({ plan, events: withoutInitialization }),
    (error) => error.code === 'factory-package-init-required',
  );

  const withoutSpecProposal = [];
  push(withoutSpecProposal, 'package_initialized', { schema_version: 3, run_mode: 'live' });
  push(withoutSpecProposal, 'spec_approved', { spec_sha256: SHA.spec, approved_by: 'owner', approved_at: AT });
  expectCode('BF-041', () => reduceFactory({ plan, events: withoutSpecProposal }));

  const withoutPlanProposal = withoutSpecProposal.slice(0, 1);
  push(withoutPlanProposal, 'spec_proposed', { spec_sha256: SHA.spec });
  push(withoutPlanProposal, 'spec_approved', { spec_sha256: SHA.spec, approved_by: 'owner', approved_at: AT });
  push(withoutPlanProposal, 'plan_approved', { plan_sha256: canonicalHash(plan), approved_by: 'owner', approved_at: AT });
  assert.throws(
    () => reduceFactory({ plan, events: withoutPlanProposal }),
    (error) => error.code === 'factory-plan-approval-without-proposal',
  );

  assert.throws(
    () => push([...withoutSpecProposal.slice(0, 1)], 'spec_approved', { spec_sha256: null, approved_by: 'owner', approved_at: AT }),
    (error) => error.code === 'factory-spec-digest-missing',
  );
  const drifted = reduceFactory({
    plan,
    events: approvedHistory(plan),
    current: { spec_exists: true, spec_sha256: null },
  });
  assert.equal(drifted.gates.specification.status, 'stale');
  assert.deepEqual(drifted.ready_lots, []);
});

test('[BF-042] invalidating running work preserves its exclusive reservation until terminal recovery', () => {
  const plan = validPlan();
  const events = approvedHistory(plan);
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'artifact_change_observed', {
    classes: ['implementation'], affected_lots: ['LOT-1'], reason: 'upstream changed while worker is active',
  });
  const state = reduceFactory({ plan, events });
  assert.equal(state.lots['LOT-1'].status, 'running', expected('BF-042'));
  assert.equal(state.reservations['RES-1'].status, 'active', expected('BF-042'));
  assert.equal(nextWave(plan, state).some((item) => item.lot_id === 'LOT-1'), false, expected('BF-042'));
});

test('[BF-043] evidence spec_package is bound to packageDir and cannot redirect Git exclusions', (t) => {
  const built = validGitBackedPackage(t);
  built.manifest.spec_package = 'doc/spec/1.0.0/OTHER-PACKAGE';
  fs.writeFileSync(built.manifestPath, canonicalJsonPretty(built.manifest));
  expectFinding('BF-043', validateFactoryPackageV3(built.packageDir));
  const loaded = loadFactoryPackage(built.packageDir);
  expectFinding('BF-043', validateReleaseProvenance({
    repoRoot: built.repoRoot,
    state: loaded.derived,
    manifest: built.manifest,
    expectedPackageRef: loaded.packageRef,
  }));
});

test('[BF-044] an application commit after evidence publication invalidates every implementation proof', (t) => {
  const built = validGitBackedPackage(t, { publicationMode: 'evidence_only_commit' });
  assert.equal(loadFactoryPackage(built.packageDir).current.git_change_class, 'evidence_only');
  fs.writeFileSync(path.join(built.repoRoot, 'src', 'after-evidence.js'), 'export const changed = true;\n');
  git(built.repoRoot, ['add', 'src/after-evidence.js']);
  git(built.repoRoot, ['commit', '-qm', 'application change after evidence']);
  const loaded = loadFactoryPackage(built.packageDir);
  assert.equal(loaded.current.git_change_class, 'implementation');
  assert.equal(loaded.derived.lots['LOT-1'].status, 'stale');
  for (const gate of ['lot_reviews', 'integration', 'consolidated_review', 'corpus_closeout', 'candidate', 'acceptance', 'evidence', 'release']) {
    assert.equal(loaded.derived.gates[gate].status, 'stale', `${expected('BF-044')}: ${gate}`);
  }
  expectFinding('BF-044', validateFactoryPackageV3(built.packageDir));
});

test('[BF-045] affected_lots rejects scalars, typos, duplicates and unknown IDs', () => {
  const plan = validPlan();
  expectCode('BF-045', () => push(approvedHistory(plan), 'artifact_change_observed', {
    classes: ['implementation'], affected_lots: 'LOT-1', reason: 'malformed',
  }));
  assert.throws(
    () => push(approvedHistory(plan), 'artifact_change_observed', {
      classes: ['implementation'], affected_lot: ['LOT-1'], reason: 'typo',
    }),
    (error) => error.code === 'factory-contract-unknown-field',
  );
  assert.throws(
    () => push(approvedHistory(plan), 'artifact_change_observed', {
      classes: ['implementation'], affected_lots: ['LOT-1', 'LOT-1'], reason: 'duplicate',
    }),
    (error) => error.code === 'factory-change-affected-lots-duplicate',
  );
  const unknown = approvedHistory(plan);
  push(unknown, 'artifact_change_observed', {
    classes: ['implementation'], affected_lots: ['LOT-TYPO'], reason: 'unknown lot',
  });
  assert.throws(
    () => reduceFactory({ plan, events: unknown }),
    (error) => error.code === 'factory-change-unknown-lot',
  );
});

test('[BF-046] sensitive paths prevent economy routing even when risk metadata is understated', () => {
  for (const sensitivePath of [
    'schemas/factory/v3',
    'scripts/control',
    'src/security',
    'db/migrations',
    'src/data',
  ]) {
    const plan = validPlan([lot('LOT-1', {
      model_role: 'economy',
      risk: 'low',
      control_plane_critical: false,
      complexity: 'bounded',
      decision_domains: [],
      write_claims: [{ kind: 'prefix', path: sensitivePath }],
    })]);
    expectFinding('BF-046', validatePlan(plan));
  }

  const broadClaim = lot('LOT-1', {
    model_role: 'economy',
    risk: 'low',
    control_plane_critical: false,
    complexity: 'bounded',
    decision_domains: [],
    write_claims: [{ kind: 'prefix', path: 'src' }],
  });
  expectFinding('BF-046', validateLotResult(
    broadClaim,
    result(['src/security/policy.js']),
    { status: 'active', lot_id: 'LOT-1', claims: broadClaim.write_claims },
  ));
});

test('[BF-047] package validation resolves every handoff input and verifies its exact bytes', (t) => {
  const built = validGitBackedPackage(t);
  const planFile = path.join(built.factoryDir, 'plan.v3.json');
  const changedPlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  changedPlan.lots[0].handoff.inputs[0].sha256 = '0'.repeat(64);
  fs.writeFileSync(planFile, canonicalJsonPretty(changedPlan));
  expectFinding('BF-047', validateFactoryPackageV3(built.packageDir));
});

test('package-local specification and repository-relative references never use existence fallback', (t) => {
  const repoRoot = temporary(t);
  const packageDir = path.join(repoRoot, 'doc', 'spec', 'feature');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'SPECIFICATION.md'), 'package spec\n');
  fs.writeFileSync(path.join(repoRoot, 'SPECIFICATION.md'), 'root shadow\n');
  assert.equal(resolvePackageLocalReference(packageDir, 'SPECIFICATION.md'), path.join(packageDir, 'SPECIFICATION.md'));
  assert.equal(resolveRepositoryReference(repoRoot, 'SPECIFICATION.md'), path.join(repoRoot, 'SPECIFICATION.md'));
  fs.unlinkSync(path.join(packageDir, 'SPECIFICATION.md'));
  assert.equal(resolvePackageLocalReference(packageDir, 'SPECIFICATION.md'), path.join(packageDir, 'SPECIFICATION.md'));
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
      oracle_results: [],
      waiver: { reason: 'approved exception', approver_ref: 'quality-owner', approved_at: AT },
    }],
  }, { actor: actors.acceptance });
  assert.equal(reduceFactory({ plan, events }).gates.acceptance.status, 'valid');

  const incomplete = throughCandidate(plan);
  push(incomplete, 'acceptance_started', {}, { actor: actors.acceptance });
  assert.throws(() => push(incomplete, 'acceptance_completed', {
    status: 'passed', tested_sha: SHA.candidate, test_bundle_sha256: SHA.tests,
    case_results: [{ id: 'CASE-WAIVED', outcome: 'waived', oracle_results: [], waiver: { reason: 'missing approval' } }],
  }, { actor: actors.acceptance }), (error) => error.code === 'factory-acceptance-waiver-incomplete');
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
  const corpusEvent = [...events].reverse().find((event) => event.type === 'corpus_closed');
  const reviewedSnapshot = events.find((event) => event.type === 'consolidated_reviewed').data.reviewed_snapshot;
  push(events, 'candidate_frozen', {
    candidate_sha: SHA.otherCandidate,
    binding: testCandidateBinding({ candidateSha: SHA.otherCandidate, reviewedSnapshot, corpusEvent }),
  });
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

test('package initialization persists an explicit run mode and migration is retrospective', () => {
  const live = reduceFactory({ plan: validPlan(), events: approvedHistory(validPlan()) });
  assert.equal(live.run_mode, 'live');
  const legacy = path.join(fixtureRoot, 'legacy-release-ready');
  const migrated = buildV1Migration({
    stateText: fs.readFileSync(path.join(legacy, 'factory-state.yaml'), 'utf8'),
    planText: fs.readFileSync(path.join(legacy, 'technical-plan.yaml'), 'utf8'),
    packageRef: 'doc/spec/legacy-run-mode',
    at: AT,
  });
  assert.equal(migrated.state.run_mode, 'retrospective_attestation');
});

test('operator arbitration extends one exhausted lot by exactly one attempt', () => {
  const plan = validPlan();
  const events = exhaustedLotHistory(plan);
  const planHash = canonicalHash(plan);
  const diffSha = lastLotDiff(events);

  assert.throws(() => push(deepCopy(events), 'attempt_budget_extended', {
    reason: 'operator authorizes one correction', approved_by: 'operator', approved_at: AT, attempts: 2,
  }, { lotId: 'LOT-1', planHash, diffSha }), (error) => error.code === 'factory-contract-unknown-field');

  const unauthorized = deepCopy(events);
  push(unauthorized, 'attempt_budget_extended', {
    reason: 'operator authorizes one correction', approved_by: 'operator', approved_at: AT,
  }, { lotId: 'LOT-1', planHash, diffSha, actor: actors.implementer });
  assert.throws(() => reduceFactory({ plan, events: unauthorized }), (error) => error.code === 'factory-controller-role');

  assert.throws(() => push(deepCopy(events), 'attempt_budget_extended', {
    reason: 'future approval', approved_by: 'operator', approved_at: '2026-08-27T10:00:00.000Z',
  }, { lotId: 'LOT-1', planHash, diffSha }), (error) => error.code === 'factory-provenance-from-future');

  const wrongBasis = deepCopy(events);
  push(wrongBasis, 'attempt_budget_extended', {
    reason: 'operator authorizes one correction', approved_by: 'operator', approved_at: AT,
  }, { lotId: 'LOT-1', planHash: SHA.integration, diffSha });
  assert.throws(() => reduceFactory({ plan, events: wrongBasis }), (error) => error.code === 'factory-attempt-extension-plan-basis');

  push(events, 'attempt_budget_extended', {
    reason: 'operator authorizes one correction', approved_by: 'operator', approved_at: AT,
  }, { lotId: 'LOT-1', planHash, diffSha });
  let state = reduceFactory({ plan, events });
  assert.equal(state.lots['LOT-1'].attempt_budget_extensions, 1);
  assert.equal(state.lots['LOT-1'].effective_max_attempts, 3);
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  state = reduceFactory({ plan, events });
  assert.equal(state.lots['LOT-1'].attempts, 3);
  assert.equal(state.lots['LOT-1'].effective_max_attempts, 3);
});

test('attempt extensions cannot be banked before the newly granted attempt is consumed', () => {
  const plan = validPlan();
  const events = exhaustedLotHistory(plan);
  const basis = { lotId: 'LOT-1', planHash: canonicalHash(plan), diffSha: lastLotDiff(events) };
  push(events, 'attempt_budget_extended', { reason: 'one more', approved_by: 'operator', approved_at: AT }, basis);
  push(events, 'attempt_budget_extended', { reason: 'bulk extension forbidden', approved_by: 'operator', approved_at: AT }, basis);
  assert.throws(() => reduceFactory({ plan, events }), (error) => error.code === 'factory-attempt-extension-premature');
});

test('event payloads and their nested actor, model, subject and basis objects reject drift', () => {
  const events = throughCandidate(validPlan());
  for (const type of ['package_initialized', 'spec_approved', 'plan_approved', 'lot_result_reported', 'integration_verified', 'corpus_closed']) {
    const event = deepCopy(events.find((candidate) => candidate.type === type));
    event.data.unexpected = true;
    assert.ok(validateEventShape(event).some((finding) => finding.code === 'factory-contract-unknown-field'), type);
  }
  for (const location of ['actor', 'model', 'subject', 'basis']) {
    const event = deepCopy(events[0]);
    if (location === 'model') event.actor.model.unexpected = true;
    else event[location].unexpected = true;
    assert.ok(validateEventShape(event).some((finding) => finding.code === 'factory-contract-unknown-field'), location);
  }
  const evidenceOnly = deepCopy(releasedHistory(validPlan()).find((event) => event.type === 'evidence_committed'));
  evidenceOnly.data.publication.artifact_locator = 'https://ci.example/forbidden-in-evidence-only';
  assert.ok(validateEventShape(evidenceOnly).some((finding) => finding.code === 'factory-contract-unknown-field'));
});

test('lot and integration digests are recomputable and exact plan coverage is enforced', () => {
  const plannedLot = lot('LOT-1');
  const reservation = { status: 'active', lot_id: 'LOT-1', claims: plannedLot.write_claims };
  const valid = result(['src/app/index.js']);
  assert.deepEqual(validateLotResult(plannedLot, valid, reservation), []);
  const staleDiff = deepCopy(valid);
  staleDiff.files[0].sha256 = SHA.corpus;
  assert.ok(validateLotResult(plannedLot, staleDiff, reservation).some((finding) => finding.code === 'factory-lot-diff-digest-mismatch'));
  const staleOutput = deepCopy(valid);
  staleOutput.outputs[0].sha256 = SHA.corpus;
  assert.ok(validateLotResult(plannedLot, staleOutput, reservation).some((finding) => finding.code === 'factory-lot-diff-digest-mismatch'));
  const mismatchedOutputType = deepCopy(valid);
  mismatchedOutputType.outputs[0].kind = 'tree';
  mismatchedOutputType.diff_sha256 = lotResultDigest(mismatchedOutputType);
  assert.ok(validateLotResult(plannedLot, mismatchedOutputType, reservation).some((finding) => finding.code === 'factory-lot-output-coverage'));
  const malformedTypeEvent = deepCopy(throughCandidate(validPlan()).find((event) => event.type === 'lot_result_reported'));
  malformedTypeEvent.data.result.outputs[0].kind = 'tree';
  assert.ok(validateEventShape(malformedTypeEvent).some((finding) => finding.code === 'factory-lot-output-algorithm'));
  const missingOutput = deepCopy(valid);
  missingOutput.outputs = [];
  assert.ok(validateLotResult(plannedLot, missingOutput, reservation).some((finding) => finding.code === 'factory-lot-output-coverage'));
  const missingVerification = deepCopy(valid);
  missingVerification.verification = [];
  assert.ok(validateLotResult(plannedLot, missingVerification, reservation).some((finding) => finding.code === 'factory-lot-verification-coverage'));
  const blocked = deepCopy(valid);
  blocked.blockers = ['hidden'];
  assert.ok(validateLotResult(plannedLot, blocked, reservation).some((finding) => finding.code === 'factory-lot-result-blockers'));

  const integrationEvent = deepCopy(throughCandidate(validPlan()).find((event) => event.type === 'integration_verified'));
  integrationEvent.data.verifications[0].stdout.sha256 = SHA.corpus;
  assert.ok(validateEventShape(integrationEvent).some((finding) => finding.code === 'factory-integration-digest-mismatch'));
});

test('malformed content-addressed entries fail closed without crashing validation', () => {
  const lotEvent = deepCopy(throughCandidate(validPlan()).find((event) => event.type === 'lot_result_reported'));
  delete lotEvent.data.result.files[0].sha256;
  assert.doesNotThrow(() => validateEventShape(lotEvent));
  assert.ok(validateEventShape(lotEvent).some((finding) => finding.code === 'factory-proof-file-digest'));

  const malformedOutput = deepCopy(throughCandidate(validPlan()).find((event) => event.type === 'lot_result_reported'));
  delete malformedOutput.data.result.outputs[0].sha256;
  assert.doesNotThrow(() => validateEventShape(malformedOutput));
  assert.ok(validateEventShape(malformedOutput).some((finding) => finding.code === 'factory-lot-output-digest'));

  const integrationEvent = deepCopy(throughCandidate(validPlan()).find((event) => event.type === 'integration_verified'));
  delete integrationEvent.data.verifications[0].stdout.sha256;
  assert.doesNotThrow(() => validateEventShape(integrationEvent));
  assert.ok(validateEventShape(integrationEvent).some((finding) => finding.code === 'factory-verification-byte-digest'));
});

test('file and tree handoff digests are deterministic and reject symbolic links', (t) => {
  const repoRoot = temporary(t);
  const file = path.join(repoRoot, 'artifacts', 'single.txt');
  const tree = path.join(repoRoot, 'artifacts', 'tree');
  fs.mkdirSync(path.join(tree, 'nested'), { recursive: true });
  fs.writeFileSync(file, 'single\n');
  fs.writeFileSync(path.join(tree, 'z.txt'), 'zulu\n');
  fs.writeFileSync(path.join(tree, 'nested', 'a.txt'), 'alpha\n');

  const fileProof = repositoryArtifactDigest({ repoRoot, repoPath: 'artifacts/single.txt' });
  assert.equal(fileProof.kind, 'file');
  assert.equal(fileProof.algorithm, FILE_ARTIFACT_HASH_ALGORITHM);
  assert.equal(fileProof.sha256, fileHash(file));

  const inventory = [
    { relative_path: 'nested/a.txt', sha256: fileHash(path.join(tree, 'nested', 'a.txt')) },
    { relative_path: 'z.txt', sha256: fileHash(path.join(tree, 'z.txt')) },
  ];
  const treeProof = repositoryArtifactDigest({ repoRoot, repoPath: 'artifacts/tree' });
  assert.equal(treeProof.kind, 'tree');
  assert.equal(treeProof.algorithm, TREE_ARTIFACT_HASH_ALGORITHM);
  assert.deepEqual(treeProof.inventory, inventory);
  assert.equal(treeProof.sha256, treeArtifactDigest(inventory));
  assert.equal(treeProof.sha256, treeArtifactDigest([...inventory].reverse()));

  fs.symlinkSync('../single.txt', path.join(tree, 'link.txt'));
  assert.throws(
    () => repositoryArtifactDigest({ repoRoot, repoPath: 'artifacts/tree' }),
    (error) => error.code === 'factory-artifact-symlink',
  );
});

test('lot result inventory binds present and deleted paths without ambiguous deleted digests', () => {
  const plannedLot = lot('LOT-1');
  const reservation = { status: 'active', lot_id: 'LOT-1', claims: plannedLot.write_claims };
  const canonicalDeleted = result(['src/app/index.js', 'src/app/removed.js'], { deletedPaths: ['src/app/removed.js'] });
  assert.deepEqual(validateLotResult(plannedLot, canonicalDeleted, reservation), []);

  const omittedDeletedDigest = deepCopy(canonicalDeleted);
  delete omittedDeletedDigest.files.find((entry) => entry.status === 'deleted').sha256;
  omittedDeletedDigest.diff_sha256 = lotResultDigest(omittedDeletedDigest);
  assert.equal(omittedDeletedDigest.diff_sha256, canonicalDeleted.diff_sha256);
  assert.deepEqual(validateLotResult(plannedLot, omittedDeletedDigest, reservation), []);

  const forgedDeletion = deepCopy(canonicalDeleted);
  forgedDeletion.files.find((entry) => entry.status === 'deleted').sha256 = SHA.corpus;
  forgedDeletion.diff_sha256 = lotResultDigest(forgedDeletion);
  assert.ok(validateLotResult(plannedLot, forgedDeletion, reservation).some((finding) => finding.code === 'factory-proof-file-state'));
});

test('package validation checks current file, tree and deletion evidence', (t) => {
  const filePackage = validGitBackedPackage(t);
  assert.deepEqual(validateFactoryPackageV3(filePackage.packageDir), []);
  fs.writeFileSync(path.join(filePackage.repoRoot, filePackage.outputPath), 'tampered output\n');
  assert.ok(validateFactoryPackageV3(filePackage.packageDir).some((finding) => finding.code === 'factory-lot-output-digest-mismatch'));

  const treePackage = validGitBackedPackage(t, { outputKind: 'tree' });
  assert.deepEqual(validateFactoryPackageV3(treePackage.packageDir), []);
  fs.writeFileSync(path.join(treePackage.repoRoot, treePackage.outputPath, 'nested', 'b.txt'), 'tampered tree\n');
  assert.ok(validateFactoryPackageV3(treePackage.packageDir).some((finding) => finding.code === 'factory-lot-output-digest-mismatch'));
  fs.symlinkSync('../a.txt', path.join(treePackage.repoRoot, treePackage.outputPath, 'nested', 'link.txt'));
  assert.ok(validateFactoryPackageV3(treePackage.packageDir).some((finding) => finding.code === 'factory-artifact-symlink'));

  const deletionPackage = validGitBackedPackage(t, { includeDeleted: true });
  assert.deepEqual(validateFactoryPackageV3(deletionPackage.packageDir), []);
  fs.writeFileSync(path.join(deletionPackage.repoRoot, 'src', 'app', 'removed.js'), 'not deleted\n');
  fs.writeFileSync(path.join(deletionPackage.repoRoot, 'src', 'app', 'index.js'), 'tampered present file\n');
  const findings = validateFactoryPackageV3(deletionPackage.packageDir);
  assert.ok(findings.some((finding) => finding.code === 'factory-lot-deletion-not-observed'));
  assert.ok(findings.some((finding) => finding.code === 'factory-lot-file-digest-mismatch'));
});

test('controller receipts and observed conventions are rehashed from current regular-file bytes', (t) => {
  const built = validGitBackedPackage(t);
  const loaded = loadFactoryPackage(built.packageDir);
  const lotResult = loaded.events.find((event) => event.type === 'lot_result_reported').data.result;
  const receiptPath = path.join(built.repoRoot, lotResult.verification[0].stdout.path);
  const originalReceipt = fs.readFileSync(receiptPath);
  fs.writeFileSync(receiptPath, 'forged verification output\n');
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-verification-receipt-bytes-mismatch'));
  fs.writeFileSync(receiptPath, originalReceipt);

  const conventionPath = path.join(built.repoRoot, lotResult.observed_conventions[0].examples[0].path);
  const originalConvention = fs.readFileSync(conventionPath);
  fs.writeFileSync(conventionPath, 'forged convention example\n');
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-convention-evidence-drift'));
  fs.writeFileSync(conventionPath, originalConvention);

  const outside = path.join(temporary(t), 'outside.log');
  fs.writeFileSync(outside, originalReceipt);
  fs.unlinkSync(receiptPath);
  fs.symlinkSync(outside, receiptPath);
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-artifact-symlink'));
});

test('candidate binding rejects an application commit created after the reviewed snapshot', (t) => {
  const repoRoot = temporary(t);
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'factory@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Factory Test']);
  fs.mkdirSync(path.join(repoRoot, 'doc', 'spec', 'test'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'doc', 'CORPUS_MANIFEST.md'), '# Corpus\n');
  fs.writeFileSync(path.join(repoRoot, 'src', 'app.js'), 'export const reviewed = true;\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'reviewed candidate']);
  const reviewedCommit = git(repoRoot, ['rev-parse', 'HEAD']);
  const reviewedSnapshot = captureGitCommitSnapshot({ repoRoot, revision: reviewedCommit });
  fs.writeFileSync(path.join(repoRoot, 'src', 'app.js'), 'export const unreviewed = true;\n');
  git(repoRoot, ['add', 'src/app.js']);
  git(repoRoot, ['commit', '-qm', 'unreviewed application change']);
  const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
  assert.throws(() => buildCandidateBinding({
    repoRoot,
    packageRef: 'doc/spec/test',
    reviewedSnapshot,
    candidateSha,
    corpusEvent: { type: 'corpus_closed', event_id: 'EVT-000013', data: testCorpusCloseout() },
  }), (error) => error.code === 'factory-candidate-unreviewed-application-change');
});

test('candidate binding content-addresses only the exact reviewed control suffix', (t) => {
  const built = validGitBackedPackage(t);
  const reviewedSnapshot = captureGitCommitSnapshot({ repoRoot: built.repoRoot, revision: built.reviewedSha });
  const cleanBinding = buildCandidateBinding({
    repoRoot: built.repoRoot,
    packageRef: built.packageRef,
    reviewedSnapshot,
    candidateSha: built.candidateSha,
    corpusEvent: built.corpusEvent,
  });
  assert.deepEqual(cleanBinding.control_transition.appended_event_ids, [
    built.corpusEvent.seq - 2,
    built.corpusEvent.seq - 1,
    built.corpusEvent.seq,
  ].map((seq) => `EVT-${String(seq).padStart(6, '0')}`));
  assert.equal(cleanBinding.control_transition.base_commit_sha, built.reviewedSha);
  assert.equal(cleanBinding.control_transition.candidate_commit_sha, built.candidateSha);

  const cloneCandidate = () => {
    const clone = temporary(t);
    git(path.dirname(clone), ['clone', '--quiet', built.repoRoot, clone]);
    git(clone, ['config', 'user.email', 'factory@example.invalid']);
    git(clone, ['config', 'user.name', 'Factory Test']);
    return clone;
  };
  const controlPaths = (root) => ({
    events: path.join(root, built.packageRef, 'factory/events.v3.jsonl'),
    state: path.join(root, built.packageRef, 'factory/state.v3.json'),
    plan: path.join(root, built.packageRef, 'factory/plan.v3.json'),
    spec: path.join(root, built.packageRef, 'SPECIFICATION.md'),
  });
  const writeExactState = (root, events) => {
    const files = controlPaths(root);
    const plan = JSON.parse(fs.readFileSync(files.plan, 'utf8'));
    fs.writeFileSync(files.state, canonicalJsonPretty(reduceFactory({
      plan,
      events,
      current: {
        plan_sha256: canonicalHash(plan),
        spec_exists: true,
        spec_sha256: normalizedFileHash(files.spec),
        evidence_manifest_sha256: null,
        provenance_status: null,
      },
    })));
  };
  const commitControls = (root, message) => {
    git(root, ['add', `${built.packageRef}/factory/events.v3.jsonl`, `${built.packageRef}/factory/state.v3.json`]);
    git(root, ['commit', '-qm', message]);
    return git(root, ['rev-parse', 'HEAD']);
  };
  const assertRejected = (root, candidateSha, corpusEvent, code) => assert.throws(() => buildCandidateBinding({
    repoRoot: root,
    packageRef: built.packageRef,
    reviewedSnapshot,
    candidateSha,
    corpusEvent,
  }), (error) => error.code === code);

  const rewritten = cloneCandidate();
  const rewrittenPaths = controlPaths(rewritten);
  const originalEvents = readEventFile(rewrittenPaths.events);
  const rewrittenEvents = [];
  for (const [index, event] of originalEvents.entries()) {
    rewrittenEvents.push(buildEvent(rewrittenEvents, {
      ...event,
      at: index === 0 ? '2026-08-25T10:00:00.000Z' : event.at,
      expected_previous_seq: rewrittenEvents.length,
    }));
  }
  fs.writeFileSync(rewrittenPaths.events, serializeEventLog(rewrittenEvents));
  writeExactState(rewritten, rewrittenEvents);
  const rewrittenSha = commitControls(rewritten, 'rewrite reviewed event prefix');
  assertRejected(rewritten, rewrittenSha, rewrittenEvents.at(-1), 'factory-control-log-prefix-mismatch');

  const extended = cloneCandidate();
  const extendedPaths = controlPaths(extended);
  const extendedEvents = readEventFile(extendedPaths.events);
  extendedEvents.push(buildEvent(extendedEvents, {
    ...extendedEvents.at(-1),
    type: 'artifact_change_observed',
    expected_previous_seq: extendedEvents.length,
    data: { classes: ['corpus'], affected_lots: [], reason: 'forbidden post-closeout suffix' },
  }));
  fs.writeFileSync(extendedPaths.events, serializeEventLog(extendedEvents));
  writeExactState(extended, extendedEvents);
  const extendedSha = commitControls(extended, 'append forbidden control event');
  assertRejected(extended, extendedSha, built.corpusEvent, 'factory-control-transition-events');

  const stale = cloneCandidate();
  const stalePaths = controlPaths(stale);
  const staleState = JSON.parse(fs.readFileSync(stalePaths.state, 'utf8'));
  staleState.phase = 'draft';
  fs.writeFileSync(stalePaths.state, canonicalJsonPretty(staleState));
  const staleSha = commitControls(stale, 'stale candidate state');
  assertRejected(stale, staleSha, built.corpusEvent, 'factory-control-candidate-state-stale');

  const reordered = cloneCandidate();
  const reorderedPaths = controlPaths(reordered);
  const reorderedSource = readEventFile(reorderedPaths.events);
  const baseCount = reorderedSource.length - 3;
  [reorderedSource[baseCount], reorderedSource[baseCount + 1]] = [reorderedSource[baseCount + 1], reorderedSource[baseCount]];
  const reorderedEvents = [];
  for (const event of reorderedSource) reorderedEvents.push(buildEvent(reorderedEvents, { ...event, expected_previous_seq: reorderedEvents.length }));
  fs.writeFileSync(reorderedPaths.events, serializeEventLog(reorderedEvents));
  const reorderedSha = commitControls(reordered, 'reorder protected control suffix');
  assert.throws(() => buildCandidateBinding({
    repoRoot: reordered,
    packageRef: built.packageRef,
    reviewedSnapshot,
    candidateSha: reorderedSha,
    corpusEvent: reorderedEvents.at(-1),
  }), (error) => /requires integration to be valid|exactly integration_verified/.test(error.message));
});

test('output kind and algorithm prevent digest-preserving file/tree substitution', (t) => {
  const treePackage = validGitBackedPackage(t, { outputKind: 'tree' });
  const treePath = path.join(treePackage.repoRoot, treePackage.outputPath);
  const treeProof = repositoryArtifactDigest({ repoRoot: treePackage.repoRoot, repoPath: treePackage.outputPath });
  const treeManifestBytes = canonicalJson({ algorithm: TREE_ARTIFACT_HASH_ALGORITHM, files: treeProof.inventory });
  fs.rmSync(treePath, { recursive: true });
  fs.writeFileSync(treePath, treeManifestBytes);
  assert.equal(fileHash(treePath), treePackage.outputSha, 'constructed tree-to-file substitution must preserve sha256');
  const treeToFile = validateFactoryPackageV3(treePackage.packageDir);
  assert.ok(treeToFile.some((finding) => finding.code === 'factory-lot-output-kind-mismatch'));
  assert.ok(treeToFile.some((finding) => finding.code === 'factory-lot-output-algorithm-mismatch'));

  const payload = 'collision payload\n';
  const fileToTreeInventory = [{ relative_path: 'payload.txt', sha256: sha256(payload) }];
  const fileManifestBytes = canonicalJson({ algorithm: TREE_ARTIFACT_HASH_ALGORITHM, files: fileToTreeInventory });
  const filePackage = validGitBackedPackage(t, { outputFileContent: fileManifestBytes });
  const filePath = path.join(filePackage.repoRoot, filePackage.outputPath);
  assert.equal(filePackage.outputSha, treeArtifactDigest(fileToTreeInventory));
  fs.rmSync(filePath);
  fs.mkdirSync(filePath);
  fs.writeFileSync(path.join(filePath, 'payload.txt'), payload);
  assert.equal(repositoryArtifactDigest({ repoRoot: filePackage.repoRoot, repoPath: filePackage.outputPath }).sha256, filePackage.outputSha);
  const fileToTree = validateFactoryPackageV3(filePackage.packageDir);
  assert.ok(fileToTree.some((finding) => finding.code === 'factory-lot-output-kind-mismatch'));
  assert.ok(fileToTree.some((finding) => finding.code === 'factory-lot-output-algorithm-mismatch'));

  const appendPackage = pendingLotResultPackage(t, { outputKind: 'tree' });
  const appendPath = path.join(appendPackage.repoRoot, appendPackage.outputPath);
  const appendTree = repositoryArtifactDigest({ repoRoot: appendPackage.repoRoot, repoPath: appendPackage.outputPath });
  fs.rmSync(appendPath, { recursive: true });
  fs.writeFileSync(appendPath, canonicalJson({ algorithm: TREE_ARTIFACT_HASH_ALGORITHM, files: appendTree.inventory }));
  assert.equal(fileHash(appendPath), appendTree.sha256);
  const appendFailure = runControlAppend(appendPackage.packageDir, appendPackage.input);
  assert.equal(appendFailure.status, 1);
  assert.equal(JSON.parse(appendFailure.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');
});

test('approval and runtime observation provenance cannot postdate the event', () => {
  const plan = validPlan();
  const events = approvedHistory(plan).slice(0, 2);
  assert.throws(() => push(events, 'spec_approved', {
    spec_sha256: SHA.spec, approved_by: 'operator', approved_at: '2026-08-27T10:00:00.000Z',
  }), (error) => error.code === 'factory-provenance-from-future');
  const policyHistory = approvedHistory(plan).slice(0, 5);
  assert.throws(() => push(policyHistory, 'execution_policy_resolved', {
    mode: 'balanced', observed_at: '2026-08-27T10:00:00.000Z',
    models: { economy: 'a', standard: 'b', expert: 'c', reviewer: 'd' },
    model_families: { economy: 'a-family', standard: 'b-family', expert: 'c-family', reviewer: 'd-family' },
  }), (error) => error.code === 'factory-provenance-from-future');
});

test('corpus closeout verifies recursive doc bytes while excluding current machine artifacts', (t) => {
  const built = validGitBackedPackage(t);
  fs.writeFileSync(built.corpusManifestPath, '# Changed corpus manifest\n');
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-corpus-tree-digest-mismatch'));

  fs.writeFileSync(built.corpusManifestPath, '# Corpus manifest\n');
  const generatedSite = path.join(built.repoRoot, 'doc', '_site', 'corpus.html');
  fs.mkdirSync(path.dirname(generatedSite), { recursive: true });
  fs.writeFileSync(generatedSite, '<!doctype html><title>Derived corpus site</title>\n');
  const generatedSiteCloseout = captureCorpusCloseout({ repoRoot: built.repoRoot, packageRef: built.packageRef });
  assert.ok(generatedSiteCloseout.exclusions.includes('doc/_site'));
  assert.equal(generatedSiteCloseout.files.some((entry) => entry.path === 'doc/_site/corpus.html'), false);
  assert.equal(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-corpus-tree-digest-mismatch'), false);
  const excludedArtifact = path.join(built.packageDir, 'acceptance', 'runs', RUN_ID, 'late-machine.json');
  fs.writeFileSync(excludedArtifact, '{}\n');
  assert.equal(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-corpus-tree-digest-mismatch'), false);
  const loaded = loadFactoryPackage(built.packageDir);
  const before = fs.readFileSync(path.join(built.factoryDir, 'events.v3.jsonl'), 'utf8');
  const input = eventInput('corpus_closed', { forged: true }, { run_id: loaded.events[0].run_id, expected_previous_seq: loaded.events.length });
  input.subject.package = built.packageRef;
  const result = runControlAppend(built.packageDir, input);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).event.data, captureCorpusCloseout({ repoRoot: built.repoRoot, packageRef: built.packageRef }));
  assert.equal(fs.readFileSync(path.join(built.factoryDir, 'events.v3.jsonl'), 'utf8'), before);

  fs.symlinkSync('../../../../CORPUS_MANIFEST.md', path.join(built.packageDir, 'SYMLINK.md'));
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-corpus-tree-symlink'));
});

test('package validation never executes the subject corpus validator', (t) => {
  const built = validGitBackedPackage(t);
  const validatorPath = path.join(built.repoRoot, 'scripts', 'validate-corpus.mjs');
  const marker = path.join(built.repoRoot, 'candidate-payload-ran');
  const original = fs.readFileSync(validatorPath, 'utf8');

  // Exactly the shape a hostile pull request would take: the file the
  // controller is asked to attest is also a program, and it writes.
  fs.writeFileSync(validatorPath, `#!/usr/bin/env node
require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');
process.stdout.write(JSON.stringify({summary:{ok:true,counts:{P0:0,P1:0,P2:0}},findings:[]}));
`);

  const findings = validateFactoryPackageV3(built.packageDir);
  assert.equal(fs.existsSync(marker), false, 'the subject validator must not be spawned by package validation');
  // The bytes changed, so the closeout proof must still fail — the guarantee
  // is that drift is caught by digest, not by execution.
  assert.ok(findings.some((finding) => finding.code === 'factory-corpus-validation-proof-mismatch'));

  fs.writeFileSync(validatorPath, original);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-corpus-validation-proof-mismatch'), false);
});

test('controlled lot-result append verifies current file, tree and deletion bytes', (t) => {
  const valid = pendingLotResultPackage(t, { outputKind: 'tree', includeDeleted: true });
  const preview = runControlAppend(valid.packageDir, valid.input);
  assert.equal(preview.status, 0, preview.stderr || preview.stdout);
  assert.equal(JSON.parse(preview.stdout).applied, false);

  const tamperedTree = pendingLotResultPackage(t, { outputKind: 'tree' });
  fs.writeFileSync(path.join(tamperedTree.repoRoot, tamperedTree.outputPath, 'nested', 'b.txt'), 'tampered\n');
  const treeFailure = runControlAppend(tamperedTree.packageDir, tamperedTree.input);
  assert.equal(treeFailure.status, 1);
  assert.equal(JSON.parse(treeFailure.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const forgedDeletion = pendingLotResultPackage(t, { includeDeleted: true });
  fs.writeFileSync(path.join(forgedDeletion.repoRoot, 'src', 'app', 'removed.js'), 'still present\n');
  const deletionFailure = runControlAppend(forgedDeletion.packageDir, forgedDeletion.input);
  assert.equal(deletionFailure.status, 1);
  assert.equal(JSON.parse(deletionFailure.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const symlinkedTree = pendingLotResultPackage(t, { outputKind: 'tree' });
  fs.symlinkSync('../a.txt', path.join(symlinkedTree.repoRoot, symlinkedTree.outputPath, 'nested', 'link.txt'));
  const symlinkFailure = runControlAppend(symlinkedTree.packageDir, symlinkedTree.input);
  assert.equal(symlinkFailure.status, 1);
  assert.equal(JSON.parse(symlinkFailure.stdout).error.code, 'factory-workspace-symlink');
});

test('controller-observed workspace delta rejects omitted, outside, untracked and pre-existing dirty changes', (t) => {
  const omitted = pendingLotResultPackage(t);
  omitted.input.data.result.files = omitted.input.data.result.files.slice(1);
  omitted.input.data.result.changed_paths = omitted.input.data.result.files.map((entry) => entry.path);
  const omittedResult = runControlAppend(omitted.packageDir, omitted.input);
  assert.equal(JSON.parse(omittedResult.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const untracked = pendingLotResultPackage(t);
  fs.writeFileSync(path.join(untracked.repoRoot, 'src', 'app', 'omitted-untracked.js'), 'untracked\n');
  const untrackedResult = runControlAppend(untracked.packageDir, untracked.input);
  assert.equal(JSON.parse(untrackedResult.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const outside = pendingLotResultPackage(t);
  fs.writeFileSync(path.join(outside.repoRoot, 'outside.txt'), 'outside reservation\n');
  const outsideResult = runControlAppend(outside.packageDir, outside.input);
  assert.equal(JSON.parse(outsideResult.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const deletion = pendingLotResultPackage(t, { includeDeleted: true });
  deletion.input.data.result.files = deletion.input.data.result.files.filter((entry) => entry.path !== 'src/app/removed.js');
  deletion.input.data.result.changed_paths = deletion.input.data.result.files.map((entry) => entry.path);
  const deletionResult = runControlAppend(deletion.packageDir, deletion.input);
  assert.equal(JSON.parse(deletionResult.stdout).error.code, 'factory-workspace-delta-declaration-mismatch');

  const dirty = pendingLotResultPackage(t);
  const dirtyLoaded = loadFactoryPackage(dirty.packageDir);
  const beforeStart = dirtyLoaded.events.slice(0, -1);
  fs.writeFileSync(path.join(dirty.packageDir, 'factory', 'events.v3.jsonl'), serializeEventLog(beforeStart));
  fs.writeFileSync(path.join(dirty.packageDir, 'factory', 'state.v3.json'), canonicalJsonPretty(reduceFactory({ plan: dirtyLoaded.plan, events: beforeStart })));
  const start = eventInput('lot_started', { reservation_id: 'RES-1', workspace_snapshot: testWorkspaceSnapshot() }, {
    run_id: beforeStart[0].run_id, expected_previous_seq: beforeStart.length, lotId: 'LOT-1', actor: actors.implementer, planHash: canonicalHash(dirtyLoaded.plan),
  });
  start.subject.package = 'package';
  const dirtyStart = runControlAppend(dirty.packageDir, start);
  assert.equal(JSON.parse(dirtyStart.stdout).error.code, 'factory-workspace-dirty-baseline');
});

test('retrospective workspace attestation requires an explicit controller base and covers base-to-final', (t) => {
  const built = pendingLotResultPackage(t, { runMode: 'retrospective_attestation' });
  const loaded = loadFactoryPackage(built.packageDir);
  const beforeStart = loaded.events.slice(0, -1);
  fs.writeFileSync(path.join(built.packageDir, 'factory', 'events.v3.jsonl'), serializeEventLog(beforeStart));
  fs.writeFileSync(path.join(built.packageDir, 'factory', 'state.v3.json'), canonicalJsonPretty(reduceFactory({ plan: loaded.plan, events: beforeStart })));
  const start = eventInput('lot_started', { reservation_id: 'RES-1' }, {
    run_id: beforeStart[0].run_id, expected_previous_seq: beforeStart.length, lotId: 'LOT-1', actor: actors.implementer, planHash: canonicalHash(loaded.plan),
  });
  start.subject.package = 'package';
  const missingBase = runControlAppend(built.packageDir, start);
  assert.equal(JSON.parse(missingBase.stdout).error.code, 'factory-retrospective-base-required');
  const preview = runControlAppend(built.packageDir, start, false, { baseRevision: built.baseRevision });
  assert.equal(preview.status, 0, preview.stdout || preview.stderr);
  const snapshot = JSON.parse(preview.stdout).event.data.workspace_snapshot;
  assert.equal(snapshot.attestation_mode, 'retrospective_attestation');
  assert.equal(snapshot.base_revision, built.baseRevision);
  assert.deepEqual(snapshot.entries, []);

  const appliedStart = runControlAppend(built.packageDir, start, true, { baseRevision: built.baseRevision });
  assert.equal(appliedStart.status, 0, appliedStart.stdout || appliedStart.stderr);
  const appliedResult = runControlAppend(built.packageDir, built.input, true);
  assert.equal(appliedResult.status, 0, appliedResult.stdout || appliedResult.stderr);
  assert.equal(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code.startsWith('factory-retrospective-workspace')), false);
  fs.appendFileSync(path.join(built.repoRoot, 'src', 'app', 'index.js'), 'post-attestation drift\n');
  assert.ok(validateFactoryPackageV3(built.packageDir).some((finding) => finding.code === 'factory-retrospective-workspace-drift'));
});

test('diff metrics use exact Git numstat and an operator-bound override is required above policy', (t) => {
  const metricRoot = temporary(t);
  git(metricRoot, ['init', '-q']);
  git(metricRoot, ['config', 'user.email', 'factory@example.invalid']);
  git(metricRoot, ['config', 'user.name', 'Factory Test']);
  const metricPath = path.join(metricRoot, 'sample.txt');
  fs.writeFileSync(metricPath, `${Array.from({ length: 1000 }, (_, index) => `line-${index}`).join('\n')}\n`);
  git(metricRoot, ['add', '.']);
  git(metricRoot, ['commit', '-qm', 'metric baseline']);
  const metricBase = git(metricRoot, ['rev-parse', 'HEAD']);
  fs.writeFileSync(metricPath, 'one-line\n');
  const truncated = observeChangeMetrics({ workspaceRoot: metricRoot, baseRevision: metricBase, files: [{ path: 'sample.txt', status: 'present', sha256: fileHash(metricPath) }] });
  assert.equal(truncated.added_lines, 1);
  assert.equal(truncated.deleted_lines, 1000);
  fs.writeFileSync(metricPath, `${Array.from({ length: 1000 }, (_, index) => index === 500 ? 'changed-one-line' : `line-${index}`).join('\n')}\n`);
  const oneLine = observeChangeMetrics({ workspaceRoot: metricRoot, baseRevision: metricBase, files: [{ path: 'sample.txt', status: 'present', sha256: fileHash(metricPath) }] });
  assert.equal(oneLine.added_lines, 1);
  assert.equal(oneLine.deleted_lines, 1);

  const blocked = pendingLotResultPackage(t, { sourceContent: `${'added\n'.repeat(900)}` });
  const blockedResult = runControlAppend(blocked.packageDir, blocked.input);
  assert.equal(blockedResult.status, 1);
  assert.equal(JSON.parse(blockedResult.stdout).error.code, 'factory-diff-budget-exceeded');

  const allowed = pendingLotResultPackage(t, { sourceContent: `${'added\n'.repeat(900)}` });
  const loaded = loadFactoryPackage(allowed.packageDir);
  const override = eventInput('diff_budget_overridden', {
    reason: 'Approved generated migration is intentionally larger than the bounded default',
    approved_by: 'operator', approved_at: AT,
    limits: { max_files: 12, max_added_lines: 1200, max_deleted_lines: 800, max_binary_files: 0 },
  }, { run_id: loaded.events[0].run_id, expected_previous_seq: loaded.events.length, lotId: 'LOT-1', planHash: canonicalHash(loaded.plan) });
  override.subject.package = 'package';
  const applied = runControlAppend(allowed.packageDir, override, true);
  assert.equal(applied.status, 0, applied.stdout || applied.stderr);
  allowed.input.expected_previous_seq += 1;
  const permitted = runControlAppend(allowed.packageDir, allowed.input);
  assert.equal(permitted.status, 0, permitted.stdout || permitted.stderr);
  assert.equal(JSON.parse(permitted.stdout).event.data.result.workspace_delta.budget.source, 'operator_override');
});

test('controlled append is dry-run by default and writes one canonical line under lock', (t) => {
  const repoRoot = temporary(t);
  const packageDir = path.join(repoRoot, 'package');
  git(repoRoot, ['init', '-q']);
  fs.mkdirSync(path.join(packageDir, 'factory'), { recursive: true });
  const input = eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { run_id: 'RUN-CONTROLLED-APPEND' });
  const preview = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: false });
  const eventFile = path.join(packageDir, 'factory', 'events.v3.jsonl');
  assert.equal(preview.applied, false);
  assert.equal(fs.existsSync(eventFile), false);
  const applied = appendEventFile({ repoRoot, packageDir, eventInput: input, apply: true });
  assert.equal(applied.applied, true);
  assert.deepEqual(parseEventLog(fs.readFileSync(eventFile, 'utf8')), applied.events);
  assert.equal(fs.readdirSync(path.join(repoRoot, '.git', 'factory-locks')).length, 0);
});

test('controller materializes committed convention bytes before reservation and rejects drift', (t) => {
  const repoRoot = temporary(t);
  const packageDir = path.join(repoRoot, 'package');
  const factoryDir = path.join(packageDir, 'factory');
  const sourcePath = path.join(repoRoot, 'src', 'reference.js');
  const specPath = path.join(packageDir, 'SPECIFICATION.md');
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'factory@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Factory Test']);
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'export const establishedStyle = true;\n');
  fs.writeFileSync(specPath, '# Convention contract fixture\n');
  const specSha = normalizedFileHash(specPath);
  const plan = validPlan([lot('LOT-1', {
    read_claims: [{ kind: 'prefix', path: 'src' }, { kind: 'exact', path: 'package/SPECIFICATION.md' }],
    handoff: {
      inputs: [{ id: 'spec', path: 'package/SPECIFICATION.md', sha256: specSha }],
      outputs: [{ id: 'result', path: 'src/app/LOT-1.result.json' }],
      include_private_reasoning: false,
    },
  })]);
  const events = approvedHistory(plan, {
    specSha,
    packageRef: 'package',
    includePreimplementationContracts: false,
  });
  fs.writeFileSync(path.join(factoryDir, 'plan.v3.json'), canonicalJsonPretty(plan));
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({
    plan,
    events,
    current: { spec_exists: true, spec_sha256: specSha, plan_sha256: canonicalHash(plan) },
  })));
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'convention baseline']);
  const revision = git(repoRoot, ['rev-parse', 'HEAD']);

  const observation = eventInput('lot_conventions_observed', {
    observed_conventions: [{
      id: 'existing-module-style',
      rule: 'preserve the established export style',
      examples: [{ path: 'src/reference.js' }],
    }],
  }, {
    run_id: events[0].run_id,
    expected_previous_seq: events.length,
    lotId: 'LOT-1',
    planHash: canonicalHash(plan),
    actor: conventionObserver(plan.lots[0]),
  });
  observation.subject.package = 'package';
  const applied = runControlAppend(packageDir, observation, true);
  assert.equal(applied.status, 0, applied.stdout || applied.stderr);
  const materialized = JSON.parse(applied.stdout).event.data;
  assert.equal(materialized.source_revision, revision);
  assert.deepEqual(materialized.observed_conventions[0].examples, [repositoryByteReference(repoRoot, 'src/reference.js')]);
  assert.equal(materialized.contract_sha256, preimplementationConventionDigest(materialized));

  const loaded = loadFactoryPackage(packageDir);
  const wave = eventInput('wave_reserved', { reservations: [{ lot_id: 'LOT-1', reservation_id: 'RES-1' }] }, {
    run_id: loaded.events[0].run_id,
    expected_previous_seq: loaded.events.length,
    planHash: canonicalHash(plan),
  });
  wave.subject.package = 'package';
  assert.equal(runControlAppend(packageDir, wave).status, 0);

  fs.writeFileSync(sourcePath, 'export const establishedStyle = false;\n');
  const stale = runControlAppend(packageDir, wave);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).error.code, 'factory-preimplementation-contract-stale');
});

test('event log append rejects symlinked control files and parents', (t) => {
  const repoRoot = temporary(t);
  const packageDir = path.join(repoRoot, 'package');
  const factoryDir = path.join(packageDir, 'factory');
  const outside = path.join(temporary(t), 'outside.jsonl');
  fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.writeFileSync(outside, '');
  fs.symlinkSync(outside, path.join(factoryDir, 'events.v3.jsonl'));
  const input = eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { run_id: 'RUN-SYMLINK-APPEND' });
  assert.throws(
    () => appendEventFile({ repoRoot, packageDir, eventInput: input, apply: true }),
    (error) => ['factory-confined-path-symlink', 'factory-confined-file-symlink'].includes(error.code),
  );
  assert.equal(fs.readFileSync(outside, 'utf8'), '');

  const parentRepo = temporary(t);
  const parentPackage = path.join(parentRepo, 'package');
  const outsideFactory = path.join(temporary(t), 'factory');
  fs.mkdirSync(path.join(parentRepo, '.git'), { recursive: true });
  fs.mkdirSync(parentPackage, { recursive: true });
  fs.mkdirSync(outsideFactory, { recursive: true });
  fs.symlinkSync(outsideFactory, path.join(parentPackage, 'factory'));
  assert.throws(
    () => appendEventFile({ repoRoot: parentRepo, packageDir: parentPackage, eventInput: input, apply: true }),
    (error) => error.code === 'factory-confined-path-symlink',
  );
});

test('controller locks reject symlinked Git metadata and lock directories', (t) => {
  const lockRepo = temporary(t);
  git(lockRepo, ['init', '-q']);
  const lockPackage = path.join(lockRepo, 'package');
  fs.mkdirSync(path.join(lockPackage, 'factory'), { recursive: true });
  const outsideLocks = path.join(temporary(t), 'outside-locks');
  fs.mkdirSync(outsideLocks);
  fs.symlinkSync(outsideLocks, path.join(lockRepo, '.git', 'factory-locks'));
  const input = eventInput('package_initialized', { schema_version: 3, run_mode: 'live' }, { run_id: 'RUN-LOCK-SYMLINK' });
  assert.throws(
    () => appendEventFile({ repoRoot: lockRepo, packageDir: lockPackage, eventInput: input, apply: true }),
    (error) => error.code === 'factory-controller-lock-directory',
  );

  const markerRepo = temporary(t);
  const markerPackage = path.join(markerRepo, 'package');
  const outsideGit = path.join(temporary(t), 'git-metadata');
  fs.mkdirSync(outsideGit);
  fs.mkdirSync(path.join(markerPackage, 'factory'), { recursive: true });
  fs.symlinkSync(outsideGit, path.join(markerRepo, '.git'));
  assert.throws(
    () => appendEventFile({ repoRoot: markerRepo, packageDir: markerPackage, eventInput: input, apply: true }),
    (error) => error.code === 'factory-controller-git-dir-symlink',
  );
});

test('factory package rejects symlinked plan, state and evidence reads', (t) => {
  for (const target of ['plan', 'state', 'evidence']) {
    const built = validGitBackedPackage(t);
    const file = target === 'plan'
      ? path.join(built.factoryDir, 'plan.v3.json')
      : target === 'state'
        ? path.join(built.factoryDir, 'state.v3.json')
        : built.manifestPath;
    const outside = path.join(temporary(t), `${target}.json`);
    fs.copyFileSync(file, outside);
    fs.unlinkSync(file);
    fs.symlinkSync(outside, file);
    const findings = validateFactoryPackageV3(built.packageDir);
    assert.ok(findings.some((finding) => finding.code === 'factory-confined-path-symlink'), `${target}: ${JSON.stringify(findings)}`);
  }
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

function actor(role, executionId, capabilities, planned = null, used = null, modelFamily = null) {
  return {
    role,
    execution_id: executionId,
    capabilities,
    model: { planned, requested: used, used, model_family: modelFamily || `${role}-family` },
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
    subject: { package: overrides.packageRef || PACKAGE, lot_id: overrides.lotId || null },
    basis: {
      spec_sha256: SHA.spec,
      plan_sha256: overrides.planHash || null,
      candidate_sha: overrides.candidateSha || null,
      diff_sha256: overrides.diffSha || data?.result?.diff_sha256 || null,
    },
    data: deepCopy(data),
  };
}

function push(events, type, data = {}, overrides = {}) {
  const payload = type === 'lot_started' && !data.workspace_snapshot
    ? { ...data, workspace_snapshot: testWorkspaceSnapshot() }
    : data;
  const event = buildEvent(events, eventInput(type, payload, {
    ...overrides,
    packageRef: overrides.packageRef || events[0]?.subject?.package,
    run_id: events[0]?.run_id || overrides.run_id || RUN_ID,
    expected_previous_seq: events.length,
  }));
  events.push(event);
  return event;
}

function approvedHistory(plan, {
  specSha = SHA.spec,
  packageRef = PACKAGE,
  runMode = 'live',
  modelFamilies = {
    economy: 'model-economy-family',
    standard: 'model-standard-family',
    expert: 'model-expert-family',
    reviewer: 'model-reviewer-family',
  },
  sourceRevision = SHA.base,
  preimplementationConventions = null,
  includePreimplementationContracts = true,
} = {}) {
  const events = [];
  push(events, 'package_initialized', { schema_version: 3, run_mode: runMode }, { packageRef });
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
    model_families: deepCopy(modelFamilies),
  });
  if (includePreimplementationContracts) {
    for (const plannedLot of plan.lots.filter((candidate) => candidate.dependencies.length === 0)) {
      const contract = testPreimplementationConventionContract({
        sourceRevision,
        observedConventions: preimplementationConventions,
      });
      push(events, 'lot_conventions_observed', contract, {
        lotId: plannedLot.id,
        planHash,
        actor: conventionObserver(plannedLot, modelFamilies),
      });
    }
  }
  return events;
}

function throughLotResult(plan, options = {}) {
  const workspaceSnapshot = options.workspaceSnapshot || testWorkspaceSnapshot();
  const events = approvedHistory(plan, {
    ...options,
    sourceRevision: workspaceSnapshot.base_revision,
    preimplementationConventions: options.preimplementationConventions || options.observedConventions,
  });
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  push(events, 'lot_started', { reservation_id: 'RES-1', workspace_snapshot: workspaceSnapshot }, { lotId: 'LOT-1', actor: options.implementerActor || actors.implementer });
  const outputPath = plan.lots.find((lot) => lot.id === 'LOT-1')?.handoff?.outputs?.[0]?.path || 'src/app/LOT-1.result.json';
  push(events, 'lot_result_reported', {
    result: result(options.changedPaths || ['src/app/index.js'], {
      outputPath,
      outputSha: options.outputSha,
      outputKind: options.outputKind,
      fileDigests: options.fileDigests,
      deletedPaths: options.deletedPaths,
      fromSnapshot: workspaceSnapshot,
      verification: options.verification,
      preimplementationContractSha: [...events].reverse().find((event) => event.type === 'lot_conventions_observed' && event.subject.lot_id === 'LOT-1')?.data.contract_sha256,
      observedConventions: options.observedConventions,
      refactorAssessment: options.refactorAssessment,
    }),
  }, { lotId: 'LOT-1', actor: options.implementerActor || actors.implementer });
  return events;
}

function throughCandidate(plan, { candidateSha = SHA.candidate, ...options } = {}) {
  const events = throughLotResult(plan, options);
  const reviewedSnapshot = options.reviewedSnapshot || testReviewedSnapshot(SHA.base);
  push(events, 'lot_reviewed', {
    diff_sha256: lastLotDiff(events), verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer });
  push(events, 'lot_integrated', {}, { lotId: 'LOT-1' });
  push(events, 'integration_verified', integrationResult(reviewedSnapshot, options.integrationVerification));
  push(events, 'consolidated_reviewed', {
    verdict: 'passed', findings: [], fresh_context: true, reviewed_snapshot: reviewedSnapshot,
  }, { actor: actors.reviewer });
  const corpusEvent = push(events, 'corpus_closed', options.corpusPayload || testCorpusCloseout({ corpusSha: options.corpusSha || SHA.corpus }));
  const candidateBinding = options.candidateBinding || (options.repoRoot
    ? buildCandidateBinding({
      repoRoot: options.repoRoot,
      packageRef: options.packageRef || PACKAGE,
      reviewedSnapshot,
      candidateSha,
      corpusEvent,
    })
    : testCandidateBinding({ candidateSha, reviewedSnapshot, corpusEvent }));
  push(events, 'candidate_frozen', {
    candidate_sha: candidateSha,
    binding: candidateBinding,
  });
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
    manifest_locator: repoManifestLocator(),
    evidence_manifest_sha256: SHA.manifest,
    evidence_sha: SHA.evidence,
    publication: { mode: 'evidence_only_commit' },
  });
  push(events, 'release_reviewed', {
    verdict: 'passed', fresh_context: true, findings: [],
    independence_exception: modelIndependenceException(plan, ['model-reviewer-family', 'model-standard-family']),
  }, { actor: actors.reviewer, planHash: canonicalHash(plan) });
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
      id: `FINDING-${rule}`.replace(/[^A-Za-z0-9._-]/g, '-'),
      severity: 'P0', rule, location: 'src/app/index.js:1', evidence: 'reproduced', impact: 'release blocker', status: 'open',
    }],
  }, { lotId: 'LOT-1', actor: actors.reviewer });
}

function reviewFinding({ id = 'FINDING-review-rule', severity = 'P1', status = 'open' } = {}) {
  return {
    id,
    severity,
    rule: 'review-rule',
    location: 'src/app/index.js:1',
    evidence: 'independent reproduction',
    impact: 'release risk',
    status,
  };
}

function exhaustedLotHistory(plan) {
  const events = throughLotResult(plan);
  pushFailedReview(events, lastLotDiff(events), 'first-correction');
  push(events, 'lot_started', { reservation_id: 'RES-1' }, { lotId: 'LOT-1', actor: actors.implementer });
  push(events, 'lot_result_reported', { result: result(['src/app/fixed.js']) }, { lotId: 'LOT-1', actor: actors.implementer });
  pushFailedReview(events, lastLotDiff(events), 'second-correction');
  return events;
}

function result(changedPaths, {
  outputPath = 'src/app/LOT-1.result.json',
  outputSha = null,
  outputKind = 'file',
  fileDigests = {},
  deletedPaths = [],
  fromSnapshot = testWorkspaceSnapshot(),
  verification = null,
  preimplementationContractSha = testPreimplementationConventionContract().contract_sha256,
  observedConventions = null,
  refactorAssessment = { status: 'not_required', reason: 'existing conventions support the bounded change' },
} = {}) {
  const deleted = new Set(deletedPaths);
  const paths = [...new Set(changedPaths)].sort();
  const files = paths.map((filePath) => deleted.has(filePath)
    ? { path: filePath, status: 'deleted', sha256: null }
    : { path: filePath, status: 'present', sha256: fileDigests[filePath] || canonicalHash({ fixture: filePath }) });
  const toSnapshot = testWorkspaceSnapshot({
    entries: files.map((entry) => entry.status === 'present'
      ? { path: entry.path, origin: 'tracked', status: 'present', sha256: entry.sha256 }
      : { path: entry.path, origin: 'tracked', status: 'deleted', sha256: null }),
    exclusions: fromSnapshot.exclusions,
    workspaceId: fromSnapshot.workspace_id,
    baseRevision: fromSnapshot.base_revision,
    workspaceMode: fromSnapshot.workspace_mode,
    attestationMode: fromSnapshot.attestation_mode,
  });
  const envelope = {
    algorithm: ENVELOPE_HASH_ALGORITHM,
    base_revision: fromSnapshot.base_revision,
    changed_paths: paths,
    files,
    workspace_delta: {
      algorithm: WORKSPACE_DELTA_ALGORITHM,
      from_snapshot_sha256: fromSnapshot.snapshot_sha256,
      to_snapshot: toSnapshot,
      files_sha256: changeInventoryDigest(files),
      metrics: { algorithm: 'git-numstat-plus-untracked-v1', files: files.length, added_lines: files.filter((entry) => entry.status === 'present').length, deleted_lines: files.filter((entry) => entry.status === 'deleted').length, binary_files: 0 },
      budget: { source: 'policy_default', max_files: 12, max_added_lines: 800, max_deleted_lines: 800, max_binary_files: 0, override_event_id: null },
    },
    diff_sha256: null,
    outputs: [{
      id: 'result',
      path: outputPath,
      kind: outputKind,
      algorithm: outputKind === 'tree' ? TREE_ARTIFACT_HASH_ALGORITHM : FILE_ARTIFACT_HASH_ALGORITHM,
      sha256: outputSha || canonicalHash({ fixture: outputPath }),
    }],
    verification: verification || [testVerificationReceipt('unit')],
    preimplementation_contract_sha256: preimplementationContractSha,
    observed_conventions: observedConventions || [{
      id: 'existing-module-style',
      rule: 'preserve the existing module and naming style',
      examples: [{ path: outputPath, sha256: outputSha || canonicalHash({ fixture: outputPath }), bytes: 1 }],
    }],
    refactor_assessment: refactorAssessment,
    blockers: [],
  };
  envelope.diff_sha256 = lotResultDigest(envelope);
  return envelope;
}

function testPreimplementationConventionContract({
  sourceRevision = SHA.base,
  observedConventions = null,
} = {}) {
  const contract = {
    algorithm: ENVELOPE_HASH_ALGORITHM,
    source_revision: sourceRevision,
    observed_conventions: deepCopy(observedConventions || [{
      id: 'existing-module-style',
      rule: 'preserve the existing module and naming style',
      examples: [{ path: 'src/reference.js', sha256: SHA.integration, bytes: 1 }],
    }]),
    contract_sha256: null,
  };
  contract.contract_sha256 = preimplementationConventionDigest(contract);
  return contract;
}

function conventionObserver(plannedLot, modelFamilies = {
  economy: 'model-economy-family',
  standard: 'model-standard-family',
  expert: 'model-expert-family',
}) {
  const profile = plannedLot.model_role;
  return actor(plannedLot.agent_role, `observer-${plannedLot.id}`, ['read'], profile, `model-${profile}`, modelFamilies[profile]);
}

function testVerificationReceipt(command = 'unit', {
  id = command,
  stdout = { path: 'doc/verification/stdout.log', sha256: SHA.tests, bytes: 1 },
  stderr = { path: 'doc/verification/stderr.log', sha256: SHA.integration, bytes: 0 },
  artifacts = [],
  runnerKind = 'controller_observed',
} = {}) {
  const receipt = {
    algorithm: VERIFICATION_RECEIPT_ALGORITHM,
    id,
    command,
    status: 'passed',
    runner: { kind: runnerKind, id: 'controller-1', version: 1, attestation_ref: 'controller:controller-1' },
    exit_code: 0,
    stdout,
    stderr,
    artifacts,
    receipt_sha256: null,
  };
  receipt.receipt_sha256 = verificationReceiptDigest(receipt);
  return receipt;
}

function testWorkspaceSnapshot({
  entries = [],
  exclusions = [],
  workspaceId = 'e'.repeat(64),
  baseRevision = SHA.base,
  workspaceMode = 'isolated_worktree',
  attestationMode = 'live',
} = {}) {
  const snapshot = {
    v: 1,
    algorithm: WORKSPACE_SNAPSHOT_ALGORITHM,
    workspace_id: workspaceId,
    workspace_mode: workspaceMode,
    attestation_mode: attestationMode,
    base_revision: baseRevision,
    exclusions: [...exclusions].sort(),
    entries: deepCopy(entries).sort((left, right) => left.path.localeCompare(right.path)),
    snapshot_sha256: null,
  };
  snapshot.snapshot_sha256 = workspaceSnapshotDigest(snapshot);
  return snapshot;
}

function testCorpusCloseout({ corpusSha = SHA.corpus, exclusions = [] } = {}) {
  const files = [{ path: 'doc/CORPUS_MANIFEST.md', sha256: corpusSha }];
  const payload = {
    root_path: 'doc',
    algorithm: CORPUS_TREE_ALGORITHM,
    exclusions: [...exclusions].sort(),
    files,
    corpus_tree_sha256: null,
    validation: {
      algorithm: CORPUS_VALIDATION_ALGORITHM,
      validator_path: 'scripts/validate-corpus.mjs',
      validator_sha256: SHA.tests,
      arguments: ['--json'],
      status: 'passed',
      result_sha256: SHA.integration,
    },
  };
  payload.corpus_tree_sha256 = corpusTreeDigest(payload);
  return payload;
}

function testReviewedSnapshot(commitSha = SHA.candidate) {
  const snapshot = {
    algorithm: REVIEWED_TREE_ALGORITHM,
    commit_sha: commitSha,
    git_tree: commitSha,
    file_count: 1,
    tree_sha256: SHA.integration,
    snapshot_sha256: null,
  };
  snapshot.snapshot_sha256 = reviewedSnapshotDigest(snapshot);
  return snapshot;
}

function testCandidateBinding({
  candidateSha = SHA.candidate,
  reviewedSnapshot = testReviewedSnapshot(SHA.base),
  corpusEvent,
  authorizedPaths = [],
} = {}) {
  const closeoutSequence = corpusEvent?.seq || 13;
  const baseEventCount = closeoutSequence - 3;
  const controlTransition = {
    algorithm: CONTROL_TRANSITION_ALGORITHM,
    events_path: `${PACKAGE}/factory/events.v3.jsonl`,
    state_path: `${PACKAGE}/factory/state.v3.json`,
    base_commit_sha: reviewedSnapshot.commit_sha,
    candidate_commit_sha: candidateSha,
    base_events_sha256: SHA.diff1,
    candidate_events_sha256: SHA.diff2,
    base_state_sha256: SHA.integration,
    candidate_state_sha256: SHA.tests,
    base_event_count: baseEventCount,
    candidate_event_count: closeoutSequence,
    appended_event_ids: [baseEventCount + 1, baseEventCount + 2, baseEventCount + 3].map((seq) => `EVT-${String(seq).padStart(6, '0')}`),
    appended_events_sha256: SHA.manifest,
    transition_sha256: null,
  };
  controlTransition.transition_sha256 = controlTransitionDigest(controlTransition);
  const binding = {
    algorithm: CANDIDATE_BINDING_ALGORITHM,
    reviewed_snapshot_sha256: reviewedSnapshot.snapshot_sha256,
    candidate_snapshot: testReviewedSnapshot(candidateSha),
    corpus_closeout_event_id: corpusEvent?.event_id || 'EVT-000013',
    corpus_tree_sha256: corpusEvent?.data?.corpus_tree_sha256 || SHA.corpus,
    authorized_paths: [...authorizedPaths].sort(),
    control_transition: controlTransition,
    binding_sha256: null,
  };
  binding.binding_sha256 = candidateBindingDigest(binding);
  return binding;
}

function lastLotDiff(events) {
  return [...events].reverse().find((event) => event.type === 'lot_result_reported')?.data?.result?.diff_sha256;
}

function integrationResult(reviewedSnapshot = testReviewedSnapshot(), verifications = null) {
  const envelope = {
    status: 'passed',
    algorithm: ENVELOPE_HASH_ALGORITHM,
    verifications: verifications || [testVerificationReceipt('unit')],
    reviewed_snapshot: reviewedSnapshot,
    verification_sha256: null,
  };
  envelope.verification_sha256 = integrationVerificationDigest(envelope);
  return envelope;
}

function releasedStateAfterChange(classes, affectedLots = [], suppliedPlan = null) {
  const plan = suppliedPlan || validPlan();
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
    media_type: 'application/zip',
    ...overrides,
  };
}

function repoManifestLocator(pathValue = 'factory/evidence-manifest.v3.json', digest = SHA.manifest) {
  return { kind: 'repo_file', path: pathValue, digest_sha256: digest };
}

function ciManifestLocator({
  digest = SHA.manifest,
  bundleDigest = `sha256:${'9'.repeat(64)}`,
  artifactId = 'bundle-123',
  name = 'factory-evidence-bundle-ci-123',
  runId = 'ci-123',
  manifestPath = 'evidence-manifest.yaml',
} = {}) {
  return {
    kind: 'ci_artifact',
    provider: 'github_actions',
    artifact_id: artifactId,
    name,
    run_id: runId,
    path: manifestPath,
    digest_sha256: digest,
    bundle_digest: bundleDigest,
    attestation_ref: `github-actions:${runId}:${artifactId}`,
  };
}

function modelIndependenceException(plan, authorModelFamilies, reviewerModelFamily = 'model-reviewer-family') {
  return {
    reason: 'Operator approved this bounded same-family review with a distinct execution and fresh context',
    approved_by: 'release-owner',
    approved_at: AT,
    author_model_families: [...new Set(authorModelFamilies)].sort(),
    reviewer_model_family: reviewerModelFamily,
    plan_sha256: canonicalHash(plan),
  };
}

function validGitBackedPackage(t, {
  publicationMode = 'ci_artifact',
  outputKind = 'file',
  includeDeleted = false,
  outputFileContent = '{"result":"ok"}\n',
} = {}) {
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
  const corpusManifestPath = path.join(repoRoot, 'doc', 'CORPUS_MANIFEST.md');
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src', 'app'), { recursive: true });
  fs.writeFileSync(specPath, '# Approved specification\n\nAC-001: behavior works.\n');
  fs.writeFileSync(environmentPath, 'schema_version: 1\nprofile: local-acceptance\n');
  fs.writeFileSync(acceptancePath, 'schema_version: 1\ncases:\n  - id: CASE-001\n');
  fs.writeFileSync(corpusManifestPath, '# Corpus manifest\n');
  fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'scripts', 'validate-corpus.mjs'), '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({summary:{ok:true,counts:{P0:0,P1:0,P2:0}},findings:[]}));\n');
  fs.writeFileSync(path.join(repoRoot, 'src', 'app', 'index.js'), 'export const value = 1;\n');
  const outputPath = outputKind === 'tree' ? 'src/app/generated' : 'src/app/LOT-1.result.json';
  if (outputKind === 'tree') {
    fs.mkdirSync(path.join(repoRoot, outputPath, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, outputPath, 'a.txt'), 'alpha\n');
    fs.writeFileSync(path.join(repoRoot, outputPath, 'nested', 'b.txt'), 'beta\n');
  } else {
    fs.writeFileSync(path.join(repoRoot, outputPath), outputFileContent);
  }
  const outputSha = repositoryArtifactDigest({ repoRoot, repoPath: outputPath }).sha256;
  const specSha = fileHash(specPath);
  const plan = validPlan([lot('LOT-1', {
    read_claims: [
      { kind: 'prefix', path: 'src' },
      { kind: 'exact', path: `${packageRef}/SPECIFICATION.md` },
    ],
    handoff: {
      inputs: [{ id: 'spec', path: `${packageRef}/SPECIFICATION.md`, sha256: specSha }],
      outputs: [{ id: 'result', path: outputPath }],
      include_private_reasoning: false,
    },
  })]);
  plan.environment_contract = `${packageRef}/environment-contract.yaml`;
  plan.acceptance_criteria[0].proved_by = ['CASE-001'];
  fs.writeFileSync(path.join(factoryDir, 'plan.v3.json'), canonicalJsonPretty(plan));

  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'implementation base']);
  const implementationBaseSha = git(repoRoot, ['rev-parse', 'HEAD']);

  fs.mkdirSync(runDir, { recursive: true });
  const artifactPath = path.join(runDir, 'screen.txt');
  fs.writeFileSync(artifactPath, 'verified screen\n');
  const artifacts = [{
    id: 'screen', path: 'screen.txt', media_type: 'text/plain',
    sha256: `sha256:${fileHash(artifactPath)}`, bytes: fs.statSync(artifactPath).size,
  }];
  const verificationDir = path.join(runDir, 'verification');
  fs.mkdirSync(verificationDir, { recursive: true });
  fs.writeFileSync(path.join(verificationDir, 'stdout.log'), 'unit verification passed\n');
  fs.writeFileSync(path.join(verificationDir, 'stderr.log'), '');
  const stdoutPath = `${packageRef}/acceptance/runs/${RUN_ID}/verification/stdout.log`;
  const stderrPath = `${packageRef}/acceptance/runs/${RUN_ID}/verification/stderr.log`;
  const verification = [testVerificationReceipt('unit', {
    stdout: repositoryByteReference(repoRoot, stdoutPath),
    stderr: repositoryByteReference(repoRoot, stderrPath),
  })];
  const observedConventions = [{
    id: 'existing-module-style',
    rule: 'preserve the existing module and naming style',
    examples: [repositoryByteReference(repoRoot, 'src/app/index.js')],
  }];
  const workspaceSnapshot = testWorkspaceSnapshot({
    exclusions: controllerWorkspaceExclusions(packageRef),
    workspaceId: sha256(fs.realpathSync(repoRoot)),
    baseRevision: implementationBaseSha,
    workspaceMode: 'repository',
  });
  const sourceEvents = throughLotResult(plan, {
    specSha,
    packageRef,
    workspaceSnapshot,
    outputSha,
    outputKind,
    fileDigests: { 'src/app/index.js': fileHash(path.join(repoRoot, 'src', 'app', 'index.js')) },
    changedPaths: includeDeleted ? ['src/app/index.js', 'src/app/removed.js'] : ['src/app/index.js'],
    deletedPaths: includeDeleted ? ['src/app/removed.js'] : [],
    verification,
    observedConventions,
  });
  push(sourceEvents, 'lot_reviewed', {
    diff_sha256: lastLotDiff(sourceEvents), verdict: 'passed', findings: [], fresh_context: true,
  }, { lotId: 'LOT-1', actor: actors.reviewer });
  push(sourceEvents, 'lot_integrated', {}, { lotId: 'LOT-1' });
  const sourceCurrent = {
    plan_sha256: canonicalHash(plan),
    spec_exists: true,
    spec_sha256: normalizedFileHash(specPath),
    evidence_manifest_sha256: null,
    provenance_status: null,
  };
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(sourceEvents));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({ plan, events: sourceEvents, current: sourceCurrent })));
  git(repoRoot, ['add', `${packageRef}/factory/events.v3.jsonl`, `${packageRef}/factory/state.v3.json`]);
  git(repoRoot, ['commit', '-qm', 'reviewed control prefix']);
  const reviewedSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const reviewedSnapshot = captureGitCommitSnapshot({ repoRoot, revision: reviewedSha });
  push(sourceEvents, 'integration_verified', integrationResult(reviewedSnapshot, verification));
  push(sourceEvents, 'consolidated_reviewed', {
    verdict: 'passed', findings: [], fresh_context: true, reviewed_snapshot: reviewedSnapshot,
  }, { actor: actors.reviewer });
  const corpusPayload = captureCorpusCloseout({ repoRoot, packageRef });
  const corpusEvent = push(sourceEvents, 'corpus_closed', corpusPayload);
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(sourceEvents));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({ plan, events: sourceEvents, current: sourceCurrent })));
  git(repoRoot, ['add', `${packageRef}/factory/events.v3.jsonl`, `${packageRef}/factory/state.v3.json`]);
  git(repoRoot, ['commit', '-qm', 'corpus-closed candidate']);
  const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const binding = buildCandidateBinding({ repoRoot, packageRef, reviewedSnapshot, candidateSha, corpusEvent });
  const events = [...sourceEvents];
  push(events, 'candidate_frozen', { candidate_sha: candidateSha, binding });
  push(events, 'acceptance_started', {}, { actor: actors.acceptance });
  push(events, 'acceptance_completed', {
    status: 'passed',
    tested_sha: candidateSha,
    test_bundle_sha256: SHA.tests,
    case_results: [{ id: 'CASE-001', outcome: 'passed', oracle_results: [{ id: 'oracle-1', outcome: 'passed' }] }],
  }, { actor: actors.acceptance });
  const tree = observedSourceTreeDigest(repoRoot, candidateSha, [`${packageRef}/acceptance/runs`]);
  assert.deepEqual(tree.findings, []);
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
  if (publicationMode === 'ci_artifact') {
    fs.writeFileSync(path.join(factoryDir, 'evidence-manifest.v3.json'), canonicalJsonPretty(manifest));
  }

  let evidenceSha = null;
  if (publicationMode === 'evidence_only_commit') {
    git(repoRoot, ['add', `${packageRef}/acceptance/runs`]);
    git(repoRoot, ['commit', '-qm', 'publish evidence']);
    evidenceSha = git(repoRoot, ['rev-parse', 'HEAD']);
  }

  const manifestDigest = canonicalHash(manifest);
  const manifestLocator = publicationMode === 'ci_artifact'
    ? ciManifestLocator({
      digest: manifestDigest,
      bundleDigest: manifest.publication.bundle_digest,
      artifactId: manifest.publication.artifact_id,
      name: `factory-evidence-bundle-${manifest.publication.ci_run_id}`,
      runId: manifest.publication.ci_run_id,
      manifestPath: 'evidence-manifest.json',
    })
    : repoManifestLocator(`${packageRef}/acceptance/runs/${RUN_ID}/evidence-manifest.json`, manifestDigest);
  const publication = publicationMode === 'ci_artifact' ? ciEventPublication() : { mode: 'evidence_only_commit' };
  push(events, 'evidence_committed', {
    manifest_locator: manifestLocator,
    evidence_manifest_sha256: manifestDigest,
    publication,
    ...(evidenceSha ? { evidence_sha: evidenceSha } : {}),
  });
  push(events, 'release_reviewed', {
    verdict: 'passed', fresh_context: true, findings: [],
    independence_exception: modelIndependenceException(plan, ['model-reviewer-family', 'model-standard-family']),
  }, { actor: actors.reviewer, planHash: canonicalHash(plan) });
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  const loaded = loadFactoryPackage(packageDir);
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(loaded.derived));
  return {
    repoRoot,
    packageDir,
    packageRef,
    factoryDir,
    specPath,
    environmentPath,
    acceptancePath,
    corpusManifestPath,
    manifestPath: publicationMode === 'ci_artifact' ? path.join(factoryDir, 'evidence-manifest.v3.json') : manifestPath,
    plan,
    manifest,
    candidateSha,
    reviewedSha,
    corpusEvent,
    evidenceSha,
    outputPath,
    outputSha,
  };
}

function pendingLotResultPackage(t, { outputKind = 'file', includeDeleted = false, sourceContent = 'export const pending = true;\n', runMode = 'live' } = {}) {
  const repoRoot = temporary(t);
  git(repoRoot, ['init', '-q']);
  git(repoRoot, ['config', 'user.email', 'factory@example.invalid']);
  git(repoRoot, ['config', 'user.name', 'Factory Test']);
  const packageDir = path.join(repoRoot, 'package');
  const factoryDir = path.join(packageDir, 'factory');
  const specPath = path.join(packageDir, 'SPECIFICATION.md');
  const sourcePath = path.join(repoRoot, 'src', 'app', 'index.js');
  const outputPath = outputKind === 'tree' ? 'src/app/generated' : 'src/app/LOT-1.result.json';
  fs.mkdirSync(factoryDir, { recursive: true });
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(specPath, '# Pending lot specification\n');
  fs.writeFileSync(sourcePath, 'export const pending = false;\n');
  if (includeDeleted) fs.writeFileSync(path.join(repoRoot, 'src', 'app', 'removed.js'), 'export const obsolete = true;\n');

  const specSha = normalizedFileHash(specPath);
  const plan = validPlan([lot('LOT-1', {
    read_claims: [{ kind: 'prefix', path: 'src' }, { kind: 'exact', path: 'package/SPECIFICATION.md' }],
    handoff: {
      inputs: [{ id: 'spec', path: 'package/SPECIFICATION.md', sha256: specSha }],
      outputs: [{ id: 'result', path: outputPath }],
      include_private_reasoning: false,
    },
  })]);
  const events = approvedHistory(plan, {
    specSha,
    packageRef: 'package',
    runMode,
    includePreimplementationContracts: false,
  });
  fs.writeFileSync(path.join(factoryDir, 'plan.v3.json'), canonicalJsonPretty(plan));
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({
    plan,
    events,
    current: { spec_exists: true, spec_sha256: specSha, plan_sha256: canonicalHash(plan) },
  })));
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-qm', 'lot baseline']);
  const baseRevision = git(repoRoot, ['rev-parse', 'HEAD']);

  const preimplementationContract = testPreimplementationConventionContract({
    sourceRevision: baseRevision,
    observedConventions: [{
      id: 'existing-module-style',
      rule: 'preserve the existing module and naming style',
      examples: [repositoryByteReference(repoRoot, 'src/app/index.js')],
    }],
  });
  push(events, 'lot_conventions_observed', preimplementationContract, {
    lotId: 'LOT-1',
    planHash: canonicalHash(plan),
    actor: conventionObserver(plan.lots[0]),
  });
  push(events, 'wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({
    plan,
    events,
    current: { spec_exists: true, spec_sha256: specSha, plan_sha256: canonicalHash(plan) },
  })));

  const workspaceSnapshot = captureWorkspaceSnapshot({
    workspaceRoot: repoRoot,
    repositoryRoot: repoRoot,
    exclusions: controllerWorkspaceExclusions('package'),
  });
  push(events, 'lot_started', { reservation_id: 'RES-1', workspace_snapshot: workspaceSnapshot }, { lotId: 'LOT-1', actor: actors.implementer });
  fs.writeFileSync(path.join(factoryDir, 'events.v3.jsonl'), serializeEventLog(events));
  fs.writeFileSync(path.join(factoryDir, 'state.v3.json'), canonicalJsonPretty(reduceFactory({
    plan,
    events,
    current: { spec_exists: true, spec_sha256: specSha, plan_sha256: canonicalHash(plan) },
  })));

  fs.writeFileSync(sourcePath, sourceContent);
  if (includeDeleted) fs.unlinkSync(path.join(repoRoot, 'src', 'app', 'removed.js'));
  if (outputKind === 'tree') {
    fs.mkdirSync(path.join(repoRoot, outputPath, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, outputPath, 'a.txt'), 'alpha\n');
    fs.writeFileSync(path.join(repoRoot, outputPath, 'nested', 'b.txt'), 'beta\n');
  } else {
    fs.writeFileSync(path.join(repoRoot, outputPath), '{"pending":true}\n');
  }

  const verificationDir = path.join(packageDir, 'acceptance', 'runs', RUN_ID, 'verification');
  fs.mkdirSync(verificationDir, { recursive: true });
  fs.writeFileSync(path.join(verificationDir, 'stdout.log'), 'unit verification passed\n');
  fs.writeFileSync(path.join(verificationDir, 'stderr.log'), '');
  const verification = [testVerificationReceipt('unit', {
    stdout: repositoryByteReference(repoRoot, `package/acceptance/runs/${RUN_ID}/verification/stdout.log`),
    stderr: repositoryByteReference(repoRoot, `package/acceptance/runs/${RUN_ID}/verification/stderr.log`),
  })];
  const observedConventions = [{
    id: 'existing-module-style',
    rule: 'preserve the existing module and naming style',
    examples: [repositoryByteReference(repoRoot, 'src/app/index.js')],
  }];

  const outputFiles = outputKind === 'tree'
    ? [`${outputPath}/a.txt`, `${outputPath}/nested/b.txt`]
    : [outputPath];
  const changedPaths = [...['src/app/index.js', ...(includeDeleted ? ['src/app/removed.js'] : []), ...outputFiles]].sort();
  const fileDigests = Object.fromEntries(changedPaths
    .filter((repoPath) => repoPath !== 'src/app/removed.js')
    .map((repoPath) => [repoPath, fileHash(path.join(repoRoot, repoPath))]));
  const input = eventInput('lot_result_reported', {
    result: result(changedPaths, {
      outputPath,
      outputSha: repositoryArtifactDigest({ repoRoot, repoPath: outputPath }).sha256,
      outputKind,
      fileDigests,
      deletedPaths: includeDeleted ? ['src/app/removed.js'] : [],
      verification,
      preimplementationContractSha: preimplementationContract.contract_sha256,
      observedConventions,
    }),
  }, {
    lotId: 'LOT-1',
    actor: actors.implementer,
    run_id: events[0].run_id,
    expected_previous_seq: events.length,
    planHash: canonicalHash(plan),
  });
  return { repoRoot, packageDir, outputPath, input, baseRevision };
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function repositoryByteReference(repoRoot, repoPath) {
  const observed = repositoryFileObservation({ repoRoot, repoPath });
  assert.equal(observed.exists, true, `${repoPath} must exist`);
  assert.equal(observed.kind, 'file', `${repoPath} must be a regular file`);
  return { path: repoPath, sha256: observed.sha256, bytes: observed.bytes };
}

function runControl(command, packageDir) {
  return spawnSync(process.execPath, [path.join(here, 'factory-control.mjs'), command, packageDir, '--json'], {
    cwd: path.dirname(here),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function runControlAppend(packageDir, input, apply = false, { baseRevision = null, workspaceRoot = null } = {}) {
  const args = [path.join(here, 'factory-control.mjs'), 'append', packageDir, '--event-json', JSON.stringify(input), '--json'];
  if (apply) args.push('--apply');
  if (baseRevision) args.push('--base-revision', baseRevision);
  if (workspaceRoot) args.push('--workspace-root', workspaceRoot);
  return spawnSync(process.execPath, args, {
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
