import { validateActorCapabilities, validateRoleCapability } from './capabilities.mjs';
import { normalizeRepoPath, pathAllowedByPatterns, validateClaim } from './path-claims.mjs';

export const EVENT_TYPES = new Set([
  'package_initialized', 'legacy_v1_imported',
  'spec_proposed', 'spec_approved', 'plan_proposed', 'plan_approved', 'execution_policy_resolved',
  'wave_reserved', 'lot_started', 'lot_result_reported', 'lot_reviewed', 'lot_integrated', 'lot_blocked', 'reservation_released',
  'integration_verified', 'consolidated_reviewed', 'corpus_closed', 'candidate_frozen',
  'acceptance_started', 'acceptance_completed', 'acceptance_waived', 'evidence_committed', 'release_reviewed',
  'draft_pr_planned', 'draft_pr_created',
  'artifact_change_observed', 'controller_recovery_approved',
]);

export const GATE_NAMES = [
  'specification', 'technical_plan', 'lot_reviews', 'integration', 'consolidated_review',
  'corpus_closeout', 'candidate', 'acceptance', 'evidence', 'release',
];

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
  if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) add('factory-event-time', 'at must be an ISO date-time');
  if (!event.actor || !['controller', 'implementer', 'reviewer', 'acceptance', 'delivery', 'migration'].includes(event.actor.role) || !event.actor.execution_id || !event.actor.model || !Array.isArray(event.actor.capabilities)) add('factory-event-actor', 'complete actor metadata and effective capabilities are required');
  else {
    if (!['planned', 'requested', 'used'].every((key) => Object.hasOwn(event.actor.model, key) && (event.actor.model[key] === null || typeof event.actor.model[key] === 'string'))) add('factory-event-model-provenance', 'actor.model requires planned, requested and used string-or-null fields');
    findings.push(...validateActorCapabilities(event.actor));
  }
  if (!event.subject || typeof event.subject.package !== 'string' || !event.subject.package || !Object.hasOwn(event.subject, 'lot_id') || (event.subject.lot_id !== null && typeof event.subject.lot_id !== 'string')) add('factory-event-subject', 'subject.package and string-or-null lot_id are required');
  if (!event.basis || typeof event.basis !== 'object' || Array.isArray(event.basis)) add('factory-event-basis', 'basis object is required');
  else {
    for (const key of ['spec_sha256', 'plan_sha256', 'diff_sha256']) if (event.basis[key] !== undefined && event.basis[key] !== null && !/^[0-9a-f]{64}$/.test(event.basis[key])) add('factory-event-basis-digest', `basis.${key} must be SHA-256 or null`);
    if (event.basis.candidate_sha !== undefined && event.basis.candidate_sha !== null && !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(event.basis.candidate_sha)) add('factory-event-basis-digest', 'basis.candidate_sha must be a full Git SHA or null');
  }
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) add('factory-event-data', 'data object is required');
  else validateClosedEventPayload(event, add);
  return findings;
}

function validateClosedEventPayload(event, add) {
  if (event.type === 'draft_pr_planned') {
    addUnknownKeys(event.data, new Set(['draft', 'actions', 'candidate_sha', 'payload_sha256']), 'draft_pr_planned data', add);
    validateDraftPayload(event.data, add);
    if (!/^[0-9a-f]{64}$/.test(event.data.payload_sha256 || '')) add('factory-delivery-payload-digest', 'draft_pr_planned requires payload_sha256');
  } else if (event.type === 'draft_pr_created') {
    addUnknownKeys(event.data, new Set(['draft', 'actions', 'candidate_sha', 'pr_url']), 'draft_pr_created data', add);
    validateDraftPayload(event.data, add);
    if (typeof event.data.pr_url !== 'string' || !event.data.pr_url.startsWith('https://')) add('factory-delivery-pr-url', 'draft_pr_created requires an HTTPS pr_url');
  } else if (event.type === 'evidence_committed') {
    addUnknownKeys(event.data, new Set(['evidence_manifest_path', 'evidence_manifest_sha256', 'evidence_sha', 'publication']), 'evidence_committed data', add);
    try { normalizeRepoPath(event.data.evidence_manifest_path); } catch (error) { add(error.code || 'factory-path-invalid', `invalid evidence_manifest_path: ${String(event.data.evidence_manifest_path)}`); }
    if (!/^[0-9a-f]{64}$/.test(event.data.evidence_manifest_sha256 || '')) add('factory-evidence-manifest-digest', 'evidence_committed requires evidence_manifest_sha256');
    validateEvidencePublicationPayload(event.data, add);
  }
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
  const allowed = mode === 'ci_artifact'
    ? new Set(['mode', 'artifact_locator', 'artifact_digest', 'media_type'])
    : new Set(['mode']);
  addUnknownKeys(publication, allowed, 'evidence publication', add);
  if (!['ci_artifact', 'evidence_only_commit'].includes(mode)) add('factory-evidence-publication-mode', `unsupported evidence publication mode ${String(mode)}`);
  if (mode === 'ci_artifact') {
    if (Object.hasOwn(data, 'evidence_sha')) add('factory-ci-artifact-false-sha', 'ci_artifact publication must not invent an evidence Git SHA');
    if (typeof publication.artifact_locator !== 'string' || !publication.artifact_locator.trim()) add('factory-ci-artifact-locator', 'ci_artifact requires an artifact locator');
    if (!/^sha256:[0-9a-f]{64}$/.test(publication.artifact_digest || '')) add('factory-ci-artifact-digest', 'ci_artifact requires a typed SHA-256 artifact digest');
    if (typeof publication.media_type !== 'string' || !publication.media_type.trim()) add('factory-ci-artifact-media-type', 'ci_artifact requires an artifact media type');
  } else if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(data.evidence_sha || '')) {
    add('factory-evidence-sha-required', 'evidence_only_commit requires a full evidence SHA');
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
