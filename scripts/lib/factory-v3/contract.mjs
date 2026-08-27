import { validateActorCapabilities, validateRoleCapability } from './capabilities.mjs';
import { normalizeRepoPath, pathAllowedByPatterns, validateClaim } from './path-claims.mjs';
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
  workspaceSnapshotDigest,
} from './proof-contracts.mjs';
import {
  CANDIDATE_BINDING_ALGORITHM,
  CONTROL_TRANSITION_ALGORITHM,
  REVIEWED_TREE_ALGORITHM,
  candidateBindingDigest,
  controlTransitionDigest,
  reviewedSnapshotDigest,
} from './review-contracts.mjs';
import { VERIFICATION_RECEIPT_ALGORITHM, verificationReceiptDigest } from './verification-receipt.mjs';

export const EVENT_TYPES = new Set([
  'package_initialized', 'legacy_v1_imported',
  'spec_proposed', 'spec_approved', 'plan_proposed', 'plan_approved', 'execution_policy_resolved',
  'lot_conventions_observed', 'wave_reserved', 'lot_started', 'lot_result_reported', 'lot_reviewed', 'lot_integrated', 'lot_blocked', 'reservation_released',
  'integration_verified', 'consolidated_reviewed', 'corpus_closed', 'candidate_frozen',
  'acceptance_started', 'acceptance_completed', 'acceptance_waived', 'evidence_committed', 'release_reviewed',
  'draft_pr_planned', 'draft_pr_created',
  'artifact_change_observed', 'controller_recovery_approved', 'attempt_budget_extended',
  'diff_budget_overridden',
  'refactor_approved',
]);

export const EVENT_DATA_FIELDS = Object.freeze({
  package_initialized: ['schema_version', 'run_mode'],
  legacy_v1_imported: ['source', 'snapshot', 'legacy_paths', 'migration_status', 'blockers'],
  spec_proposed: ['spec_sha256'],
  spec_approved: ['spec_sha256', 'approved_by', 'approved_at'],
  plan_proposed: ['plan_sha256'],
  plan_approved: ['plan_sha256', 'approved_by', 'approved_at'],
  execution_policy_resolved: ['mode', 'observed_at', 'models', 'model_families'],
  lot_conventions_observed: ['algorithm', 'source_revision', 'observed_conventions', 'contract_sha256'],
  wave_reserved: ['reservations'],
  lot_started: ['reservation_id', 'workspace_snapshot'],
  lot_result_reported: ['result'],
  lot_reviewed: ['diff_sha256', 'verdict', 'findings', 'fresh_context', 'independence_exception'],
  lot_integrated: [],
  lot_blocked: ['reason', 'refactor_escalation'],
  reservation_released: ['reservation_id'],
  integration_verified: ['status', 'algorithm', 'verifications', 'reviewed_snapshot', 'verification_sha256'],
  consolidated_reviewed: ['verdict', 'findings', 'fresh_context', 'reviewed_snapshot', 'independence_exception'],
  corpus_closed: ['root_path', 'algorithm', 'exclusions', 'files', 'corpus_tree_sha256', 'validation'],
  candidate_frozen: ['candidate_sha', 'binding'],
  acceptance_started: [],
  acceptance_completed: ['status', 'tested_sha', 'test_bundle_sha256', 'case_results', 'reason'],
  acceptance_waived: ['reason', 'approved_by', 'approved_at'],
  evidence_committed: ['manifest_locator', 'evidence_manifest_sha256', 'evidence_sha', 'publication'],
  release_reviewed: ['verdict', 'fresh_context', 'findings', 'independence_exception'],
  draft_pr_planned: ['draft', 'actions', 'candidate_sha', 'payload_sha256'],
  draft_pr_created: ['draft', 'actions', 'candidate_sha', 'pr_url'],
  artifact_change_observed: ['classes', 'affected_lots', 'reason'],
  controller_recovery_approved: ['reason', 'approved_by', 'approved_at', 'blocker_ids', 'release_reservations'],
  attempt_budget_extended: ['reason', 'approved_by', 'approved_at'],
  diff_budget_overridden: ['reason', 'approved_by', 'approved_at', 'limits'],
  refactor_approved: ['escalation_event_id', 'amendment_ref', 'reason', 'approved_by', 'approved_at', 'amended_plan_sha256'],
});

export const EVENT_DATA_REQUIRED_FIELDS = Object.freeze({
  package_initialized: ['schema_version', 'run_mode'],
  legacy_v1_imported: ['source', 'snapshot', 'legacy_paths', 'migration_status', 'blockers'],
  spec_proposed: ['spec_sha256'],
  spec_approved: ['spec_sha256', 'approved_by', 'approved_at'],
  plan_proposed: ['plan_sha256'],
  plan_approved: ['plan_sha256', 'approved_by', 'approved_at'],
  execution_policy_resolved: ['mode', 'observed_at', 'models', 'model_families'],
  lot_conventions_observed: ['algorithm', 'source_revision', 'observed_conventions', 'contract_sha256'],
  wave_reserved: ['reservations'],
  lot_started: ['reservation_id', 'workspace_snapshot'],
  lot_result_reported: ['result'],
  lot_reviewed: ['diff_sha256', 'verdict', 'findings', 'fresh_context'],
  lot_integrated: [],
  lot_blocked: ['reason'],
  reservation_released: ['reservation_id'],
  integration_verified: ['status', 'algorithm', 'verifications', 'reviewed_snapshot', 'verification_sha256'],
  consolidated_reviewed: ['verdict', 'findings', 'fresh_context', 'reviewed_snapshot'],
  corpus_closed: ['root_path', 'algorithm', 'exclusions', 'files', 'corpus_tree_sha256', 'validation'],
  candidate_frozen: ['candidate_sha', 'binding'],
  acceptance_started: [],
  acceptance_completed: ['status', 'tested_sha'],
  acceptance_waived: ['reason', 'approved_by', 'approved_at'],
  evidence_committed: ['manifest_locator', 'evidence_manifest_sha256', 'publication'],
  release_reviewed: ['verdict', 'fresh_context', 'findings'],
  draft_pr_planned: ['draft', 'actions', 'candidate_sha', 'payload_sha256'],
  draft_pr_created: ['draft', 'actions', 'candidate_sha', 'pr_url'],
  artifact_change_observed: ['classes', 'affected_lots'],
  controller_recovery_approved: ['reason', 'approved_by', 'approved_at', 'blocker_ids', 'release_reservations'],
  attempt_budget_extended: ['reason', 'approved_by', 'approved_at'],
  diff_budget_overridden: ['reason', 'approved_by', 'approved_at', 'limits'],
  refactor_approved: ['escalation_event_id', 'amendment_ref', 'reason', 'approved_by', 'approved_at', 'amended_plan_sha256'],
});

export const GATE_NAMES = [
  'specification', 'technical_plan', 'lot_reviews', 'integration', 'consolidated_review',
  'corpus_closeout', 'candidate', 'acceptance', 'evidence', 'release',
];

// A blocker's whole vocabulary, in one place. It used to live implicitly in
// three files that each wrote the predicate their own way: the scheduler
// treated anything not 'resolved' as blocking, the reducer only ever tested
// 'open', and recovery required 'open'. Since the reducer also produces
// 'superseded' with no path back, a consolidated review that failed and then
// passed left a blocker that blocked scheduling for good and could not be
// recovered. Same predicate, three spellings, one deadlock.
export const BLOCKER_STATUSES = ['open', 'resolved', 'superseded'];

// Blocking is a property of being open. Superseded means the situation that
// raised the blocker no longer holds — it is history, not an obstacle.
export function isBlockerActive(blocker) {
  return blocker?.status === 'open';
}

export const PHASES = [
  'draft', 'spec_approved', 'plan_approved', 'executing', 'integrated',
  'consolidated_reviewed', 'corpus_closed', 'candidate_frozen',
  'acceptance_complete', 'evidence_recorded', 'release_ready',
];

export function validatePlan(plan) {
  const findings = [];
  const add = (code, message, severity = 'P0') => findings.push({ severity, code, message });
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return [{ severity: 'P0', code: 'factory-plan-not-object', message: 'plan must be an object' }];
  addUnknownKeys(plan, new Set(['v', 'spec_path', 'environment_contract', 'acceptance_criteria', 'lots']), 'plan', add);
  if (plan.v !== 3) add('factory-plan-version', 'plan.v must be 3');
  if (typeof plan.spec_path !== 'string' || !plan.spec_path) add('factory-plan-spec-path', 'spec_path is required');
  else try { normalizeRepoPath(plan.spec_path); } catch (error) { add(error.code || 'factory-path-invalid', `spec_path: ${error.message}`); }
  if (plan.environment_contract !== null && plan.environment_contract !== undefined) {
    if (typeof plan.environment_contract !== 'string') add('factory-plan-environment-contract', 'environment_contract must be a repository-relative path or null');
    else try { normalizeRepoPath(plan.environment_contract); } catch (error) { add(error.code || 'factory-path-invalid', `environment_contract: ${error.message}`); }
  }
  if (!Array.isArray(plan.acceptance_criteria)) add('factory-plan-criteria', 'acceptance_criteria must be an array');
  if (!Array.isArray(plan.lots) || !plan.lots.length) add('factory-plan-lots', 'at least one lot is required');

  const criteria = new Map();
  for (const criterion of plan.acceptance_criteria || []) {
    if (criterion && typeof criterion === 'object' && !Array.isArray(criterion)) addUnknownKeys(criterion, new Set(['id', 'proved_by']), `criterion ${criterion.id || '<unknown>'}`, add);
    if (!criterion || typeof criterion.id !== 'string' || !criterion.id) add('factory-criterion-id', 'each criterion needs an id');
    else if (criteria.has(criterion.id)) add('factory-criterion-duplicate', `duplicate criterion ${criterion.id}`);
    else criteria.set(criterion.id, criterion);
    if (!Array.isArray(criterion?.proved_by) || criterion.proved_by.length === 0) add('factory-criterion-without-proof', `${criterion?.id || '<unknown>'}: proved_by must not be empty`);
    else if (new Set(criterion.proved_by).size !== criterion.proved_by.length) add('factory-criterion-proof-duplicate', `${criterion.id}: proved_by contains duplicates`);
  }

  const lots = new Map();
  for (const lot of plan.lots || []) {
    if (!lot || typeof lot.id !== 'string' || !lot.id) {
      add('factory-lot-id', 'each lot needs an id');
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(lot.id)) add('factory-lot-id-format', `${lot.id}: invalid lot id`);
    if (lots.has(lot.id)) add('factory-lot-duplicate', `duplicate lot ${lot.id}`);
    lots.set(lot.id, lot);
    addUnknownKeys(lot, new Set(['id', 'kind', 'objective', 'acceptance_criteria', 'dependencies', 'read_claims', 'write_claims', 'forbidden_paths', 'contracts', 'handoff', 'verification', 'stop_rules', 'risk', 'control_plane_critical', 'complexity', 'agent_role', 'model_role', 'capabilities', 'decision_domains', 'max_attempts']), `lot ${lot.id}`, add);
    if (lot.kind !== 'implementation') add('factory-lot-kind', `${lot.id}: review, acceptance and delivery are typed events, not schedulable lots`);
    if (!lot.objective) add('factory-lot-objective', `${lot.id}: objective is required`);
    if (!Array.isArray(lot.acceptance_criteria)) add('factory-lot-criteria', `${lot.id}: acceptance_criteria must be an array`);
    if (!Array.isArray(lot.dependencies)) add('factory-lot-dependencies', `${lot.id}: dependencies must be an array`);
    else if (new Set(lot.dependencies).size !== lot.dependencies.length) add('factory-lot-dependency-duplicate', `${lot.id}: dependencies contain duplicates`);
    if (!Array.isArray(lot.read_claims) || lot.read_claims.length === 0) add('factory-lot-read-claims', `${lot.id}: at least one readable path claim is required`);
    for (const claim of lot.read_claims || []) for (const issue of validateClaim(claim)) add(issue.code, `${lot.id}: invalid read claim: ${issue.message}`);
    if (!Array.isArray(lot.write_claims) || lot.write_claims.length === 0) add('factory-lot-write-claims', `${lot.id}: at least one write claim is required`);
    for (const claim of lot.write_claims || []) for (const issue of validateClaim(claim)) add(issue.code, `${lot.id}: ${issue.message}`);
    if (!Array.isArray(lot.forbidden_paths)) add('factory-lot-forbidden-paths', `${lot.id}: forbidden_paths must be an array`);
    for (const forbidden of lot.forbidden_paths || []) {
      try {
        normalizeRepoPath(forbidden);
      } catch (error) {
        add(error.code || 'factory-path-invalid', `${lot.id}: invalid forbidden path ${String(forbidden)}`);
      }
    }
    if (!Array.isArray(lot.verification) || lot.verification.length === 0) add('factory-lot-verification', `${lot.id}: verification must not be empty`);
    else if (new Set(lot.verification).size !== lot.verification.length) add('factory-lot-verification-duplicate', `${lot.id}: verification contains duplicates`);
    if (!Array.isArray(lot.stop_rules) || lot.stop_rules.length === 0 || lot.stop_rules.some((rule) => typeof rule !== 'string' || !rule.trim())) add('factory-lot-stop-rules', `${lot.id}: at least one non-empty stop rule is required`);
    else if (new Set(lot.stop_rules).size !== lot.stop_rules.length) add('factory-lot-stop-rule-duplicate', `${lot.id}: stop_rules contains duplicates`);
    if (!lot.contracts || !['inputs', 'outputs', 'invariants', 'non_goals'].every((key) => Array.isArray(lot.contracts[key]))) add('factory-lot-contracts', `${lot.id}: complete contracts are required`);
    validateHandoff(lot, add);
    if (!Number.isInteger(lot.max_attempts) || lot.max_attempts < 1 || lot.max_attempts > 2) add('factory-lot-attempt-budget', `${lot.id}: max_attempts must be an integer from 1 to 2`);
    if (!['low', 'medium', 'high'].includes(lot.risk)) add('factory-lot-risk', `${lot.id}: invalid risk ${String(lot.risk)}`);
    if (typeof lot.control_plane_critical !== 'boolean') add('factory-lot-control-plane', `${lot.id}: control_plane_critical must be boolean`);
    if (!['bounded', 'reasoning'].includes(lot.complexity)) add('factory-lot-complexity', `${lot.id}: invalid complexity ${String(lot.complexity)}`);
    for (const criterion of lot.acceptance_criteria || []) if (!criteria.has(criterion)) add('factory-lot-unknown-criterion', `${lot.id}: unknown criterion ${criterion}`);
    findings.push(...validateRoleCapability(lot));
  }

  const covered = new Set((plan.lots || []).flatMap((lot) => Array.isArray(lot?.acceptance_criteria) ? lot.acceptance_criteria : []));
  for (const criterion of criteria.keys()) if (!covered.has(criterion)) add('factory-criterion-uncovered', `${criterion}: no lot covers this criterion`);
  for (const lot of lots.values()) {
    for (const dependency of lot.dependencies || []) {
      if (!lots.has(dependency)) add('factory-lot-unknown-dependency', `${lot.id}: unknown dependency ${dependency}`);
      if (dependency === lot.id) add('factory-lot-self-dependency', `${lot.id}: a lot cannot depend on itself`);
    }
  }
  for (const cycle of dependencyCycles(lots)) add('factory-plan-cycle', `dependency cycle: ${cycle.join(' -> ')}`);
  return findings;
}

function validateHandoff(lot, add) {
  const handoff = lot.handoff;
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    add('factory-lot-handoff', `${lot.id}: a structured handoff is required`);
    return;
  }
  addUnknownKeys(handoff, new Set(['inputs', 'outputs', 'include_private_reasoning']), `lot ${lot.id} handoff`, add);
  if (handoff.include_private_reasoning !== false) add('factory-lot-handoff-private-reasoning', `${lot.id}: handoff must explicitly exclude private reasoning`);
  validateHandoffEntries(lot.id, 'inputs', handoff.inputs, true, lot.read_claims, add);
  validateHandoffEntries(lot.id, 'outputs', handoff.outputs, false, lot.write_claims, add);
}

function validateHandoffEntries(lotId, kind, entries, requireDigest, claims, add) {
  if (!Array.isArray(entries) || entries.length === 0) {
    add('factory-lot-handoff-empty', `${lotId}: handoff.${kind} must not be empty`);
    return;
  }
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      add('factory-lot-handoff-entry', `${lotId}: handoff.${kind} entries must be objects`);
      continue;
    }
    addUnknownKeys(entry, new Set(requireDigest ? ['id', 'path', 'sha256'] : ['id', 'path']), `lot ${lotId} handoff.${kind}`, add);
    if (typeof entry.id !== 'string' || !entry.id.trim()) add('factory-lot-handoff-id', `${lotId}: handoff.${kind} entry id is required`);
    else if (ids.has(entry.id)) add('factory-lot-handoff-id-duplicate', `${lotId}: duplicate handoff.${kind} id ${entry.id}`);
    else ids.add(entry.id);
    try {
      const normalized = normalizeRepoPath(entry.path);
      if (!pathAllowedByPatterns(normalized, claims || [])) add('factory-lot-handoff-outside-claims', `${lotId}: handoff.${kind} path ${normalized} is outside declared ${kind === 'inputs' ? 'read' : 'write'} claims`);
    } catch (error) {
      add(error.code || 'factory-path-invalid', `${lotId}: invalid handoff.${kind} path ${String(entry.path)}`);
    }
    if (requireDigest && !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) add('factory-lot-handoff-digest', `${lotId}: handoff input ${entry.id || '<unknown>'} requires sha256`);
  }
}

export function validateEventShape(event) {
  const findings = [];
  const add = (code, message) => findings.push({ severity: 'P0', code, message });
  if (!event || typeof event !== 'object' || Array.isArray(event)) return [{ severity: 'P0', code: 'factory-event-not-object', message: 'event must be an object' }];
  addUnknownKeys(event, new Set(['v', 'run_id', 'seq', 'event_id', 'type', 'at', 'controller_id', 'expected_previous_seq', 'previous_event_sha256', 'actor', 'subject', 'basis', 'data']), 'event', add);
  if (event.v !== 3) add('factory-event-version', 'event.v must be 3');
  if (typeof event.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(event.run_id)) add('factory-event-run-id', 'run_id is required and must be stable');
  if (!Number.isInteger(event.seq) || event.seq < 1) add('factory-event-seq', 'event.seq must be a positive integer');
  if (event.event_id !== `EVT-${String(event.seq || 0).padStart(6, '0')}`) add('factory-event-id', 'event_id must be derived from seq');
  if (!EVENT_TYPES.has(event.type)) add('factory-event-type', `unknown event type ${String(event.type)}`);
  if (!Number.isInteger(event.expected_previous_seq) || event.expected_previous_seq < 0) add('factory-event-expected-seq', 'expected_previous_seq must be a non-negative integer');
  if (event.previous_event_sha256 !== 'GENESIS' && !/^[0-9a-f]{64}$/.test(event.previous_event_sha256 || '')) add('factory-event-previous-hash', 'previous_event_sha256 must be GENESIS or SHA-256');
  if (typeof event.controller_id !== 'string' || !event.controller_id) add('factory-event-controller', 'controller_id is required');
  if (!isIsoDateTime(event.at)) add('factory-event-time', 'at must be an RFC 3339 date-time');
  if (isPlainObject(event.actor)) {
    addUnknownKeys(event.actor, new Set(['role', 'execution_id', 'model', 'capabilities', 'capability_grants']), 'event actor', add);
    if (isPlainObject(event.actor.model)) addUnknownKeys(event.actor.model, new Set(['planned', 'requested', 'used', 'model_family']), 'event actor.model', add);
  }
  if (!event.actor || !['controller', 'implementer', 'reviewer', 'acceptance', 'delivery', 'migration'].includes(event.actor.role) || !event.actor.execution_id || !event.actor.model || !Array.isArray(event.actor.capabilities)) add('factory-event-actor', 'complete actor metadata and effective capabilities are required');
  else {
    if (!['planned', 'requested', 'used'].every((key) => Object.hasOwn(event.actor.model, key) && (event.actor.model[key] === null || typeof event.actor.model[key] === 'string'))) add('factory-event-model-provenance', 'actor.model requires planned, requested and used string-or-null fields');
    if (!Object.hasOwn(event.actor.model, 'model_family') || typeof event.actor.model.model_family !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(event.actor.model.model_family)) add('factory-event-model-family', 'actor.model.model_family must be an explicit canonical lower-case family id');
    findings.push(...validateActorCapabilities(event.actor));
    validateCapabilityGrants(event, add);
  }
  if (isPlainObject(event.subject)) addUnknownKeys(event.subject, new Set(['package', 'lot_id']), 'event subject', add);
  if (!event.subject || typeof event.subject.package !== 'string' || !event.subject.package || !Object.hasOwn(event.subject, 'lot_id') || (event.subject.lot_id !== null && typeof event.subject.lot_id !== 'string')) add('factory-event-subject', 'subject.package and string-or-null lot_id are required');
  if (!event.basis || typeof event.basis !== 'object' || Array.isArray(event.basis)) add('factory-event-basis', 'basis object is required');
  else {
    addUnknownKeys(event.basis, new Set(['spec_sha256', 'plan_sha256', 'candidate_sha', 'diff_sha256']), 'event basis', add);
    for (const key of ['spec_sha256', 'plan_sha256', 'diff_sha256']) if (event.basis[key] !== undefined && event.basis[key] !== null && !/^[0-9a-f]{64}$/.test(event.basis[key])) add('factory-event-basis-digest', `basis.${key} must be SHA-256 or null`);
    if (event.basis.candidate_sha !== undefined && event.basis.candidate_sha !== null && !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(event.basis.candidate_sha)) add('factory-event-basis-digest', 'basis.candidate_sha must be a full Git SHA or null');
  }
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) add('factory-event-data', 'data object is required');
  else validateClosedEventPayload(event, add);
  return findings;
}

function validateCapabilityGrants(event, add) {
  const grants = event.actor.capability_grants;
  const dangerous = event.actor.role === 'acceptance'
    ? event.actor.capabilities.filter((capability) => ['network', 'data_mutation'].includes(capability))
    : [];
  for (const capability of dangerous) {
    add('factory-conditional-capability-unavailable', `acceptance capability ${capability} is not effective: this control plane has no integrated machine-verifying isolated executor`);
  }
  if (grants === undefined) return;
  if (!Array.isArray(grants)) { add('factory-capability-grants-shape', 'actor.capability_grants must be an array'); return; }
  if (grants.length > 0) add(
    'factory-conditional-capability-unavailable',
    'capability_grants are declarative input, not proof of host isolation; the shipped control plane accepts no non-empty grant set',
  );
}

function validateClosedEventPayload(event, add) {
  const allowed = EVENT_DATA_FIELDS[event.type];
  if (allowed) addUnknownKeys(event.data, new Set(allowed), `${event.type} data`, add);
  for (const key of EVENT_DATA_REQUIRED_FIELDS[event.type] || []) {
    if (!Object.hasOwn(event.data, key)) add('factory-contract-missing-field', `${event.type} data: missing field ${key}`);
  }

  switch (event.type) {
    case 'package_initialized':
      if (event.data.schema_version !== 3) add('factory-package-schema-version', 'package_initialized.schema_version must be 3');
      if (!['live', 'retrospective_attestation'].includes(event.data.run_mode)) add('factory-run-mode', 'package_initialized.run_mode must be live or retrospective_attestation');
      break;
    case 'legacy_v1_imported':
      validateLegacyImport(event, add);
      break;
    case 'spec_proposed':
      requireSha256(event.data.spec_sha256, 'factory-spec-digest-missing', 'spec_proposed requires spec_sha256', add);
      break;
    case 'spec_approved':
      requireSha256(event.data.spec_sha256, 'factory-spec-digest-missing', 'spec_approved requires spec_sha256', add);
      validateApprovalPayload(event, event.data, 'spec approval', 'factory-spec-approval-metadata', add);
      break;
    case 'plan_proposed':
      requireSha256(event.data.plan_sha256, 'factory-plan-proposal-basis', 'plan_proposed requires plan_sha256', add);
      break;
    case 'plan_approved':
      requireSha256(event.data.plan_sha256, 'factory-plan-approval-basis', 'plan_approved requires plan_sha256', add);
      validateApprovalPayload(event, event.data, 'plan approval', 'factory-plan-approval-metadata', add);
      break;
    case 'execution_policy_resolved':
      validateExecutionPolicy(event, add);
      break;
    case 'lot_conventions_observed':
      validatePreimplementationConventionContract(event, add);
      break;
    case 'wave_reserved':
      validateReservations(event.data.reservations, add);
      break;
    case 'lot_started':
    case 'reservation_released':
      requireNonEmptyString(event.data.reservation_id, 'factory-event-reservation', `${event.type} requires reservation_id`, add);
      if (event.type === 'lot_started') validateWorkspaceSnapshot(event.data.workspace_snapshot, add);
      break;
    case 'lot_result_reported':
      validateLotResultEnvelope(event.data.result, add, event);
      break;
    case 'lot_reviewed':
      validateReviewPayload(event, true, add);
      break;
    case 'lot_integrated':
    case 'acceptance_started':
      break;
    case 'lot_blocked':
      requireNonEmptyString(event.data.reason, 'factory-lot-blocked-reason', 'lot_blocked requires a reason', add);
      if (event.data.refactor_escalation !== undefined) validateRefactorEscalation(event.data.refactor_escalation, event, add, false);
      break;
    case 'integration_verified':
      validateIntegrationEnvelope(event.data, add);
      break;
    case 'consolidated_reviewed':
      validateReviewPayload(event, false, add);
      break;
    case 'corpus_closed':
      validateCorpusCloseoutPayload(event.data, add);
      break;
    case 'diff_budget_overridden':
      validateApprovalPayload(event, event.data, 'diff budget override', 'factory-diff-budget-approval', add);
      validateExactObject(event.data.limits, ['max_files', 'max_added_lines', 'max_deleted_lines', 'max_binary_files'], 'diff budget override limits', add);
      for (const key of ['max_files', 'max_added_lines', 'max_deleted_lines']) if (!Number.isInteger(event.data.limits?.[key]) || event.data.limits[key] < 1) add('factory-diff-budget-limit', `diff budget ${key} must be a positive integer`);
      if (!Number.isInteger(event.data.limits?.max_binary_files) || event.data.limits.max_binary_files < 0) add('factory-diff-budget-limit', 'diff budget max_binary_files must be a non-negative integer');
      break;
    case 'refactor_approved':
      validateApprovalPayload(event, event.data, 'refactor approval', 'factory-refactor-approval', add);
      if (!/^EVT-[0-9]{6,}$/.test(event.data.escalation_event_id || '')) add('factory-refactor-escalation-event', 'refactor approval requires escalation_event_id');
      requireNonEmptyString(event.data.amendment_ref, 'factory-refactor-amendment', 'refactor approval requires amendment_ref', add);
      requireSha256(event.data.amended_plan_sha256, 'factory-refactor-plan-digest', 'refactor approval requires amended_plan_sha256', add);
      break;
    case 'candidate_frozen':
      requireGitSha(event.data.candidate_sha, 'factory-candidate-sha', 'candidate_frozen requires a full Git SHA', add);
      validateCandidateBinding(event.data.binding, event.data.candidate_sha, add);
      break;
    case 'acceptance_completed':
      validateAcceptanceCompleted(event, add);
      break;
    case 'acceptance_waived':
      requireNonEmptyString(event.data.reason, 'factory-waiver-reason', 'acceptance waiver requires a reason', add);
      validateApprovalPayload(event, event.data, 'acceptance waiver', 'factory-waiver-approval', add);
      break;
    case 'evidence_committed':
      validateManifestLocator(event.data.manifest_locator, add);
      requireSha256(event.data.evidence_manifest_sha256, 'factory-evidence-manifest-digest', 'evidence_committed requires evidence_manifest_sha256', add);
      if (event.data.manifest_locator?.digest_sha256 !== event.data.evidence_manifest_sha256) add('factory-evidence-locator-digest-mismatch', 'manifest locator digest must equal evidence_manifest_sha256');
      validateEvidencePublicationPayload(event.data, add);
      break;
    case 'release_reviewed':
      if (event.data.verdict !== 'passed') add('factory-release-review-failed', 'release_reviewed.verdict must be passed');
      if (event.data.fresh_context !== true) add('factory-release-review-independence', 'release_reviewed requires fresh_context true');
      validateReviewFindingsShape(event, event.data.findings, event.basis?.diff_sha256, event.basis?.plan_sha256, add);
      if (event.data.independence_exception !== undefined) validateModelIndependenceException(event, event.data.independence_exception, add);
      break;
    case 'draft_pr_planned':
      validateDraftPayload(event.data, add);
      requireSha256(event.data.payload_sha256, 'factory-delivery-payload-digest', 'draft_pr_planned requires payload_sha256', add);
      break;
    case 'draft_pr_created':
      validateDraftPayload(event.data, add);
      if (typeof event.data.pr_url !== 'string' || !event.data.pr_url.startsWith('https://')) add('factory-delivery-pr-url', 'draft_pr_created requires an HTTPS pr_url');
      break;
    case 'artifact_change_observed':
      validateArtifactChange(event.data, add);
      break;
    case 'controller_recovery_approved':
      validateRecovery(event, add);
      break;
    case 'attempt_budget_extended':
      if (event.subject?.lot_id === null || typeof event.subject?.lot_id !== 'string' || !event.subject.lot_id) add('factory-attempt-extension-lot', 'attempt_budget_extended requires a lot subject');
      requireSha256(event.basis?.plan_sha256, 'factory-attempt-extension-plan-basis', 'attempt budget extension requires a plan basis', add);
      // A lot whose worker died before reporting has no diff at all, and
      // lot.diff_sha256 stays null: demanding a digest here made the budget
      // unextendable for exactly the lots that needed it, so a crash on the
      // last attempt ended the run. Null is the honest basis for "no result
      // was ever reported"; the reducer still requires basis.diff_sha256 to
      // equal lot.diff_sha256, so this cannot skip binding a diff that exists.
      if (event.basis?.diff_sha256 !== null) {
        requireSha256(event.basis?.diff_sha256, 'factory-attempt-extension-diff-basis', 'attempt budget extension requires the exhausted diff, or null when no result was reported', add);
      }
      requireNonEmptyString(event.data.reason, 'factory-attempt-extension-reason', 'attempt budget extension requires a reason', add);
      validateApprovalPayload(event, event.data, 'attempt budget extension', 'factory-attempt-extension-approval', add);
      break;
    default:
      break;
  }
}

function requireSha256(value, code, message, add) {
  if (!/^[0-9a-f]{64}$/.test(value || '')) add(code, message);
}

function validateApprovalPayload(event, data, scope, code, add) {
  if (typeof data.approved_by !== 'string' || !data.approved_by.trim() || !isIsoDateTime(data.approved_at)) {
    add(code, `${scope} requires approved_by and an ISO approved_at timestamp`);
  } else if (Date.parse(data.approved_at) > Date.parse(event.at)) {
    add('factory-provenance-from-future', `${scope} approved_at cannot be later than event.at`);
  }
}

function requireNonEmptyString(value, code, message, add) {
  if (typeof value !== 'string' || !value.trim()) add(code, message);
}

function requireGitSha(value, code, message, add) {
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value || '')) add(code, message);
}

function validateLegacyImport(event, add) {
  const data = event.data;
  validateExactObject(data.source, ['factory_state_sha256', 'technical_plan_sha256'], 'legacy source', add);
  requireSha256(data.source?.factory_state_sha256, 'factory-migration-source-digest', 'legacy source requires factory_state_sha256', add);
  requireSha256(data.source?.technical_plan_sha256, 'factory-migration-source-digest', 'legacy source requires technical_plan_sha256', add);
  const snapshotKeys = ['version', 'state', 'spec', 'technical_plan', 'execution_policy', 'gates', 'lots', 'tested_code_sha', 'evidence_commit_sha'];
  validateExactObject(data.snapshot, snapshotKeys, 'legacy snapshot', add);
  if (data.snapshot?.version !== 1) add('factory-migration-snapshot-version', 'legacy snapshot version must be 1');
  requireNonEmptyString(data.snapshot?.state, 'factory-migration-snapshot-state', 'legacy snapshot state is required', add);
  for (const key of ['tested_code_sha', 'evidence_commit_sha']) {
    const value = data.snapshot?.[key];
    if (value !== null && !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value || '')) add('factory-migration-snapshot-git-sha', `legacy snapshot ${key} must be a full Git SHA or null`);
  }
  validateStringMap(data.snapshot?.spec, ['status', 'approved_by', 'approved_at'], 'legacy snapshot spec', add);
  validateStringMap(data.snapshot?.technical_plan, ['status', 'approved_by', 'approved_at'], 'legacy snapshot technical_plan', add);
  validateStringMap(data.snapshot?.execution_policy, ['mode', 'catalogue_observed_at', 'advanced_model', 'bounded_implementation_model', 'reviewer_model'], 'legacy snapshot execution_policy', add);
  validateStringMap(data.snapshot?.gates, ['implementation', 'consolidated_review', 'corpus_closeout', 'acceptance', 'final_release_readiness'], 'legacy snapshot gates', add);
  if (!isPlainObject(data.snapshot?.lots)) add('factory-migration-snapshot-lots', 'legacy snapshot lots must be an object');
  else for (const [lotId, lot] of Object.entries(data.snapshot.lots)) {
    requireNonEmptyString(lotId, 'factory-migration-snapshot-lot-id', 'legacy snapshot lot id is required', add);
    validateStringMap(lot, ['status', 'model_planned', 'model_requested', 'model_used'], `legacy snapshot lot ${lotId}`, add);
  }
  for (const timestamp of [data.snapshot?.spec?.approved_at, data.snapshot?.technical_plan?.approved_at, data.snapshot?.execution_policy?.catalogue_observed_at]) {
    if (timestamp !== null && timestamp !== undefined && !isIsoDateTime(timestamp)) add('factory-migration-snapshot-timestamp', 'legacy provenance timestamps must be RFC 3339 date-times or null');
    else if (timestamp && Date.parse(timestamp) > Date.parse(event.at)) add('factory-provenance-from-future', 'legacy provenance timestamp cannot be later than event.at');
  }
  if (!isPlainObject(data.legacy_paths)) add('factory-migration-legacy-paths', 'legacy_paths must be an object');
  else for (const [lotId, paths] of Object.entries(data.legacy_paths)) {
    if (!Array.isArray(paths) || paths.some((item) => typeof item !== 'string' || !item.trim())) add('factory-migration-legacy-paths', `${lotId}: legacy paths must be strings`);
  }
  if (data.migration_status !== 'review_required') add('factory-migration-status', 'legacy migration status must be review_required');
  validateStringArray(data.blockers, { nonEmpty: true, unique: true }, 'factory-migration-blockers', 'legacy migration blockers', add);
}

function validateExecutionPolicy(event, add) {
  const data = event.data;
  if (!['balanced', 'maximum_quality', 'economical', 'manual'].includes(data.mode)) add('factory-execution-policy-mode', 'execution policy mode is invalid');
  if (!isIsoDateTime(data.observed_at)) add('factory-execution-policy-observation', 'execution policy requires an RFC 3339 observed_at');
  else if (Date.parse(data.observed_at) > Date.parse(event.at)) add('factory-provenance-from-future', 'execution policy observed_at cannot be later than event.at');
  validateExactObject(data.models, ['economy', 'standard', 'expert', 'reviewer'], 'execution policy models', add);
  for (const profile of ['economy', 'standard', 'expert', 'reviewer']) requireNonEmptyString(data.models?.[profile], 'factory-execution-policy-incomplete', `execution policy requires model ${profile}`, add);
  validateExactObject(data.model_families, ['economy', 'standard', 'expert', 'reviewer'], 'execution policy model_families', add);
  for (const profile of ['economy', 'standard', 'expert', 'reviewer']) {
    if (typeof data.model_families?.[profile] !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(data.model_families[profile])) add('factory-execution-policy-model-family', `execution policy requires canonical model family ${profile}`);
  }
}

function validatePreimplementationConventionContract(event, add) {
  const contract = event.data;
  if (event.subject?.lot_id === null || typeof event.subject?.lot_id !== 'string' || !event.subject.lot_id) {
    add('factory-preimplementation-contract-lot', 'lot_conventions_observed requires a lot subject');
  }
  requireSha256(event.basis?.plan_sha256, 'factory-preimplementation-contract-plan', 'lot_conventions_observed must bind the approved plan', add);
  if (contract.algorithm !== ENVELOPE_HASH_ALGORITHM) add('factory-preimplementation-contract-algorithm', `preimplementation convention contract algorithm must be ${ENVELOPE_HASH_ALGORITHM}`);
  requireGitSha(contract.source_revision, 'factory-preimplementation-contract-revision', 'preimplementation convention contract requires a full source_revision', add);
  validateObservedConventions(contract.observed_conventions, add, 'preimplementation convention contract');
  requireSha256(contract.contract_sha256, 'factory-preimplementation-contract-digest', 'preimplementation convention contract requires contract_sha256', add);
  if (
    contract.algorithm === ENVELOPE_HASH_ALGORITHM
    && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(contract.source_revision || '')
    && Array.isArray(contract.observed_conventions)
  ) {
    try {
      if (preimplementationConventionDigest(contract) !== contract.contract_sha256) {
        add('factory-preimplementation-contract-digest-mismatch', 'preimplementation convention contract digest is not recomputable');
      }
    } catch {
      add('factory-preimplementation-contract-digest-mismatch', 'preimplementation convention contract cannot be canonically hashed');
    }
  }
}

function validateReservations(reservations, add) {
  if (!Array.isArray(reservations) || reservations.length === 0) {
    add('factory-wave-empty', 'wave_reserved requires a non-empty reservations array');
    return;
  }
  const ids = new Set();
  for (const reservation of reservations) {
    validateExactObject(reservation, ['reservation_id', 'lot_id'], 'wave reservation', add);
    requireNonEmptyString(reservation?.reservation_id, 'factory-reservation-id', 'reservation_id is required', add);
    requireNonEmptyString(reservation?.lot_id, 'factory-event-lot', 'reservation lot_id is required', add);
    if (ids.has(reservation?.reservation_id)) add('factory-reservation-id', `duplicate reservation id ${String(reservation?.reservation_id)}`);
    ids.add(reservation?.reservation_id);
  }
}

function validateLotResultEnvelope(result, add, event = null) {
  const keys = ['algorithm', 'base_revision', 'changed_paths', 'files', 'workspace_delta', 'diff_sha256', 'outputs', 'verification', 'preimplementation_contract_sha256', 'observed_conventions', 'refactor_assessment', 'blockers'];
  validateExactObject(result, keys, 'lot result', add);
  if (!isPlainObject(result)) return;
  if (result.algorithm !== ENVELOPE_HASH_ALGORITHM) add('factory-proof-algorithm', `lot result algorithm must be ${ENVELOPE_HASH_ALGORITHM}`);
  requireGitSha(result.base_revision, 'factory-lot-base-revision', 'lot result requires a full base_revision SHA', add);
  validatePathArray(result.changed_paths, { nonEmpty: true, sorted: true }, 'factory-lot-changed-paths-shape', 'lot result changed_paths', add);
  validateFileInventory(result.files, result.changed_paths, 'lot result files', add);
  validateWorkspaceDelta(result.workspace_delta, result.files, add);
  requireSha256(result.diff_sha256, 'factory-lot-diff-digest', 'lot result requires diff_sha256', add);
  if (result.algorithm === ENVELOPE_HASH_ALGORITHM
    && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(result.base_revision || '')
    && isDigestableInventory(result.files)
    && isCanonicalPaths(result.changed_paths)) {
    try {
      if (lotResultDigest(result) !== result.diff_sha256) add('factory-lot-diff-digest-mismatch', 'lot result diff_sha256 is not the canonical envelope digest');
    } catch {
      add('factory-lot-diff-envelope', 'lot result envelope cannot be canonically hashed');
    }
  }
  validateOutputInventory(result.outputs, add);
  validateVerificationEntries(result.verification, 'lot result verification', add);
  requireSha256(result.preimplementation_contract_sha256, 'factory-preimplementation-contract-result', 'lot result must bind the preimplementation convention contract', add);
  validateObservedConventions(result.observed_conventions, add);
  validateRefactorAssessment(result.refactor_assessment, event, add);
  if (!Array.isArray(result.blockers) || result.blockers.length !== 0) add('factory-lot-result-blockers', 'a completed lot result must declare blockers as an empty array');
}

function validateWorkspaceSnapshot(snapshot, add) {
  const keys = ['v', 'algorithm', 'workspace_id', 'workspace_mode', 'attestation_mode', 'base_revision', 'exclusions', 'entries', 'snapshot_sha256'];
  validateExactObject(snapshot, keys, 'workspace snapshot', add);
  if (!isPlainObject(snapshot)) return;
  if (snapshot.v !== 1) add('factory-workspace-snapshot-version', 'workspace snapshot v must be 1');
  if (snapshot.algorithm !== WORKSPACE_SNAPSHOT_ALGORITHM) add('factory-workspace-snapshot-algorithm', `workspace snapshot algorithm must be ${WORKSPACE_SNAPSHOT_ALGORITHM}`);
  requireSha256(snapshot.workspace_id, 'factory-workspace-id', 'workspace snapshot workspace_id must be SHA-256', add);
  if (!['repository', 'isolated_worktree'].includes(snapshot.workspace_mode)) add('factory-workspace-mode', 'workspace_mode must be repository or isolated_worktree');
  if (!['live', 'retrospective_attestation'].includes(snapshot.attestation_mode)) add('factory-workspace-attestation-mode', 'attestation_mode must be live or retrospective_attestation');
  requireGitSha(snapshot.base_revision, 'factory-lot-base-revision', 'workspace snapshot requires a full base_revision SHA', add);
  validatePathArray(snapshot.exclusions, { sorted: true }, 'factory-workspace-exclusions', 'workspace snapshot exclusions', add);
  if (!Array.isArray(snapshot.entries)) add('factory-workspace-entries-shape', 'workspace snapshot entries must be an array');
  else {
    for (const entry of snapshot.entries) {
      validateAllowedObject(entry, ['path', 'origin', 'status', 'sha256'], ['path', 'origin', 'status'], 'workspace snapshot entry', add);
      try { normalizeRepoPath(entry?.path); } catch (error) { add(error.code || 'factory-path-invalid', `workspace snapshot entry: ${error.message}`); }
      if (!['tracked', 'untracked'].includes(entry?.origin)) add('factory-workspace-entry-origin', 'workspace entry origin must be tracked or untracked');
      if (!['present', 'deleted'].includes(entry?.status)) add('factory-workspace-entry-status', 'workspace entry status must be present or deleted');
      if (entry?.status === 'present') requireSha256(entry?.sha256, 'factory-workspace-entry-digest', 'present workspace entry requires sha256', add);
      if (entry?.status === 'deleted' && entry?.sha256 !== undefined && entry.sha256 !== null) add('factory-workspace-deleted-digest', 'deleted workspace entry must omit sha256 or set it to null');
      if (entry?.origin === 'untracked' && entry?.status === 'deleted') add('factory-workspace-untracked-deleted', 'dirty workspace snapshots cannot contain deleted untracked entries');
    }
    if (!isCanonicalInventory(snapshot.entries)) add('factory-workspace-entries-order', 'workspace snapshot entries must be unique and sorted by path');
  }
  requireSha256(snapshot.snapshot_sha256, 'factory-workspace-snapshot-digest', 'workspace snapshot requires snapshot_sha256', add);
  try {
    if (workspaceSnapshotDigest(snapshot) !== snapshot.snapshot_sha256) add('factory-workspace-snapshot-digest-mismatch', 'workspace snapshot digest is not recomputable');
  } catch {
    add('factory-workspace-snapshot-digest-mismatch', 'workspace snapshot cannot be canonically hashed');
  }
}

function validateWorkspaceDelta(delta, files, add) {
  validateExactObject(delta, ['algorithm', 'from_snapshot_sha256', 'to_snapshot', 'files_sha256', 'metrics', 'budget'], 'workspace delta', add);
  if (!isPlainObject(delta)) return;
  if (delta.algorithm !== WORKSPACE_DELTA_ALGORITHM) add('factory-workspace-delta-algorithm', `workspace delta algorithm must be ${WORKSPACE_DELTA_ALGORITHM}`);
  requireSha256(delta.from_snapshot_sha256, 'factory-workspace-delta-from', 'workspace delta requires from_snapshot_sha256', add);
  validateWorkspaceSnapshot(delta.to_snapshot, add);
  requireSha256(delta.files_sha256, 'factory-workspace-delta-files', 'workspace delta requires files_sha256', add);
  validateExactObject(delta.metrics, ['algorithm', 'files', 'added_lines', 'deleted_lines', 'binary_files'], 'workspace delta metrics', add);
  if (delta.metrics?.algorithm !== 'git-numstat-plus-untracked-v1') add('factory-diff-budget-metrics-algorithm', 'workspace metrics algorithm is invalid');
  for (const key of ['files', 'added_lines', 'deleted_lines', 'binary_files']) if (!Number.isInteger(delta.metrics?.[key]) || delta.metrics[key] < 0) add('factory-diff-budget-metrics', `workspace metric ${key} must be a non-negative integer`);
  if (Array.isArray(files) && delta.metrics?.files !== files.length) add('factory-diff-budget-file-count', 'workspace metrics.files must equal result files length');
  validateExactObject(delta.budget, ['source', 'max_files', 'max_added_lines', 'max_deleted_lines', 'max_binary_files', 'override_event_id'], 'workspace delta budget', add);
  if (!['policy_default', 'operator_override'].includes(delta.budget?.source)) add('factory-diff-budget-source', 'workspace budget source is invalid');
  for (const key of ['max_files', 'max_added_lines', 'max_deleted_lines']) if (!Number.isInteger(delta.budget?.[key]) || delta.budget[key] < 1) add('factory-diff-budget-limit', `workspace budget ${key} must be positive`);
  if (!Number.isInteger(delta.budget?.max_binary_files) || delta.budget.max_binary_files < 0) add('factory-diff-budget-limit', 'workspace budget max_binary_files must be non-negative');
  if (delta.budget?.source === 'policy_default' && delta.budget?.override_event_id !== null) add('factory-diff-budget-override-reference', 'policy_default budget must have null override_event_id');
  if (delta.budget?.source === 'operator_override' && !/^EVT-[0-9]{6,}$/.test(delta.budget?.override_event_id || '')) add('factory-diff-budget-override-reference', 'operator_override budget requires override_event_id');
  try {
    if (changeInventoryDigest(files) !== delta.files_sha256) add('factory-workspace-delta-files-mismatch', 'workspace delta files_sha256 does not bind result.files');
  } catch {
    add('factory-workspace-delta-files-mismatch', 'workspace delta files cannot be canonically hashed');
  }
}

function validateIntegrationEnvelope(data, add) {
  if (data.status !== 'passed') add('factory-integration-verification', 'integration verification status must be passed');
  if (data.algorithm !== ENVELOPE_HASH_ALGORITHM) add('factory-proof-algorithm', `integration algorithm must be ${ENVELOPE_HASH_ALGORITHM}`);
  validateVerificationEntries(data.verifications, 'integration verifications', add);
  validateReviewedSnapshot(data.reviewed_snapshot, 'integration reviewed_snapshot', add);
  requireSha256(data.verification_sha256, 'factory-integration-verification', 'integration verification_sha256 is required', add);
  if (data.algorithm === ENVELOPE_HASH_ALGORITHM && isDigestableVerificationList(data.verifications)) {
    if (integrationVerificationDigest(data) !== data.verification_sha256) add('factory-integration-digest-mismatch', 'integration verification_sha256 is not the canonical envelope digest');
  }
}

function validateCorpusCloseoutPayload(data, add) {
  if (data.root_path !== 'doc') add('factory-corpus-root', 'corpus closeout root_path must be doc');
  if (data.algorithm !== CORPUS_TREE_ALGORITHM) add('factory-corpus-algorithm', `corpus closeout algorithm must be ${CORPUS_TREE_ALGORITHM}`);
  validatePathArray(data.exclusions, { sorted: true }, 'factory-corpus-exclusions', 'corpus closeout exclusions', add);
  if (!Array.isArray(data.files) || data.files.length === 0) add('factory-corpus-files-shape', 'corpus closeout files must be a non-empty array');
  else {
    for (const entry of data.files) {
      validateExactObject(entry, ['path', 'sha256'], 'corpus tree file', add);
      try {
        const normalized = normalizeRepoPath(entry?.path);
        if (normalized !== 'doc' && !normalized.startsWith('doc/')) add('factory-corpus-file-outside-root', `${normalized}: corpus file is outside doc/`);
      } catch (error) { add(error.code || 'factory-path-invalid', `corpus tree file: ${error.message}`); }
      requireSha256(entry?.sha256, 'factory-corpus-file-digest', 'corpus tree file requires sha256', add);
    }
    if (!isCanonicalInventory(data.files)) add('factory-corpus-files-order', 'corpus tree files must be unique and sorted by path');
  }
  requireSha256(data.corpus_tree_sha256, 'factory-corpus-digest', 'corpus closeout requires corpus_tree_sha256', add);
  try {
    if (corpusTreeDigest(data) !== data.corpus_tree_sha256) add('factory-corpus-tree-digest-mismatch', 'corpus_tree_sha256 is not recomputable from the inventory');
  } catch { add('factory-corpus-tree-digest-mismatch', 'corpus tree inventory cannot be canonically hashed'); }
  validateExactObject(data.validation, ['algorithm', 'validator_path', 'validator_sha256', 'arguments', 'status', 'result_sha256'], 'corpus validation proof', add);
  if (data.validation?.algorithm !== CORPUS_VALIDATION_ALGORITHM) add('factory-corpus-validation-algorithm', `corpus validation algorithm must be ${CORPUS_VALIDATION_ALGORITHM}`);
  if (data.validation?.validator_path !== 'scripts/validate-corpus.mjs') add('factory-corpus-validator-path', 'corpus validation must use scripts/validate-corpus.mjs');
  requireSha256(data.validation?.validator_sha256, 'factory-corpus-validator-digest', 'corpus validator digest is required', add);
  if (JSON.stringify(data.validation?.arguments) !== JSON.stringify(['--json'])) add('factory-corpus-validator-arguments', 'corpus validator arguments must be exactly [--json]');
  if (data.validation?.status !== 'passed') add('factory-corpus-validation-status', 'corpus validation status must be passed');
  requireSha256(data.validation?.result_sha256, 'factory-corpus-validation-result', 'corpus validation result digest is required', add);
}

function validateReviewPayload(event, perLot, add) {
  const data = event.data;
  if (perLot) requireSha256(data.diff_sha256, 'factory-lot-review-basis', 'lot review requires diff_sha256', add);
  if (!['passed', 'failed'].includes(data.verdict)) add('factory-review-verdict', 'review verdict must be passed or failed');
  if (data.fresh_context !== true) add('factory-review-context', 'review requires fresh_context true');
  validateReviewFindingsShape(event, data.findings, perLot ? data.diff_sha256 : event.basis?.diff_sha256, event.basis?.plan_sha256, add);
  if (!perLot) validateReviewedSnapshot(data.reviewed_snapshot, 'consolidated reviewed_snapshot', add);
  if (data.independence_exception !== undefined) validateModelIndependenceException(event, data.independence_exception, add);
}

function validateReviewFindingsShape(event, findings, reviewDiff, planDigest, add) {
  if (!Array.isArray(findings)) {
    add('factory-review-findings-shape', 'review findings must be an array');
    return;
  }
  const ids = [];
  for (const finding of findings) {
    validateAllowedObject(finding, ['id', 'severity', 'rule', 'location', 'evidence', 'impact', 'status', 'resolution', 'waiver'], [], 'review finding', add);
    for (const key of ['id', 'severity', 'rule', 'location', 'evidence', 'impact', 'status']) requireNonEmptyString(finding?.[key], 'factory-review-finding-incomplete', `review finding requires ${key}`, add);
    if (finding?.id && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(finding.id)) add('factory-review-finding-id', `invalid stable finding id ${String(finding.id)}`);
    ids.push(finding?.id);
    if (finding && !['P0', 'P1', 'P2', 'P3'].includes(finding.severity)) add('factory-review-finding-severity', `unsupported review finding severity ${String(finding.severity)}`);
    if (finding && !['open', 'resolved', 'accepted', 'waived'].includes(finding.status)) add('factory-review-finding-status', `unsupported review finding status ${String(finding.status)}`);
    if (finding?.status === 'resolved') {
      validateExactObject(finding.resolution, ['diff_sha256', 'evidence_sha256', 'reviewed_at'], 'review finding resolution', add);
      requireSha256(finding.resolution?.diff_sha256, 'factory-review-resolution-diff', 'resolved finding requires diff_sha256', add);
      requireSha256(finding.resolution?.evidence_sha256, 'factory-review-resolution-evidence', 'resolved finding requires evidence_sha256', add);
      if (!isIsoDateTime(finding.resolution?.reviewed_at)) add('factory-review-resolution-time', 'resolved finding requires RFC 3339 reviewed_at');
      else if (Date.parse(finding.resolution.reviewed_at) > Date.parse(event.at)) add('factory-provenance-from-future', 'review resolution reviewed_at cannot be later than event.at');
      if (finding.resolution?.diff_sha256 !== reviewDiff) add('factory-review-resolution-stale-diff', 'resolved finding proof must bind the reviewed diff');
      if (finding.waiver !== undefined) add('factory-review-disposition-conflict', 'resolved finding cannot also carry a waiver');
    } else if (['accepted', 'waived'].includes(finding?.status)) {
      validateExactObject(finding.waiver, ['reason', 'approved_by', 'approved_at', 'finding_sha256', 'diff_sha256', 'plan_sha256'], 'review finding waiver', add);
      requireNonEmptyString(finding.waiver?.reason, 'factory-review-waiver-reason', 'review waiver requires a reason', add);
      validateApprovalPayload(event, finding.waiver || {}, 'review finding waiver', 'factory-review-waiver-approval', add);
      requireSha256(finding.waiver?.finding_sha256, 'factory-review-waiver-finding', 'review waiver requires finding_sha256', add);
      requireSha256(finding.waiver?.diff_sha256, 'factory-review-waiver-diff', 'review waiver requires diff_sha256', add);
      requireSha256(finding.waiver?.plan_sha256, 'factory-review-waiver-plan', 'review waiver requires plan_sha256', add);
      try {
        if (reviewFindingDigest(finding) !== finding.waiver?.finding_sha256) add('factory-review-waiver-finding-mismatch', 'review waiver does not bind the finding disposition');
      } catch {
        add('factory-review-waiver-finding-mismatch', 'review waiver finding cannot be canonically hashed');
      }
      if (finding.waiver?.diff_sha256 !== reviewDiff) add('factory-review-waiver-diff-mismatch', 'review waiver must bind the reviewed diff');
      if (finding.waiver?.plan_sha256 !== planDigest) add('factory-review-waiver-plan-mismatch', 'review waiver must bind the approved plan');
      if (finding.resolution !== undefined) add('factory-review-disposition-conflict', 'waived finding cannot also carry a resolution');
    } else if (finding?.resolution !== undefined || finding?.waiver !== undefined) {
      add('factory-review-disposition-conflict', 'open finding cannot carry resolution or waiver metadata');
    }
  }
  if (new Set(ids).size !== ids.length) add('factory-review-finding-id-duplicate', 'review finding ids must be unique within the review');
}

function validateAcceptanceCompleted(event, add) {
  const data = event.data;
  if (!['passed', 'failed', 'blocked'].includes(data.status)) add('factory-acceptance-status', 'acceptance status must be passed, failed or blocked');
  if (data.tested_sha !== null && data.tested_sha !== undefined) requireGitSha(data.tested_sha, 'factory-tested-sha-required', 'tested_sha must be a full Git SHA or null', add);
  if (data.test_bundle_sha256 !== undefined && data.test_bundle_sha256 !== null) requireSha256(data.test_bundle_sha256, 'factory-test-bundle-digest', 'test_bundle_sha256 must be SHA-256', add);
  if (data.reason !== undefined) requireNonEmptyString(data.reason, 'factory-acceptance-reason', 'acceptance reason must be non-empty when present', add);
  if (data.case_results !== undefined) validateCaseResultsShape(event, data.case_results, add);
  if (data.status === 'passed' && !Array.isArray(data.case_results)) add('factory-acceptance-cases-missing', 'passing acceptance requires case_results');
}

function validateCaseResultsShape(event, cases, add) {
  if (!Array.isArray(cases)) { add('factory-acceptance-cases-shape', 'case_results must be an array'); return; }
  for (const testCase of cases) {
    validateAllowedObject(testCase, ['id', 'outcome', 'user_visible_error', 'oracle_results', 'waiver'], ['id', 'outcome', 'oracle_results'], 'acceptance case result', add);
    requireNonEmptyString(testCase?.id, 'factory-acceptance-case-id', 'acceptance case id is required', add);
    if (!['passed', 'failed', 'blocked', 'skipped', 'waived'].includes(testCase?.outcome)) add('factory-acceptance-case-outcome', 'acceptance case outcome is invalid');
    if (testCase?.user_visible_error !== undefined && typeof testCase.user_visible_error !== 'boolean') add('factory-acceptance-user-visible-error-shape', 'user_visible_error must be boolean');
    if (!Array.isArray(testCase?.oracle_results)) add('factory-acceptance-oracle-shape', 'oracle_results must be an array');
    else for (const oracle of testCase.oracle_results) {
      validateExactObject(oracle, ['id', 'outcome'], 'acceptance oracle result', add);
      requireNonEmptyString(oracle?.id, 'factory-acceptance-oracle-id', 'oracle id is required', add);
      if (!['passed', 'failed', 'blocked', 'skipped', 'waived'].includes(oracle?.outcome)) add('factory-acceptance-oracle-outcome', 'oracle outcome is invalid');
    }
    if (testCase?.waiver !== undefined) {
      validateAllowedObject(testCase.waiver, ['reason', 'approver_ref', 'approved_at'], [], 'acceptance case waiver', add);
      requireNonEmptyString(testCase.waiver?.reason, 'factory-acceptance-waiver-incomplete', 'case waiver reason is required', add);
      const approval = { approved_by: testCase.waiver?.approver_ref, approved_at: testCase.waiver?.approved_at };
      validateApprovalPayload(event, approval, 'acceptance case waiver', 'factory-acceptance-waiver-incomplete', add);
    }
  }
}

function validateArtifactChange(data, add) {
  if (!Array.isArray(data.classes) || data.classes.length === 0 || data.classes.some((item) => typeof item !== 'string' || !item.trim())) add('factory-change-classes-shape', 'artifact change classes must be a non-empty array of strings');
  else if (new Set(data.classes).size !== data.classes.length) add('factory-change-classes-duplicate', 'artifact change classes must contain unique values');
  if (!Array.isArray(data.affected_lots) || data.affected_lots.some((item) => typeof item !== 'string' || !item.trim())) add('factory-change-affected-lots-shape', 'artifact change affected_lots must be an array of strings');
  else if (new Set(data.affected_lots).size !== data.affected_lots.length) add('factory-change-affected-lots-duplicate', 'artifact change affected_lots must contain unique values');
  if (data.reason !== undefined) requireNonEmptyString(data.reason, 'factory-change-reason-shape', 'artifact change reason must be non-empty', add);
}

function validateRecovery(event, add) {
  requireNonEmptyString(event.data.reason, 'factory-recovery-reason', 'controller recovery requires a reason', add);
  validateApprovalPayload(event, event.data, 'controller recovery', 'factory-recovery-approval', add);
  validateStringArray(event.data.blocker_ids, { nonEmpty: true, unique: true }, 'factory-recovery-blockers', 'controller recovery blocker_ids', add);
  validateStringArray(event.data.release_reservations, { unique: true }, 'factory-recovery-reservations', 'controller recovery release_reservations', add);
}

function validateFileInventory(files, changedPaths, scope, add) {
  if (!Array.isArray(files) || files.length === 0) { add('factory-proof-files-shape', `${scope} must be a non-empty array`); return; }
  for (const file of files) {
    validateAllowedObject(file, ['path', 'status', 'sha256'], ['path', 'status'], `${scope} entry`, add);
    try { normalizeRepoPath(file?.path); } catch (error) { add(error.code || 'factory-path-invalid', `${scope}: ${error.message}`); }
    if (!['present', 'deleted'].includes(file?.status)) add('factory-proof-file-status', `${scope} entry status must be present or deleted`);
    if (file?.status === 'present') requireSha256(file?.sha256, 'factory-proof-file-digest', `${scope} present entry requires sha256`, add);
    if (file?.status === 'deleted' && file?.sha256 !== undefined && file.sha256 !== null) add('factory-proof-deleted-digest', `${scope} deleted entry must omit sha256 or set it to null`);
  }
  if (!isCanonicalInventory(files)) add('factory-proof-files-order', `${scope} must be unique and sorted by path`);
  if (Array.isArray(changedPaths) && JSON.stringify(files.map((item) => item?.path)) !== JSON.stringify(changedPaths)) add('factory-proof-files-coverage', `${scope} must cover changed_paths exactly`);
}

function validateOutputInventory(outputs, add) {
  if (!Array.isArray(outputs) || outputs.length === 0) { add('factory-lot-outputs-shape', 'lot result outputs must be a non-empty array'); return; }
  const ids = [];
  for (const output of outputs) {
    validateExactObject(output, ['id', 'path', 'kind', 'algorithm', 'sha256'], 'lot result output', add);
    requireNonEmptyString(output?.id, 'factory-lot-output-id', 'lot result output id is required', add);
    try { normalizeRepoPath(output?.path); } catch (error) { add(error.code || 'factory-path-invalid', `lot result output: ${error.message}`); }
    if (!['file', 'tree'].includes(output?.kind)) add('factory-lot-output-kind', 'lot result output kind must be file or tree');
    const expectedAlgorithm = output?.kind === 'file' ? FILE_ARTIFACT_HASH_ALGORITHM
      : output?.kind === 'tree' ? TREE_ARTIFACT_HASH_ALGORITHM : null;
    if (!expectedAlgorithm || output?.algorithm !== expectedAlgorithm) add('factory-lot-output-algorithm', 'lot result output algorithm must match its kind');
    requireSha256(output?.sha256, 'factory-lot-output-digest', 'lot result output requires sha256', add);
    ids.push(output?.id);
  }
  if (new Set(ids).size !== ids.length) add('factory-lot-output-duplicate', 'lot result output ids must be unique');
}

function validateVerificationEntries(entries, scope, add) {
  if (!Array.isArray(entries) || entries.length === 0) { add('factory-lot-verification-shape', `${scope} must be a non-empty array`); return; }
  const ids = [];
  for (const entry of entries) {
    validateExactObject(entry, ['algorithm', 'id', 'command', 'status', 'runner', 'exit_code', 'stdout', 'stderr', 'artifacts', 'receipt_sha256'], `${scope} entry`, add);
    if (entry?.algorithm !== VERIFICATION_RECEIPT_ALGORITHM) add('factory-verification-receipt-algorithm', `${scope} algorithm must be ${VERIFICATION_RECEIPT_ALGORITHM}`);
    requireNonEmptyString(entry?.id, 'factory-verification-id', `${scope} id is required`, add);
    requireNonEmptyString(entry?.command, 'factory-verification-command', `${scope} command is required`, add);
    if (entry?.status !== 'passed') add('factory-lot-verification-not-passed', `${scope} status must be passed`);
    if (entry?.exit_code !== 0) add('factory-verification-exit-code', `${scope} exit_code must be zero`);
    validateExactObject(entry?.runner, ['kind', 'id', 'version', 'attestation_ref'], `${scope} runner`, add);
    if (!['controller_observed', 'protected_ci'].includes(entry?.runner?.kind)) add('factory-verification-runner-kind', `${scope} runner must be controller_observed or protected_ci`);
    requireNonEmptyString(entry?.runner?.id, 'factory-verification-runner-id', `${scope} runner id is required`, add);
    if (!Number.isInteger(entry?.runner?.version) || entry.runner.version < 1) add('factory-verification-runner-version', `${scope} runner version must be a positive integer`);
    requireNonEmptyString(entry?.runner?.attestation_ref, 'factory-verification-runner-attestation', `${scope} runner attestation_ref is required`, add);
    validateByteReference(entry?.stdout, `${scope} stdout`, add);
    validateByteReference(entry?.stderr, `${scope} stderr`, add);
    if (!Array.isArray(entry?.artifacts)) add('factory-verification-artifacts-shape', `${scope} artifacts must be an array`);
    else {
      for (const artifact of entry.artifacts) validateByteReference(artifact, `${scope} artifact`, add);
      if (!isCanonicalPaths(entry.artifacts.map((artifact) => artifact?.path))) add('factory-verification-artifacts-order', `${scope} artifacts must have unique sorted paths`);
    }
    requireSha256(entry?.receipt_sha256, 'factory-verification-receipt-digest', `${scope} receipt_sha256 is required`, add);
    try {
      if (verificationReceiptDigest(entry) !== entry?.receipt_sha256) add('factory-verification-receipt-digest-mismatch', `${scope} receipt digest is not recomputable`);
    } catch { add('factory-verification-receipt-digest-mismatch', `${scope} receipt cannot be canonically hashed`); }
    ids.push(entry?.id);
  }
  if (new Set(ids).size !== ids.length) add('factory-verification-duplicate', `${scope} ids must be unique`);
}

function validateByteReference(reference, scope, add) {
  validateExactObject(reference, ['path', 'sha256', 'bytes'], scope, add);
  try { normalizeRepoPath(reference?.path); } catch (error) { add(error.code || 'factory-path-invalid', `${scope}: ${error.message}`); }
  requireSha256(reference?.sha256, 'factory-verification-byte-digest', `${scope} sha256 is required`, add);
  if (!Number.isInteger(reference?.bytes) || reference.bytes < 0) add('factory-verification-byte-count', `${scope} bytes must be a non-negative integer`);
}

function validateReviewedSnapshot(snapshot, scope, add) {
  validateExactObject(snapshot, ['algorithm', 'commit_sha', 'git_tree', 'file_count', 'tree_sha256', 'snapshot_sha256'], scope, add);
  if (snapshot?.algorithm !== REVIEWED_TREE_ALGORITHM) add('factory-reviewed-snapshot-algorithm', `${scope} algorithm must be ${REVIEWED_TREE_ALGORITHM}`);
  requireGitSha(snapshot?.commit_sha, 'factory-reviewed-snapshot-commit', `${scope} requires a full commit SHA`, add);
  requireGitSha(snapshot?.git_tree, 'factory-reviewed-snapshot-tree', `${scope} requires a full Git tree id`, add);
  if (!Number.isInteger(snapshot?.file_count) || snapshot.file_count < 1) add('factory-reviewed-snapshot-file-count', `${scope} file_count must be positive`);
  requireSha256(snapshot?.tree_sha256, 'factory-reviewed-snapshot-tree-digest', `${scope} requires tree_sha256`, add);
  requireSha256(snapshot?.snapshot_sha256, 'factory-reviewed-snapshot-digest', `${scope} requires snapshot_sha256`, add);
  try {
    if (reviewedSnapshotDigest(snapshot) !== snapshot?.snapshot_sha256) add('factory-reviewed-snapshot-digest-mismatch', `${scope} snapshot digest is not recomputable`);
  } catch { add('factory-reviewed-snapshot-digest-mismatch', `${scope} cannot be canonically hashed`); }
}

function validateCandidateBinding(binding, candidateSha, add) {
  validateExactObject(binding, ['algorithm', 'reviewed_snapshot_sha256', 'candidate_snapshot', 'corpus_closeout_event_id', 'corpus_tree_sha256', 'authorized_paths', 'control_transition', 'binding_sha256'], 'candidate binding', add);
  if (binding?.algorithm !== CANDIDATE_BINDING_ALGORITHM) add('factory-candidate-binding-algorithm', `candidate binding algorithm must be ${CANDIDATE_BINDING_ALGORITHM}`);
  requireSha256(binding?.reviewed_snapshot_sha256, 'factory-candidate-reviewed-snapshot', 'candidate binding requires reviewed_snapshot_sha256', add);
  validateReviewedSnapshot(binding?.candidate_snapshot, 'candidate snapshot', add);
  if (binding?.candidate_snapshot?.commit_sha !== candidateSha) add('factory-candidate-binding-commit', 'candidate snapshot commit must equal candidate_sha');
  if (!/^EVT-[0-9]{6,}$/.test(binding?.corpus_closeout_event_id || '')) add('factory-candidate-corpus-event', 'candidate binding requires corpus_closeout_event_id');
  requireSha256(binding?.corpus_tree_sha256, 'factory-candidate-corpus-digest', 'candidate binding requires corpus_tree_sha256', add);
  validatePathArray(binding?.authorized_paths, { sorted: true }, 'factory-candidate-authorized-paths', 'candidate authorized_paths', add);
  validateControlTransition(binding?.control_transition, candidateSha, binding?.corpus_closeout_event_id, add);
  requireSha256(binding?.binding_sha256, 'factory-candidate-binding-digest', 'candidate binding requires binding_sha256', add);
  try {
    if (candidateBindingDigest(binding) !== binding?.binding_sha256) add('factory-candidate-binding-digest-mismatch', 'candidate binding digest is not recomputable');
  } catch { add('factory-candidate-binding-digest-mismatch', 'candidate binding cannot be canonically hashed'); }
}

function validateControlTransition(transition, candidateSha, corpusCloseoutEventId, add) {
  const fields = [
    'algorithm', 'events_path', 'state_path', 'base_commit_sha', 'candidate_commit_sha',
    'base_events_sha256', 'candidate_events_sha256', 'base_state_sha256', 'candidate_state_sha256',
    'base_event_count', 'candidate_event_count', 'appended_event_ids', 'appended_events_sha256',
    'transition_sha256',
  ];
  validateExactObject(transition, fields, 'candidate control transition', add);
  if (transition?.algorithm !== CONTROL_TRANSITION_ALGORITHM) add('factory-control-transition-algorithm', `control transition algorithm must be ${CONTROL_TRANSITION_ALGORITHM}`);
  for (const [field, suffix] of [['events_path', '/factory/events.v3.jsonl'], ['state_path', '/factory/state.v3.json']]) {
    try {
      normalizeRepoPath(transition?.[field]);
      if (!transition?.[field]?.endsWith(suffix)) add('factory-control-transition-path', `control transition ${field} must end with ${suffix}`);
    } catch (error) { add(error.code || 'factory-path-invalid', `control transition ${field}: ${error.message}`); }
  }
  requireGitSha(transition?.base_commit_sha, 'factory-control-transition-base', 'control transition requires a full base commit SHA', add);
  requireGitSha(transition?.candidate_commit_sha, 'factory-control-transition-candidate', 'control transition requires a full candidate commit SHA', add);
  if (transition?.candidate_commit_sha !== candidateSha) add('factory-control-transition-candidate-mismatch', 'control transition candidate commit must equal candidate_sha');
  if (transition?.base_commit_sha === transition?.candidate_commit_sha) add('factory-control-transition-empty', 'control transition must advance beyond the reviewed commit');
  for (const field of ['base_events_sha256', 'candidate_events_sha256', 'base_state_sha256', 'candidate_state_sha256', 'appended_events_sha256', 'transition_sha256']) {
    requireSha256(transition?.[field], 'factory-control-transition-digest', `control transition ${field} is required`, add);
  }
  if (!Number.isInteger(transition?.base_event_count) || transition.base_event_count < 0) add('factory-control-transition-count', 'control transition base_event_count must be a non-negative integer');
  if (!Number.isInteger(transition?.candidate_event_count) || transition.candidate_event_count !== transition?.base_event_count + 3) add('factory-control-transition-count', 'control transition must append exactly three events');
  if (!Array.isArray(transition?.appended_event_ids) || transition.appended_event_ids.length !== 3
    || transition.appended_event_ids.some((id) => !/^EVT-[0-9]{6,}$/.test(id || ''))) {
    add('factory-control-transition-event-ids', 'control transition requires exactly three typed appended event ids');
  } else {
    const sequences = transition.appended_event_ids.map((id) => Number(id.slice(4)));
    if (sequences.some((seq, index) => seq !== transition.base_event_count + index + 1)) add('factory-control-transition-event-ids', 'control transition appended event ids must be the exact contiguous suffix');
    if (transition.appended_event_ids.at(-1) !== corpusCloseoutEventId) add('factory-control-transition-closeout-id', 'control transition must end at corpus_closeout_event_id');
  }
  try {
    if (controlTransitionDigest(transition) !== transition?.transition_sha256) add('factory-control-transition-digest-mismatch', 'control transition digest is not recomputable');
  } catch { add('factory-control-transition-digest-mismatch', 'control transition cannot be canonically hashed'); }
}

function validateModelIndependenceException(event, exception, add) {
  validateExactObject(exception, ['reason', 'approved_by', 'approved_at', 'author_model_families', 'reviewer_model_family', 'plan_sha256'], 'review independence_exception', add);
  requireNonEmptyString(exception?.reason, 'factory-review-model-independence', 'review independence exception requires a reason', add);
  validateApprovalPayload(event, exception || {}, 'review independence exception', 'factory-review-model-independence', add);
  validateStringArray(exception?.author_model_families, { nonEmpty: true, unique: true }, 'factory-review-model-families', 'independence author_model_families', add);
  if (Array.isArray(exception?.author_model_families) && JSON.stringify([...exception.author_model_families].sort()) !== JSON.stringify(exception.author_model_families)) add('factory-review-model-families', 'independence author_model_families must be sorted');
  requireNonEmptyString(exception?.reviewer_model_family, 'factory-review-model-family', 'independence reviewer_model_family is required', add);
  requireSha256(exception?.plan_sha256, 'factory-review-model-plan', 'independence exception must bind the approved plan', add);
  if (exception?.plan_sha256 !== event.basis?.plan_sha256) add('factory-review-model-plan-mismatch', 'independence exception plan_sha256 must equal event basis');
}

function validateObservedConventions(conventions, add, scope = 'lot result') {
  if (!Array.isArray(conventions) || conventions.length === 0) { add('factory-observed-conventions', `${scope} requires at least one observed convention`); return; }
  const ids = [];
  for (const convention of conventions) {
    validateExactObject(convention, ['id', 'rule', 'examples'], 'observed convention', add);
    requireNonEmptyString(convention?.id, 'factory-convention-id', 'observed convention id is required', add);
    requireNonEmptyString(convention?.rule, 'factory-convention-rule', 'observed convention rule is required', add);
    if (!Array.isArray(convention?.examples) || convention.examples.length === 0) add('factory-convention-examples', 'observed convention requires evidence examples');
    else {
      for (const example of convention.examples) validateByteReference(example, 'observed convention example', add);
      if (!isCanonicalPaths(convention.examples.map((example) => example?.path))) add('factory-convention-examples-order', 'observed convention examples must have unique sorted paths');
    }
    ids.push(convention?.id);
  }
  if (new Set(ids).size !== ids.length) add('factory-convention-id-duplicate', 'observed convention ids must be unique');
  if (JSON.stringify([...ids].sort()) !== JSON.stringify(ids)) add('factory-convention-order', 'observed conventions must be sorted by id');
}

function validateRefactorAssessment(assessment, event, add) {
  if (!isPlainObject(assessment)) { add('factory-refactor-assessment', 'lot result requires a structured refactor_assessment'); return; }
  if (assessment.status === 'not_required') {
    validateExactObject(assessment, ['status', 'reason'], 'refactor assessment', add);
    requireNonEmptyString(assessment.reason, 'factory-refactor-reason', 'not_required refactor assessment requires a reason', add);
    return;
  }
  if (assessment.status !== 'approved') { add('factory-refactor-status', 'completed result refactor status must be not_required or approved'); return; }
  validateRefactorEscalation(assessment, event, add, true);
}

function validateRefactorEscalation(escalation, event, add, approved) {
  const common = ['status', 'locations', 'evidence', 'why_blocking', 'smallest_refactor', 'alternatives', 'blast_radius', 'tests'];
  const keys = approved ? [...common, 'amendment_ref', 'escalation_event_id', 'approval_event_id'] : common.filter((key) => key !== 'status');
  validateExactObject(escalation, keys, approved ? 'approved refactor assessment' : 'refactor escalation', add);
  if (approved && escalation?.status !== 'approved') add('factory-refactor-status', 'approved refactor assessment status must be approved');
  for (const [key, code] of [['locations', 'factory-refactor-locations'], ['alternatives', 'factory-refactor-alternatives'], ['blast_radius', 'factory-refactor-blast-radius'], ['tests', 'factory-refactor-tests']]) {
    validateStringArray(escalation?.[key], { nonEmpty: true, unique: true }, code, `refactor ${key}`, add);
  }
  if (!Array.isArray(escalation?.evidence) || escalation.evidence.length === 0) add('factory-refactor-evidence', 'refactor escalation requires evidence');
  else for (const evidence of escalation.evidence) validateByteReference(evidence, 'refactor evidence', add);
  requireNonEmptyString(escalation?.why_blocking, 'factory-refactor-why-blocking', 'refactor escalation requires why_blocking', add);
  requireNonEmptyString(escalation?.smallest_refactor, 'factory-refactor-smallest', 'refactor escalation requires smallest_refactor', add);
  if (approved) {
    requireNonEmptyString(escalation?.amendment_ref, 'factory-refactor-amendment', 'approved refactor requires amendment_ref', add);
    if (!/^EVT-[0-9]{6,}$/.test(escalation?.escalation_event_id || '')) add('factory-refactor-escalation-event', 'approved refactor requires escalation_event_id');
    if (!/^EVT-[0-9]{6,}$/.test(escalation?.approval_event_id || '')) add('factory-refactor-approval-event', 'approved refactor requires approval_event_id');
  }
}

function validateManifestLocator(locator, add) {
  if (!isPlainObject(locator)) { add('factory-evidence-locator-shape', 'manifest_locator must be an object'); return; }
  if (locator.kind === 'repo_file') {
    validateExactObject(locator, ['kind', 'path', 'digest_sha256'], 'repo evidence manifest locator', add);
    try { normalizeRepoPath(locator.path); } catch (error) { add(error.code || 'factory-path-invalid', `manifest locator: ${error.message}`); }
  } else if (locator.kind === 'ci_artifact') {
    validateExactObject(locator, ['kind', 'provider', 'artifact_id', 'name', 'run_id', 'path', 'digest_sha256', 'bundle_digest', 'attestation_ref'], 'CI evidence manifest locator', add);
    if (locator.provider !== 'github_actions') add('factory-evidence-locator-provider', 'CI manifest locator provider must be github_actions');
    for (const key of ['artifact_id', 'name', 'run_id', 'attestation_ref']) requireNonEmptyString(locator[key], 'factory-evidence-locator-field', `CI manifest locator requires ${key}`, add);
    try { normalizeRepoPath(locator.path); } catch (error) { add(error.code || 'factory-path-invalid', `CI artifact manifest path: ${error.message}`); }
    if (!/^sha256:[0-9a-f]{64}$/.test(locator.bundle_digest || '')) add('factory-evidence-bundle-digest', 'CI manifest locator bundle_digest must be typed SHA-256');
  } else {
    add('factory-evidence-locator-kind', `unsupported manifest locator kind ${String(locator.kind)}`);
  }
  requireSha256(locator?.digest_sha256, 'factory-evidence-locator-digest', 'manifest locator requires digest_sha256', add);
}

function validatePathArray(value, options, code, scope, add) {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0)) { add(code, `${scope} must be ${options.nonEmpty ? 'a non-empty' : 'an'} array`); return; }
  for (const item of value) try { normalizeRepoPath(item); } catch (error) { add(error.code || 'factory-path-invalid', `${scope}: ${error.message}`); }
  if (options.sorted && !isCanonicalPaths(value)) add(code, `${scope} must be unique and sorted`);
}

function validateStringArray(value, options, code, scope, add) {
  if (!Array.isArray(value) || (options.nonEmpty && value.length === 0) || value?.some((item) => typeof item !== 'string' || !item.trim())) { add(code, `${scope} must be ${options.nonEmpty ? 'a non-empty ' : ''}array of strings`); return; }
  if (options.unique && new Set(value).size !== value.length) add(code, `${scope} must contain unique values`);
}

function validateExactObject(value, keys, scope, add) {
  if (!isPlainObject(value)) { add('factory-contract-object-shape', `${scope} must be an object`); return; }
  addUnknownKeys(value, new Set(keys), scope, add);
  for (const key of keys) if (!Object.hasOwn(value, key)) add('factory-contract-missing-field', `${scope}: missing field ${key}`);
}

function validateAllowedObject(value, allowedKeys, requiredKeys, scope, add) {
  if (!isPlainObject(value)) { add('factory-contract-object-shape', `${scope} must be an object`); return; }
  addUnknownKeys(value, new Set(allowedKeys), scope, add);
  for (const key of requiredKeys) if (!Object.hasOwn(value, key)) add('factory-contract-missing-field', `${scope}: missing field ${key}`);
}

function validateStringMap(value, keys, scope, add) {
  validateExactObject(value, keys, scope, add);
  if (!isPlainObject(value)) return;
  for (const key of keys) if (value[key] !== null && typeof value[key] !== 'string') add('factory-contract-field-type', `${scope}.${key} must be string or null`);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isIsoDateTime(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function isCanonicalPaths(paths) {
  return Array.isArray(paths) && paths.every((item) => typeof item === 'string') && new Set(paths).size === paths.length && [...paths].sort().every((item, index) => item === paths[index]);
}

function isCanonicalInventory(files) {
  return Array.isArray(files)
    && files.every((file) => isPlainObject(file) && typeof file.path === 'string')
    && new Set(files.map((file) => file.path)).size === files.length
    && [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).every((file, index) => file.path === files[index].path);
}

function isDigestableInventory(files) {
  return isCanonicalInventory(files)
    && files.every((file) => (file.status === 'present' && /^[0-9a-f]{64}$/.test(file.sha256 || ''))
      || (file.status === 'deleted' && (file.sha256 === undefined || file.sha256 === null)));
}

function isDigestableVerificationList(entries) {
  return Array.isArray(entries)
    && entries.length > 0
    && entries.every((entry) => isPlainObject(entry)
      && typeof entry.id === 'string'
      && entry.id.trim()
      && entry.status === 'passed'
      && entry.exit_code === 0
      && /^[0-9a-f]{64}$/.test(entry.receipt_sha256 || ''));
}

function validateDraftPayload(data, add) {
  if (data.draft !== true) add('factory-delivery-not-draft', 'delivery may create draft PRs only');
  if (!Array.isArray(data.actions) || data.actions.length === 0 || new Set(data.actions).size !== data.actions.length) {
    add('factory-delivery-actions-shape', 'delivery actions must be a non-empty unique array');
  } else {
    for (const action of data.actions) if (!['open_draft_pr', 'update_draft_pr'].includes(action)) add('factory-delivery-forbidden-action', `delivery cannot ${String(action)}`);
  }
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(data.candidate_sha || '')) add('factory-delivery-candidate', 'delivery requires a full candidate SHA');
}

function validateEvidencePublicationPayload(data, add) {
  const publication = data.publication;
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    add('factory-evidence-publication-shape', 'evidence publication must be an object');
    return;
  }
  const mode = publication.mode;
  const allowed = mode === 'ci_artifact' ? new Set(['mode', 'media_type']) : new Set(['mode']);
  addUnknownKeys(publication, allowed, 'evidence publication', add);
  if (!['ci_artifact', 'evidence_only_commit'].includes(mode)) add('factory-evidence-publication-mode', `unsupported evidence publication mode ${String(mode)}`);
  if (mode === 'ci_artifact') {
    if (Object.hasOwn(data, 'evidence_sha')) add('factory-ci-artifact-false-sha', 'ci_artifact publication must not invent an evidence Git SHA');
    if (data.manifest_locator?.kind !== 'ci_artifact') add('factory-ci-artifact-locator', 'ci_artifact publication requires a CI manifest_locator');
    if (typeof publication.media_type !== 'string' || !publication.media_type.trim()) add('factory-ci-artifact-media-type', 'ci_artifact requires an artifact media type');
  } else if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(data.evidence_sha || '')) {
    add('factory-evidence-sha-required', 'evidence_only_commit requires a full evidence SHA');
  } else if (data.manifest_locator?.kind !== 'repo_file') {
    add('factory-evidence-repo-locator', 'evidence_only_commit requires a repo_file manifest_locator');
  }
}

function addUnknownKeys(value, allowed, location, add) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) add('factory-contract-unknown-field', `${location}: unknown field ${key}`);
}

function dependencyCycles(lots) {
  const cycles = [];
  const open = new Set();
  const done = new Set();
  const stack = [];
  function visit(id) {
    if (done.has(id)) return;
    if (open.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    open.add(id);
    stack.push(id);
    for (const dep of lots.get(id)?.dependencies || []) if (lots.has(dep)) visit(dep);
    stack.pop();
    open.delete(id);
    done.add(id);
  }
  for (const id of lots.keys()) visit(id);
  return cycles;
}
