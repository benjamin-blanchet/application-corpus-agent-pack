import { canonicalHash, deepCopy } from './canonical-json.mjs';
import { assertEventChain, eventLogHash } from './event-log.mjs';
import { GATE_NAMES, PHASES, isBlockerActive, validatePlan } from './contract.mjs';
import { invalidateState } from './invalidation.mjs';
import { nextWave, validateLotResult, validateReservedWave } from './scheduler.mjs';
import { validateAcceptanceProvenance, validateEvidenceSha } from './provenance.mjs';
import { validateEffectiveCapabilities } from './capabilities.mjs';
import { normalizeRepoPath, pathAllowedByPatterns } from './path-claims.mjs';
import { FactoryV3Error, invariant } from './errors.mjs';
import { reviewFindingDigest } from './proof-contracts.mjs';

export function reduceFactory({ plan, events, current = {}, allowInvalidPlan = false }) {
  assertEventChain(events);
  const planFindings = validatePlan(plan);
  if (planFindings.length && !allowInvalidPlan) throw new FactoryV3Error(planFindings[0].code, planFindings[0].message, { findings: planFindings });
  if (events.length) {
    invariant(
      ['package_initialized', 'legacy_v1_imported'].includes(events[0].type),
      'factory-package-init-required',
      'the event stream must start with package_initialized or legacy_v1_imported',
    );
  }
  const state = initialState(plan, events);

  for (const event of events) applyEvent(state, plan, event);

  const observesSpecification = Object.hasOwn(current, 'spec_exists') || Object.hasOwn(current, 'spec_sha256');
  if (state.digests.spec_sha256 && observesSpecification) {
    if (current.spec_exists !== true) {
      invalidateState(state, ['spec_contract'], 'current specification file is missing', [], plan);
    } else if (!isSha256(current.spec_sha256) || current.spec_sha256 !== state.digests.spec_sha256) {
      invalidateState(state, ['spec_contract'], 'current specification digest differs from the proposed or approved event basis', [], plan);
    }
  }
  const currentPlanHash = current.plan_sha256 || canonicalHash(plan);
  if (state.gates.technical_plan.status === 'valid' && state.digests.plan_sha256 !== currentPlanHash) {
    invalidateState(state, ['plan_contract'], 'current plan digest differs from the approved event basis', [], plan);
  }
  if (
    state.gates.candidate.status === 'valid'
    && Object.hasOwn(current, 'git_head')
    && current.git_head !== state.provenance.candidate_sha
    && current.git_change_class !== 'evidence_only'
  ) {
    invalidateState(state, ['implementation'], 'application Git HEAD differs from the frozen candidate', [], plan);
  }
  if (current.provenance_status === 'invalid') {
    invalidateState(state, ['evidence'], current.provenance_reason || 'release provenance validation failed', [], plan);
  }
  state.ready_lots = nextWave(plan, state).map((reservation) => reservation.lot_id);
  state.phase = derivePhase(state);
  const gitHeadInput = state.gates.candidate.status === 'valid' ? current.git_head ?? null : null;
  state.derived_from = {
    last_seq: events.length,
    events_sha256: eventLogHash(events),
    current_inputs_sha256: canonicalHash({
      spec_exists: current.spec_exists ?? null,
      spec_sha256: current.spec_sha256 ?? null,
      plan_sha256: currentPlanHash,
      git_head: gitHeadInput,
      evidence_manifest_sha256: current.evidence_manifest_sha256 ?? null,
      provenance_status: current.provenance_status ?? null,
    }),
  };
  return deepCopy(state);
}

export function stateMatchesDerived(snapshot, derived) {
  return canonicalHash(snapshot) === canonicalHash(derived);
}

function initialState(plan, events) {
  return {
    v: 3,
    run_id: events[0]?.run_id || null,
    run_mode: null,
    derived_from: { last_seq: events.length, events_sha256: eventLogHash(events), current_inputs_sha256: canonicalHash({}) },
    phase: 'draft',
    digests: {
      spec_sha256: null,
      plan_sha256: canonicalHash(plan),
      test_bundle_sha256: null,
      corpus_tree_sha256: null,
      evidence_manifest_sha256: null,
    },
    execution_policy: null,
    lots: Object.fromEntries((plan.lots || []).map((lot) => [lot.id, {
      status: 'pending', attempts: 0, attempt_budget_extensions: 0, effective_max_attempts: lot.max_attempts,
      reservation_id: null, diff_sha256: null, review: null, workspace_snapshot: null,
      preimplementation_contract: null, diff_budget_override: null, refactor_escalation: null, refactor_approval: null,
    }])),
    reservations: {},
    gates: Object.fromEntries(GATE_NAMES.map((name) => [name, { status: 'pending', basis_event: null }])),
    provenance: {
      integration_snapshot: null,
      consolidated_snapshot: null,
      candidate_binding: null,
      candidate_sha: null,
      tested_sha: null,
      evidence_sha: null,
      publication: null,
    },
    reviews: { consolidated: null, release: null },
    ready_lots: [],
    blockers: [],
    delivery: null,
    acceptance_run: null,
    legacy: null,
  };
}

function applyEvent(state, plan, event) {
  const lotId = event.subject.lot_id;
  switch (event.type) {
    case 'package_initialized':
      invariant(event.seq === 1, 'factory-package-init-order', 'package_initialized must be the first event');
      requireControllerEvent(event);
      state.run_mode = event.data.run_mode;
      return;
    case 'legacy_v1_imported':
      invariant(event.seq === 1, 'factory-migration-import-order', 'legacy_v1_imported must be the first event');
      state.run_mode = 'retrospective_attestation';
      importLegacyState(state, event);
      return;
    case 'spec_proposed':
      requireControllerEvent(event);
      invariant(isSha256(event.data.spec_sha256), 'factory-spec-digest-missing', 'spec_proposed requires spec_sha256');
      state.digests.spec_sha256 = event.data.spec_sha256;
      invalidateState(state, ['spec_contract'], `specification proposed at ${event.event_id}`, [], plan);
      state.gates.specification = { status: 'pending', basis_event: event.event_id };
      return;
    case 'spec_approved':
      requireControllerEvent(event);
      invariant(
        state.gates.specification.status === 'pending' && state.gates.specification.basis_event,
        'factory-spec-approval-without-proposal',
        'spec_approved requires a preceding spec_proposed event',
      );
      invariant(isSha256(event.data.spec_sha256), 'factory-spec-digest-missing', 'spec_approved requires spec_sha256');
      invariant(event.data.spec_sha256 === state.digests.spec_sha256, 'factory-spec-approval-basis', 'spec approval does not match the current specification digest');
      invariant(Boolean(event.data.approved_by && event.data.approved_at && !Number.isNaN(Date.parse(event.data.approved_at))), 'factory-spec-approval-metadata', 'spec approval requires approver and timestamp');
      state.gates.specification = validGate(event);
      return;
    case 'plan_proposed':
      requireControllerEvent(event);
      requireGate(state, 'specification', event);
      invariant(isSha256(event.data.plan_sha256), 'factory-plan-proposal-basis', 'plan proposal requires a SHA-256 plan digest');
      state.digests.plan_sha256 = event.data.plan_sha256;
      invalidateState(state, ['plan_contract'], `plan proposed at ${event.event_id}`, [], plan);
      state.gates.technical_plan = { status: 'pending', basis_event: event.event_id };
      return;
    case 'plan_approved':
      requireControllerEvent(event);
      requireGate(state, 'specification', event);
      invariant(
        state.gates.technical_plan.status === 'pending' && state.gates.technical_plan.basis_event,
        'factory-plan-approval-without-proposal',
        'plan_approved requires a preceding plan_proposed event',
      );
      invariant(isSha256(event.data.plan_sha256), 'factory-plan-approval-basis', 'plan_approved requires a SHA-256 plan digest');
      invariant(event.data.plan_sha256 === state.digests.plan_sha256, 'factory-plan-approval-basis', 'plan approval does not match current plan digest');
      invariant(Boolean(event.data.approved_by && event.data.approved_at && !Number.isNaN(Date.parse(event.data.approved_at))), 'factory-plan-approval-metadata', 'plan approval requires approver and timestamp');
      state.gates.technical_plan = validGate(event);
      return;
    case 'execution_policy_resolved':
      requireControllerEvent(event);
      requireGate(state, 'technical_plan', event);
      invariant(['balanced', 'maximum_quality', 'economical', 'manual'].includes(event.data.mode), 'factory-execution-policy-mode', 'execution policy mode is invalid');
      invariant(event.data.observed_at && !Number.isNaN(Date.parse(event.data.observed_at)), 'factory-execution-policy-observation', 'execution policy requires a runtime catalogue observation timestamp');
      invariant(event.data.models && ['economy', 'standard', 'expert', 'reviewer'].every((profile) => typeof event.data.models[profile] === 'string' && event.data.models[profile]), 'factory-execution-policy-incomplete', 'all canonical model profiles must be resolved');
      invariant(event.data.model_families && ['economy', 'standard', 'expert', 'reviewer'].every((profile) => typeof event.data.model_families[profile] === 'string' && event.data.model_families[profile]), 'factory-execution-policy-model-family', 'all canonical model families must be resolved');
      state.execution_policy = deepCopy(event.data);
      return;
    case 'lot_conventions_observed': {
      requireGate(state, 'technical_plan', event);
      invariant(state.execution_policy, 'factory-preimplementation-contract-policy', 'execution policy must be resolved before convention observation');
      const lot = requireLot(state, lotId);
      const plannedLot = plan.lots.find((candidate) => candidate.id === lotId);
      const priorReservation = lot.reservation_id ? state.reservations[lot.reservation_id] : null;
      invariant(priorReservation?.status !== 'active', 'factory-preimplementation-contract-after-reservation', `${lotId}: conventions must be observed before an active reservation`);
      invariant(['pending', 'needs_correction', 'blocked', 'stale'].includes(lot.status), 'factory-preimplementation-contract-order', `${lotId}: conventions must be observed before reservation or implementation`);
      for (const dependency of plannedLot.dependencies || []) {
        const dependencyState = state.lots[dependency];
        invariant(dependencyState?.status === 'integrated' && dependencyState.review?.verdict === 'passed', 'factory-preimplementation-contract-dependency', `${lotId}: conventions may be observed only after dependencies are integrated and reviewed`);
      }
      invariant(event.basis.plan_sha256 === state.digests.plan_sha256, 'factory-preimplementation-contract-plan', `${lotId}: convention contract must bind the approved plan`);
      invariant(event.actor.role === plannedLot.agent_role, 'factory-preimplementation-contract-role', `${lotId}: convention observation must be delegated to the planned worker role`);
      invariant(JSON.stringify(event.actor.capabilities) === JSON.stringify(['read']), 'factory-preimplementation-contract-capabilities', `${lotId}: preimplementation convention observation is read-only`);
      const selectedModel = state.execution_policy.models?.[plannedLot.model_role];
      invariant(event.actor.model.planned === plannedLot.model_role, 'factory-preimplementation-contract-model-profile', `${lotId}: convention observer must record planned profile ${plannedLot.model_role}`);
      invariant(event.actor.model.used === selectedModel, 'factory-preimplementation-contract-model', `${lotId}: convention observer must use the resolved model`);
      invariant(event.actor.model.model_family === state.execution_policy.model_families?.[plannedLot.model_role], 'factory-preimplementation-contract-model-family', `${lotId}: convention observer model family must match the resolved policy`);
      for (const convention of event.data.observed_conventions || []) {
        for (const example of convention.examples || []) {
          invariant(pathAllowedByPatterns(example.path, plannedLot.read_claims || []), 'factory-preimplementation-contract-read-claim', `${lotId}: convention example ${example.path} is outside declared read claims`);
        }
      }
      lot.preimplementation_contract = {
        ...deepCopy(event.data),
        event_id: event.event_id,
        plan_sha256: event.basis.plan_sha256,
      };
      return;
    }
    case 'wave_reserved': {
      requireGate(state, 'technical_plan', event);
      invariant(event.actor.role === 'controller', 'factory-wave-role', 'only the controller may reserve a wave');
      invariant(state.execution_policy, 'factory-wave-without-policy', 'execution policy must be resolved before scheduling');
      const reservations = event.data.reservations || [];
      invariant(reservations.length > 0, 'factory-wave-empty', 'wave_reserved requires at least one reservation');
      const findings = validateReservedWave(plan, state, reservations);
      invariant(findings.length === 0, findings[0]?.code || 'factory-wave-invalid', findings[0]?.message || 'wave is invalid', { findings });
      for (const item of reservations) {
        invariant(item.reservation_id && !state.reservations[item.reservation_id], 'factory-reservation-id', 'reservation id must be unique');
        const lot = plan.lots.find((candidate) => candidate.id === item.lot_id);
        const reservation = { reservation_id: item.reservation_id, lot_id: item.lot_id, claims: deepCopy(lot.write_claims), controller_id: event.controller_id, status: 'active', basis_event: event.event_id };
        state.reservations[item.reservation_id] = reservation;
        state.lots[item.lot_id].status = 'reserved';
        state.lots[item.lot_id].reservation_id = item.reservation_id;
      }
      return;
    }
    case 'attempt_budget_extended': {
      requireControllerEvent(event);
      requireGate(state, 'technical_plan', event);
      const lot = requireLot(state, lotId);
      const plannedLot = plan.lots.find((candidate) => candidate.id === lotId);
      invariant(event.basis.plan_sha256 === state.digests.plan_sha256, 'factory-attempt-extension-plan-basis', `${lotId}: attempt extension must bind the approved plan`);
      invariant(event.basis.diff_sha256 === lot.diff_sha256, 'factory-attempt-extension-diff-basis', `${lotId}: attempt extension must bind the exhausted result`);
      invariant(lot.attempts >= lot.effective_max_attempts, 'factory-attempt-extension-premature', `${lotId}: attempt budget may be extended only after exhaustion`);
      invariant(['needs_correction', 'blocked', 'stale'].includes(lot.status), 'factory-attempt-extension-state', `${lotId}: attempt budget extension requires a terminal correction state`);
      lot.attempt_budget_extensions += 1;
      lot.effective_max_attempts = plannedLot.max_attempts + lot.attempt_budget_extensions;
      return;
    }
    case 'diff_budget_overridden': {
      requireControllerEvent(event);
      requireGate(state, 'technical_plan', event);
      const lot = requireLot(state, lotId);
      invariant(event.basis.plan_sha256 === state.digests.plan_sha256, 'factory-diff-budget-plan-basis', `${lotId}: diff budget override must bind the approved plan`);
      lot.diff_budget_override = { ...deepCopy(event.data.limits), event_id: event.event_id, approved_by: event.data.approved_by, approved_at: event.data.approved_at, reason: event.data.reason };
      return;
    }
    case 'lot_started': {
      const lot = requireLot(state, lotId);
      const reservation = requireReservation(state, event.data.reservation_id, lotId);
      invariant(reservation.status === 'active', 'factory-lot-reservation-inactive', `${lotId}: reservation is not active`);
      const plannedLot = plan.lots.find((candidate) => candidate.id === lotId);
      const max = lot.effective_max_attempts;
      invariant(['reserved', 'needs_correction'].includes(lot.status), 'factory-lot-start-order', `${lotId}: lot can start only after reservation or a failed review`);
      invariant(lot.preimplementation_contract, 'factory-preimplementation-contract-required', `${lotId}: lot cannot start without pre-observed conventions`);
      invariant(lot.preimplementation_contract.plan_sha256 === state.digests.plan_sha256, 'factory-preimplementation-contract-plan', `${lotId}: convention contract is stale against the approved plan`);
      invariant(lot.preimplementation_contract.source_revision === event.data.workspace_snapshot?.base_revision, 'factory-preimplementation-contract-revision-mismatch', `${lotId}: lot baseline differs from the convention observation revision`);
      invariant(lot.attempts < max, 'factory-lot-attempts-exhausted', `${lotId}: attempt budget exhausted`);
      invariant(event.actor.role === plannedLot.agent_role, 'factory-lot-role-mismatch', `${lotId}: actor role ${event.actor.role} does not match planned role ${plannedLot.agent_role}`);
      const capabilityFindings = validateEffectiveCapabilities(plannedLot, event.actor);
      invariant(capabilityFindings.length === 0, capabilityFindings[0]?.code || 'factory-capability-mismatch', capabilityFindings[0]?.message || 'effective capabilities do not match the plan', { findings: capabilityFindings });
      const selectedModel = state.execution_policy?.models?.[plannedLot.model_role];
      invariant(event.actor.model.planned === plannedLot.model_role, 'factory-lot-model-profile', `${lotId}: actor provenance must record planned profile ${plannedLot.model_role}`);
      invariant(!selectedModel || event.actor.model.used === selectedModel, 'factory-lot-model-mismatch', `${lotId}: used model does not match the resolved execution policy`);
      invariant(event.actor.model.model_family === state.execution_policy?.model_families?.[plannedLot.model_role], 'factory-lot-model-family', `${lotId}: actor model family does not match the resolved execution policy`);
      invalidateState(state, ['implementation'], `implementation attempt started at ${event.event_id}`, [lotId], plan);
      reservation.status = 'active';
      lot.attempts += 1;
      lot.status = 'running';
      lot.author = { execution_id: event.actor.execution_id, model: deepCopy(event.actor.model) };
      lot.workspace_snapshot = deepCopy(event.data.workspace_snapshot);
      return;
    }
    case 'lot_result_reported': {
      const lotState = requireLot(state, lotId);
      invariant(lotState.status === 'running', 'factory-lot-result-without-start', `${lotId}: result reported while lot is not running`);
      const lot = plan.lots.find((candidate) => candidate.id === lotId);
      const reservation = requireReservation(state, lotState.reservation_id, lotId);
      invariant(event.actor.execution_id === lotState.author?.execution_id, 'factory-lot-result-author', `${lotId}: only the active attempt author may report its result`);
      invariant(event.data.result?.base_revision === lotState.workspace_snapshot?.base_revision, 'factory-lot-base-revision-mismatch', `${lotId}: result base_revision differs from lot_started workspace snapshot`);
      invariant(event.data.result?.workspace_delta?.from_snapshot_sha256 === lotState.workspace_snapshot?.snapshot_sha256, 'factory-workspace-delta-from-mismatch', `${lotId}: workspace delta does not bind lot_started`);
      invariant(event.data.result?.workspace_delta?.to_snapshot?.workspace_id === lotState.workspace_snapshot?.workspace_id, 'factory-workspace-snapshot-link', `${lotId}: workspace changed between lot start and result`);
      invariant(event.data.result?.workspace_delta?.to_snapshot?.base_revision === lotState.workspace_snapshot?.base_revision, 'factory-workspace-snapshot-link', `${lotId}: workspace base revision changed during lot`);
      const findings = validateLotResult(lot, event.data.result || {}, reservation, lotState.preimplementation_contract);
      invariant(findings.length === 0, findings[0]?.code || 'factory-lot-result-invalid', findings[0]?.message || 'lot result is invalid', { findings });
      invariant(event.basis.diff_sha256 === event.data.result.diff_sha256, 'factory-lot-result-basis', `${lotId}: event basis must bind the reported diff`);
      if (event.data.result?.refactor_assessment?.status === 'approved') {
        invariant(lotState.refactor_approval, 'factory-refactor-approval-missing', `${lotId}: approved refactor result requires a prior typed controller approval`);
        invariant(event.data.result.refactor_assessment.approval_event_id === lotState.refactor_approval.event_id, 'factory-refactor-approval-mismatch', `${lotId}: refactor result references a different approval event`);
        invariant(event.data.result.refactor_assessment.escalation_event_id === lotState.refactor_approval.escalation_event_id, 'factory-refactor-escalation-mismatch', `${lotId}: refactor result references a different escalation`);
        invariant(event.data.result.refactor_assessment.amendment_ref === lotState.refactor_approval.amendment_ref, 'factory-refactor-amendment-mismatch', `${lotId}: refactor result amendment_ref differs from operator approval`);
      }
      lotState.status = 'completed_pending_review';
      lotState.diff_sha256 = event.data.result.diff_sha256;
      lotState.changed_paths = [...new Set(event.data.result.changed_paths || [])].sort();
      for (const blocker of state.blockers) {
        if (blocker.lot_id === lotId && blocker.kind === 'review_correction' && isBlockerActive(blocker)) blocker.status = 'superseded';
      }
      return;
    }
    case 'lot_reviewed': {
      const lot = requireLot(state, lotId);
      invariant(lot.status === 'completed_pending_review', 'factory-lot-review-order', `${lotId}: review requires a newly reported result`);
      invariant(event.data.diff_sha256 === lot.diff_sha256, 'factory-lot-review-basis', `${lotId}: review does not match the worker diff`);
      invariant(['passed', 'failed'].includes(event.data.verdict), 'factory-lot-review-verdict', 'lot review verdict must be passed or failed');
      invariant(event.actor.execution_id !== lot.author?.execution_id, 'factory-lot-self-review', `${lotId}: author cannot review their own result`);
      invariant(event.actor.role === 'reviewer', 'factory-lot-review-role', `${lotId}: lot review requires reviewer role`);
      invariant(event.data.fresh_context === true, 'factory-lot-review-context', `${lotId}: independent review requires a fresh context`);
      const reviewerModel = state.execution_policy?.models?.reviewer;
      invariant(event.actor.model.planned === 'reviewer', 'factory-lot-review-profile', `${lotId}: reviewer provenance must record reviewer profile`);
      invariant(!reviewerModel || event.actor.model.used === reviewerModel, 'factory-lot-review-model', `${lotId}: used reviewer model does not match the execution policy`);
      invariant(event.actor.model.model_family === state.execution_policy?.model_families?.reviewer, 'factory-lot-review-model-family', `${lotId}: reviewer model family does not match the resolved policy`);
      requireModelFamilyIndependence(event, [lot.author?.model?.model_family], state.digests.plan_sha256, `${lotId} review`);
      validateReviewFindings(event, event.data.findings || [], event.data.diff_sha256, event.basis.plan_sha256);
      const openFindings = (event.data.findings || []).filter((finding) => finding.status === 'open');
      invariant(event.data.verdict !== 'failed' || openFindings.length > 0, 'factory-failed-review-without-finding', `${lotId}: failed review requires an open actionable finding`);
      invariant(event.data.verdict !== 'passed' || openFindings.length === 0, 'factory-passed-review-open-finding', `${lotId}: passing review cannot retain an open finding`);
      lot.review = { status: event.data.verdict, verdict: event.data.verdict, event_id: event.event_id, findings: deepCopy(event.data.findings || []), actor: deepCopy(event.actor) };
      lot.status = event.data.verdict === 'passed' ? 'reviewed' : 'needs_correction';
      if (event.data.verdict === 'failed') {
        invalidateState(state, ['implementation'], `lot review failed at ${event.event_id}`, [lotId], plan);
        requireReservation(state, lot.reservation_id, lotId).status = 'active';
        lot.status = 'needs_correction';
        state.blockers.push({ id: `${event.event_id}-review`, lot_id: lotId, kind: 'review_correction', status: 'open', reason: 'lot review failed' });
      }
      return;
    }
    case 'lot_integrated': {
      const lot = requireLot(state, lotId);
      invariant(event.actor.role === 'controller', 'factory-lot-integration-role', `${lotId}: only the controller records integration`);
      invariant(lot.status === 'reviewed' && lot.review?.verdict === 'passed', 'factory-lot-integrated-without-review', `${lotId}: integration requires an independent passing lot review`);
      lot.status = 'integrated';
      const reservation = requireReservation(state, lot.reservation_id, lotId);
      reservation.status = 'released';
      state.gates.lot_reviews = allLotsReviewed(plan, state) ? validGate(event) : state.gates.lot_reviews;
      return;
    }
    case 'lot_blocked':
      requireLot(state, lotId).status = 'blocked';
      if (event.data.refactor_escalation) {
        requireLot(state, lotId).refactor_escalation = { event_id: event.event_id, ...deepCopy(event.data.refactor_escalation) };
        requireLot(state, lotId).refactor_approval = null;
      }
      state.blockers.push({ id: event.event_id, lot_id: lotId, status: 'open', reason: event.data.reason || 'lot blocked' });
      invalidateState(state, ['implementation'], `lot blocked at ${event.event_id}`, [lotId], plan);
      requireLot(state, lotId).status = 'blocked';
      return;
    case 'refactor_approved': {
      requireControllerEvent(event);
      const lot = requireLot(state, lotId);
      invariant(lot.refactor_escalation?.event_id === event.data.escalation_event_id, 'factory-refactor-escalation-mismatch', `${lotId}: refactor approval must bind the current escalation`);
      invariant(event.basis.plan_sha256 === state.digests.plan_sha256 && event.data.amended_plan_sha256 === state.digests.plan_sha256, 'factory-refactor-plan-mismatch', `${lotId}: refactor approval must bind the currently approved amended plan`);
      invariant(event.data.approved_by && !Number.isNaN(Date.parse(event.data.approved_at)) && Date.parse(event.data.approved_at) <= Date.parse(event.at), 'factory-refactor-approval', `${lotId}: refactor approval requires nonfuture operator provenance`);
      lot.refactor_approval = { event_id: event.event_id, escalation_event_id: event.data.escalation_event_id, amendment_ref: event.data.amendment_ref, plan_sha256: event.data.amended_plan_sha256 };
      for (const blocker of state.blockers) {
        if (blocker.id === event.data.escalation_event_id && blocker.lot_id === lotId && isBlockerActive(blocker)) blocker.status = 'resolved';
      }
      lot.status = 'needs_correction';
      return;
    }
    case 'reservation_released': {
      requireControllerEvent(event);
      releaseReservation(state, event.data.reservation_id, lotId);
      return;
    }
    case 'integration_verified':
      requireControllerEvent(event);
      invariant(allLotsReviewed(plan, state), 'factory-integration-before-lots', 'all implementation lots must be integrated and reviewed');
      invariant(event.data.status === 'passed' && isSha256(event.data.verification_sha256), 'factory-integration-verification', 'integration verification must pass with a digest');
      assertVerificationCoverage(plan, event.data.verifications, 'integration');
      invalidateState(state, ['implementation'], `integration re-verified at ${event.event_id}`, [], plan);
      for (const lot of Object.values(state.lots)) {
        if (lot.review?.verdict === 'passed') {
          lot.status = 'integrated';
          lot.review.status = 'passed';
        }
      }
      state.gates.lot_reviews = validGate(event);
      state.gates.integration = validGate(event);
      state.provenance.integration_snapshot = deepCopy(event.data.reviewed_snapshot);
      state.provenance.consolidated_snapshot = null;
      state.provenance.candidate_binding = null;
      return;
    case 'consolidated_reviewed': {
      requireGate(state, 'integration', event);
      invariant(['passed', 'failed'].includes(event.data.verdict), 'factory-consolidated-review-verdict', 'consolidated review verdict must be passed or failed');
      invariant(event.actor.role === 'reviewer' && event.data.fresh_context === true, 'factory-consolidated-review-independence', 'consolidated review requires a reviewer in a fresh context');
      invariant(event.actor.model.planned === 'reviewer' && event.actor.model.used === state.execution_policy?.models?.reviewer, 'factory-consolidated-review-model', 'consolidated review must use the resolved reviewer profile');
      invariant(event.actor.model.model_family === state.execution_policy?.model_families?.reviewer, 'factory-consolidated-review-model-family', 'consolidated review model family must match the resolved reviewer family');
      invariant(!Object.values(state.lots).some((lot) => lot.author?.execution_id === event.actor.execution_id), 'factory-consolidated-self-review', 'a lot author cannot perform consolidated review');
      invariant(event.data.reviewed_snapshot?.snapshot_sha256 === state.provenance.integration_snapshot?.snapshot_sha256, 'factory-consolidated-review-snapshot-mismatch', 'consolidated review must bind the exact integration snapshot');
      requireModelFamilyIndependence(event, Object.values(state.lots).map((lot) => lot.author?.model?.model_family), state.digests.plan_sha256, 'consolidated review');
      validateReviewFindings(event, event.data.findings || [], event.basis.diff_sha256, event.basis.plan_sha256);
      const openFindings = (event.data.findings || []).filter((finding) => finding.status === 'open');
      invariant(event.data.verdict !== 'failed' || openFindings.length > 0, 'factory-failed-review-without-finding', 'failed consolidated review requires an open actionable finding');
      invariant(event.data.verdict !== 'passed' || openFindings.length === 0, 'factory-passed-review-open-finding', 'passing consolidated review cannot retain an open finding');
      const priorFailures = state.blockers.filter((blocker) => blocker.kind === 'consolidated_review' && isBlockerActive(blocker));
      if (event.data.verdict === 'passed') {
        for (const blocker of priorFailures) invariant(blocker.integration_basis !== state.gates.integration.basis_event, 'factory-consolidated-review-without-correction', 'a failed consolidated review requires corrected integration or operator recovery before passing');
      }
      invalidateState(state, ['review'], `consolidated review recorded at ${event.event_id}`, [], plan);
      state.gates.consolidated_review = event.data.verdict === 'passed' ? validGate(event) : { status: 'failed', basis_event: event.event_id };
      state.provenance.consolidated_snapshot = event.data.verdict === 'passed' ? deepCopy(event.data.reviewed_snapshot) : null;
      state.reviews.consolidated = { event_id: event.event_id, verdict: event.data.verdict, actor: deepCopy(event.actor), findings: deepCopy(event.data.findings || []) };
      if (event.data.verdict === 'failed') state.blockers.push({ id: event.event_id, kind: 'consolidated_review', integration_basis: state.gates.integration.basis_event, status: 'open', reason: 'consolidated review failed' });
      else for (const blocker of state.blockers) if (blocker.kind === 'consolidated_review' && isBlockerActive(blocker)) blocker.status = 'superseded';
      return;
    }
    case 'corpus_closed':
      requireControllerEvent(event);
      requireGate(state, 'consolidated_review', event);
      invariant(isSha256(event.data.corpus_tree_sha256), 'factory-corpus-digest', 'corpus closeout requires a recursive corpus tree digest');
      invalidateState(state, ['corpus'], `corpus closeout recorded at ${event.event_id}`, [], plan);
      state.digests.corpus_tree_sha256 = event.data.corpus_tree_sha256;
      state.gates.corpus_closeout = validGate(event);
      return;
    case 'candidate_frozen':
      requireControllerEvent(event);
      requireGate(state, 'corpus_closeout', event);
      invariant(validateEvidenceSha(event.data.candidate_sha), 'factory-candidate-sha', 'candidate_frozen requires a full Git SHA');
      invariant(event.data.binding?.reviewed_snapshot_sha256 === state.provenance.consolidated_snapshot?.snapshot_sha256, 'factory-candidate-reviewed-snapshot', 'candidate binding must reference the passing consolidated review snapshot');
      invariant(event.data.binding?.candidate_snapshot?.commit_sha === event.data.candidate_sha, 'factory-candidate-binding-commit', 'candidate snapshot must equal candidate_sha');
      invariant(event.data.binding?.corpus_tree_sha256 === state.digests.corpus_tree_sha256, 'factory-candidate-corpus-digest', 'candidate binding must reference the closed corpus tree');
      invariant(event.data.binding?.corpus_closeout_event_id === state.gates.corpus_closeout.basis_event, 'factory-candidate-corpus-event', 'candidate binding must reference the current corpus closeout event');
      invariant(event.data.binding?.control_transition?.base_commit_sha === state.provenance.consolidated_snapshot?.commit_sha, 'factory-control-transition-base', 'candidate control transition must start at the reviewed commit');
      invariant(event.data.binding?.control_transition?.candidate_commit_sha === event.data.candidate_sha, 'factory-control-transition-candidate', 'candidate control transition must end at candidate_sha');
      invariant(event.data.binding?.control_transition?.events_path === `${event.subject.package}/factory/events.v3.jsonl`, 'factory-control-transition-events-path', 'candidate control transition must bind this package event log');
      invariant(event.data.binding?.control_transition?.state_path === `${event.subject.package}/factory/state.v3.json`, 'factory-control-transition-state-path', 'candidate control transition must bind this package state');
      invariant(event.data.binding?.control_transition?.appended_event_ids?.at(-1) === state.gates.corpus_closeout.basis_event, 'factory-control-transition-closeout-id', 'candidate control transition must end at the current corpus closeout event');
      invalidateState(state, ['acceptance_script'], `candidate frozen at ${event.event_id}`, [], plan);
      state.provenance.candidate_sha = event.data.candidate_sha;
      state.provenance.candidate_binding = deepCopy(event.data.binding);
      state.provenance.tested_sha = null;
      state.provenance.evidence_sha = null;
      state.provenance.publication = null;
      state.digests.test_bundle_sha256 = null;
      state.digests.evidence_manifest_sha256 = null;
      state.acceptance_run = null;
      state.gates.candidate = validGate(event);
      return;
    case 'acceptance_started':
      requireGate(state, 'candidate', event);
      invariant(event.actor.role === 'acceptance', 'factory-acceptance-role', 'acceptance_started requires acceptance role');
      requireUnprivilegedAcceptanceActor(event);
      invalidateState(state, ['campaign'], `acceptance campaign started at ${event.event_id}`, [], plan);
      state.provenance.tested_sha = null;
      state.provenance.evidence_sha = null;
      state.provenance.publication = null;
      state.digests.test_bundle_sha256 = null;
      state.digests.evidence_manifest_sha256 = null;
      state.acceptance_run = { status: 'running', event_id: event.event_id, candidate_sha: state.provenance.candidate_sha };
      return;
    case 'acceptance_completed': {
      requireGate(state, 'candidate', event);
      invariant(event.actor.role === 'acceptance', 'factory-acceptance-role', 'acceptance_completed requires acceptance role');
      requireUnprivilegedAcceptanceActor(event);
      invariant(state.acceptance_run?.status === 'running' && state.acceptance_run.candidate_sha === state.provenance.candidate_sha, 'factory-acceptance-not-started', 'acceptance must start on the frozen candidate before a result is recorded');
      invariant(['passed', 'failed', 'blocked'].includes(event.data.status), 'factory-acceptance-status', 'acceptance status must be passed, failed or blocked');
      const findings = event.data.tested_sha === null || event.data.tested_sha === undefined
        ? []
        : validateAcceptanceProvenance({ candidate_sha: state.provenance.candidate_sha, tested_sha: event.data.tested_sha, waived: false });
      invariant(event.data.status !== 'passed' || event.data.tested_sha, 'factory-tested-sha-required', 'passing acceptance requires tested_sha');
      invariant(findings.length === 0, findings[0]?.code || 'factory-acceptance-provenance', findings[0]?.message || 'acceptance provenance is invalid', { findings });
      invariant(event.data.status !== 'passed' || isSha256(event.data.test_bundle_sha256), 'factory-test-bundle-digest', 'passing acceptance requires test_bundle_sha256');
      invariant(!event.data.test_bundle_sha256 || isSha256(event.data.test_bundle_sha256), 'factory-test-bundle-digest', 'test_bundle_sha256 must be SHA-256 when present');
      if (event.data.status === 'passed') validatePassingCaseResults(event.data.case_results);
      invalidateState(state, ['campaign'], `acceptance completed at ${event.event_id}`, [], plan);
      state.provenance.tested_sha = event.data.tested_sha || null;
      state.provenance.evidence_sha = null;
      state.provenance.publication = null;
      state.digests.evidence_manifest_sha256 = null;
      state.digests.test_bundle_sha256 = event.data.test_bundle_sha256 || null;
      state.gates.acceptance = event.data.status === 'passed'
        ? validGate(event)
        : { status: event.data.status, basis_event: event.event_id, reason: event.data.reason || null };
      state.acceptance_run = { ...state.acceptance_run, status: event.data.status, completed_event: event.event_id };
      return;
    }
    case 'acceptance_waived': {
      requireGate(state, 'candidate', event);
      const findings = validateAcceptanceProvenance({ candidate_sha: state.provenance.candidate_sha, tested_sha: null, waived: true, reason: event.data.reason, approved_by: event.data.approved_by, approved_at: event.data.approved_at });
      invariant(findings.length === 0, findings[0]?.code || 'factory-acceptance-waiver', findings[0]?.message || 'acceptance waiver is invalid', { findings });
      invalidateState(state, ['campaign'], `acceptance waived at ${event.event_id}`, [], plan);
      state.provenance.tested_sha = null;
      state.provenance.evidence_sha = null;
      state.provenance.publication = null;
      state.digests.test_bundle_sha256 = null;
      state.digests.evidence_manifest_sha256 = null;
      state.gates.acceptance = { ...validGate(event), status: 'waived', reason: event.data.reason };
      state.acceptance_run = { status: 'waived', event_id: event.event_id, candidate_sha: state.provenance.candidate_sha };
      return;
    }
    case 'evidence_committed':
      requireControllerEvent(event);
      requireGate(state, 'acceptance', event, ['valid', 'waived']);
      invariant(isSha256(event.data.evidence_manifest_sha256), 'factory-evidence-manifest-digest', 'evidence manifest digest is required');
      invariant(event.data.manifest_locator?.digest_sha256 === event.data.evidence_manifest_sha256, 'factory-evidence-locator-digest-mismatch', 'evidence locator digest must match the manifest digest');
      assertEvidencePublication(event.data);
      invalidateState(state, ['evidence'], `evidence committed at ${event.event_id}`, [], plan);
      state.provenance.evidence_sha = event.data.publication.mode === 'evidence_only_commit' ? event.data.evidence_sha : null;
      state.provenance.publication = deepCopy({ manifest_locator: event.data.manifest_locator, ...event.data.publication });
      state.digests.evidence_manifest_sha256 = event.data.evidence_manifest_sha256;
      state.gates.evidence = validGate(event);
      return;
    case 'release_reviewed':
      for (const gate of ['specification', 'technical_plan', 'lot_reviews', 'integration', 'consolidated_review', 'corpus_closeout', 'candidate', 'acceptance', 'evidence']) requireGate(state, gate, event, gate === 'acceptance' ? ['valid', 'waived'] : ['valid']);
      invariant(!state.blockers.some(isBlockerActive), 'factory-release-open-blocker', 'release review cannot pass while a blocker is open');
      invariant(event.actor.role === 'reviewer' && event.data.fresh_context === true, 'factory-release-review-independence', 'release review requires a reviewer in a fresh context');
      invariant(event.actor.model.planned === 'reviewer' && event.actor.model.used === state.execution_policy?.models?.reviewer, 'factory-release-review-model', 'release review must use the resolved reviewer profile');
      invariant(event.actor.model.model_family === state.execution_policy?.model_families?.reviewer, 'factory-release-review-model-family', 'release review model family must match the resolved reviewer family');
      requireModelFamilyIndependence(event, [
        ...Object.values(state.lots).map((lot) => lot.author?.model?.model_family),
        state.reviews.consolidated?.actor?.model?.model_family,
      ], state.digests.plan_sha256, 'release review');
      validateReviewFindings(event, event.data.findings || [], event.basis.diff_sha256, event.basis.plan_sha256);
      invariant(!(event.data.findings || []).some((finding) => finding.status === 'open'), 'factory-release-review-open-finding', 'release review cannot pass with open findings');
      invariant(event.data.verdict === 'passed', 'factory-release-review-failed', 'release review must pass');
      state.gates.release = validGate(event);
      state.reviews.release = { event_id: event.event_id, verdict: event.data.verdict, actor: deepCopy(event.actor), findings: deepCopy(event.data.findings || []) };
      return;
    case 'draft_pr_planned':
      requireGate(state, 'release', event);
      invariant(event.actor.role === 'delivery', 'factory-delivery-role', 'draft PR planning requires delivery role');
      assertDraftOnly(event.data);
      invariant(event.data.candidate_sha === state.provenance.candidate_sha, 'factory-delivery-candidate', 'draft PR plan must reference the frozen candidate');
      state.delivery = { status: 'planned', event_id: event.event_id, candidate_sha: event.data.candidate_sha, payload_sha256: event.data.payload_sha256 || null };
      return;
    case 'draft_pr_created':
      requireGate(state, 'release', event);
      invariant(state.delivery?.status === 'planned', 'factory-delivery-without-plan', 'draft PR creation requires a prior typed plan event');
      invariant(event.actor.role === 'delivery', 'factory-delivery-role', 'draft PR creation requires delivery role');
      invariant(event.actor.capabilities.includes('open_pr'), 'factory-delivery-capabilities', 'draft PR creation requires explicit open_pr capability');
      assertDraftOnly(event.data);
      invariant(event.data.candidate_sha === state.provenance.candidate_sha, 'factory-delivery-candidate', 'draft PR result must reference the frozen candidate');
      invariant(typeof event.data.pr_url === 'string' && event.data.pr_url.startsWith('https://'), 'factory-delivery-pr-url', 'draft PR result requires an HTTPS URL');
      state.delivery = { status: 'draft_created', event_id: event.event_id, candidate_sha: event.data.candidate_sha, pr_url: event.data.pr_url };
      return;
    case 'artifact_change_observed': {
      invariant(event.actor.role === 'controller', 'factory-change-role', 'only the controller may record artifact changes');
      invariant(Array.isArray(event.data.classes), 'factory-change-classes-shape', 'artifact_change_observed.classes must be an array');
      const classes = event.data.classes;
      invariant(classes.length > 0, 'factory-change-without-class', 'artifact_change_observed requires at least one class');
      invariant(classes.every((item) => typeof item === 'string' && item.trim()), 'factory-change-classes-shape', 'artifact classes must be non-empty strings');
      invariant(new Set(classes).size === classes.length, 'factory-change-classes-duplicate', 'artifact classes must be unique');
      invariant(Array.isArray(event.data.affected_lots), 'factory-change-affected-lots-shape', 'artifact_change_observed.affected_lots must be an array');
      invariant(new Set(event.data.affected_lots).size === event.data.affected_lots.length, 'factory-change-affected-lots-duplicate', 'affected_lots must contain unique lot IDs');
      const knownLots = new Set((plan.lots || []).map((lot) => lot.id));
      for (const affectedLot of event.data.affected_lots) {
        invariant(typeof affectedLot === 'string' && knownLots.has(affectedLot), 'factory-change-unknown-lot', `artifact change refers to unknown lot ${String(affectedLot)}`);
      }
      invalidateState(state, classes, event.data.reason || `change observed at ${event.event_id}`, event.data.affected_lots, plan);
      return;
    }
    case 'controller_recovery_approved': {
      invariant(event.actor.role === 'controller', 'factory-recovery-role', 'controller recovery requires controller role');
      invariant(event.data.approved_by && event.data.approved_at && !Number.isNaN(Date.parse(event.data.approved_at)), 'factory-recovery-approval', 'controller recovery requires operator approval provenance');
      invariant(Array.isArray(event.data.blocker_ids) && event.data.blocker_ids.length > 0, 'factory-recovery-blockers', 'controller recovery must name blockers to resolve');
      for (const blockerId of event.data.blocker_ids) {
        const blocker = state.blockers.find((candidate) => candidate.id === blockerId && isBlockerActive(candidate));
        invariant(blocker, 'factory-recovery-unknown-blocker', `open blocker not found: ${blockerId}`);
        blocker.status = 'resolved';
        blocker.resolved_by_event = event.event_id;
      }
      for (const reservationId of event.data.release_reservations || []) releaseReservation(state, reservationId);
      return;
    }
    default:
      throw new FactoryV3Error('factory-event-unhandled', `no reducer for ${event.type}`);
  }
}

function requireUnprivilegedAcceptanceActor(event) {
  const effective = new Set(event.actor.capabilities || []);
  invariant(
    effective.size === 2 && effective.has('read') && effective.has('execute'),
    'factory-conditional-capability-unavailable',
    'acceptance control events remain read/execute-only until a machine-verifying isolated executor is integrated',
  );
  invariant(
    !Array.isArray(event.actor.capability_grants) || event.actor.capability_grants.length === 0,
    'factory-conditional-capability-unavailable',
    'declarative capability_grants cannot materialize network or data-mutation capability',
  );
}

function importLegacyState(state, event) {
  state.legacy = deepCopy(event.data);
  state.blockers.push({ id: `${event.event_id}-migration`, status: 'open', reason: 'migration review and V3 plan approval required' });
  for (const [lotId, legacy] of Object.entries(event.data.snapshot?.lots || {})) {
    if (!state.lots[lotId]) state.lots[lotId] = {
      status: 'pending', attempts: 0, attempt_budget_extensions: 0, effective_max_attempts: 2,
      reservation_id: null, diff_sha256: null, review: null, workspace_snapshot: null,
      preimplementation_contract: null, diff_budget_override: null, refactor_escalation: null, refactor_approval: null,
    };
    if (legacy.status === 'completed') state.lots[lotId].status = 'legacy_completed_unreviewed';
    state.lots[lotId].legacy_model_used = legacy.model_used || null;
  }
  for (const gate of Object.values(state.gates)) if (gate.status !== 'pending') gate.status = 'legacy_attested';
  // Legacy SHAs remain historical input only. Without a V3 candidate and
  // evidence manifest they are not promoted into current provenance.
}

function requireGate(state, name, event, statuses = ['valid']) {
  invariant(statuses.includes(state.gates[name]?.status), 'factory-gate-order', `${event.type} requires ${name} to be ${statuses.join(' or ')}`);
}

function requireControllerEvent(event) {
  invariant(event.actor.role === 'controller', 'factory-controller-role', `${event.type} must be recorded by the controller`);
}

function requireLot(state, id) {
  invariant(id && state.lots[id], 'factory-event-lot', `event refers to unknown lot ${String(id)}`);
  return state.lots[id];
}

function requireReservation(state, id, lotId) {
  invariant(id && state.reservations[id], 'factory-event-reservation', `unknown reservation ${String(id)}`);
  invariant(!lotId || state.reservations[id].lot_id === lotId, 'factory-event-reservation-owner', `${id} does not belong to ${lotId}`);
  return state.reservations[id];
}

function releaseReservation(state, id, lotId) {
  const reservation = requireReservation(state, id, lotId);
  const lot = requireLot(state, reservation.lot_id);
  invariant(reservation.status === 'active', 'factory-reservation-release-inactive', `${id}: only an active reservation may be released`);
  invariant(lot.status !== 'running', 'factory-reservation-release-running', `${reservation.lot_id}: a running reservation requires a typed terminal or cancellation event before release`);
  invariant(['reserved', 'needs_correction', 'blocked', 'stale', 'integrated'].includes(lot.status), 'factory-reservation-release-state', `${reservation.lot_id}: reservation cannot be released from ${lot.status}`);
  reservation.status = 'released';
  if (lot.status === 'reserved') {
    lot.status = 'pending';
    lot.reservation_id = null;
  }
  return reservation;
}

function allLotsReviewed(plan, state) {
  return (plan.lots || []).filter((lot) => lot.kind !== 'review').every((lot) => state.lots[lot.id]?.status === 'integrated' && state.lots[lot.id]?.review?.verdict === 'passed');
}

function validGate(event) {
  return { status: 'valid', basis_event: event.event_id };
}

function validateReviewFindings(event, findings, reviewDiff, planDigest) {
  invariant(Array.isArray(findings), 'factory-review-findings-shape', 'review findings must be an array');
  const ids = [];
  for (const finding of findings) {
    invariant(finding && typeof finding === 'object' && !Array.isArray(finding), 'factory-review-finding-shape', 'each review finding must be an object');
    for (const key of ['id', 'severity', 'rule', 'location', 'evidence', 'impact', 'status']) {
      invariant(typeof finding[key] === 'string' && finding[key].trim(), 'factory-review-finding-incomplete', `review finding requires ${key}`);
    }
    invariant(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(finding.id), 'factory-review-finding-id', `invalid stable finding id ${finding.id}`);
    ids.push(finding.id);
    invariant(['P0', 'P1', 'P2', 'P3'].includes(finding.severity), 'factory-review-finding-severity', `unsupported review finding severity ${finding.severity}`);
    invariant(['open', 'resolved', 'accepted', 'waived'].includes(finding.status), 'factory-review-finding-status', `unsupported review finding status ${finding.status}`);
    if (finding.status === 'resolved') {
      invariant(finding.resolution?.diff_sha256 === reviewDiff && isSha256(finding.resolution?.evidence_sha256), 'factory-review-resolution-stale-diff', 'resolved finding requires proof bound to the reviewed diff');
      invariant(!Number.isNaN(Date.parse(finding.resolution?.reviewed_at)) && Date.parse(finding.resolution.reviewed_at) <= Date.parse(event.at), 'factory-review-resolution-time', 'resolved finding reviewed_at must be valid and nonfuture');
    }
    if (['accepted', 'waived'].includes(finding.status)) {
      const waiver = finding.waiver;
      invariant(waiver?.reason && waiver?.approved_by && !Number.isNaN(Date.parse(waiver?.approved_at)) && Date.parse(waiver.approved_at) <= Date.parse(event.at), 'factory-review-waiver-approval', 'accepted or waived finding requires a nonfuture operator approval');
      invariant(waiver.finding_sha256 === reviewFindingDigest(finding), 'factory-review-waiver-finding-mismatch', 'review waiver must bind the exact finding');
      invariant(waiver.diff_sha256 === reviewDiff, 'factory-review-waiver-diff-mismatch', 'review waiver must bind the reviewed diff');
      invariant(waiver.plan_sha256 === planDigest, 'factory-review-waiver-plan-mismatch', 'review waiver must bind the approved plan');
    }
  }
  invariant(new Set(ids).size === ids.length, 'factory-review-finding-id-duplicate', 'review finding ids must be unique');
}

function requireModelFamilyIndependence(event, authorFamilies, planDigest, scope) {
  const authors = [...new Set((authorFamilies || []).filter(Boolean))].sort();
  const reviewer = event.actor?.model?.model_family;
  const conflict = authors.includes(reviewer);
  if (!conflict) {
    invariant(event.data.independence_exception === undefined, 'factory-review-model-exception-unneeded', `${scope}: independence_exception is allowed only for a same-family conflict`);
    return;
  }
  const exception = event.data.independence_exception;
  invariant(exception?.reason && exception?.approved_by && !Number.isNaN(Date.parse(exception?.approved_at)) && Date.parse(exception.approved_at) <= Date.parse(event.at), 'factory-review-model-independence', `${scope}: same-family review requires a nonfuture operator exception`);
  invariant(JSON.stringify(exception.author_model_families) === JSON.stringify(authors), 'factory-review-model-family-mismatch', `${scope}: exception must name every author model family`);
  invariant(exception.reviewer_model_family === reviewer, 'factory-review-model-family-mismatch', `${scope}: exception reviewer family differs from the actual reviewer`);
  invariant(exception.plan_sha256 === planDigest, 'factory-review-model-plan-mismatch', `${scope}: exception must bind the approved plan`);
}

function assertVerificationCoverage(plan, receipts, scope) {
  const expected = [...new Set((plan.lots || []).flatMap((lot) => lot.verification || []))].sort();
  const actual = (receipts || []).map((receipt) => receipt?.command).sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), 'factory-integration-verification-coverage', `${scope} receipts must exactly cover all planned verification commands`);
  for (const receipt of receipts || []) {
    invariant(receipt.status === 'passed' && receipt.exit_code === 0 && isSha256(receipt.receipt_sha256), 'factory-integration-verification', `${scope} receipt must pass with a recomputable digest`);
  }
}

function assertDraftOnly(data) {
  invariant(data.draft === true, 'factory-delivery-not-draft', 'delivery may create draft PRs only');
  invariant(Array.isArray(data.actions) && data.actions.length > 0 && new Set(data.actions).size === data.actions.length, 'factory-delivery-actions-shape', 'delivery actions must be a non-empty unique array');
  for (const action of data.actions) invariant(['open_draft_pr', 'update_draft_pr'].includes(action), 'factory-delivery-forbidden-action', `delivery cannot ${String(action)}`);
}

function assertEvidencePublication(data) {
  const publication = data.publication;
  invariant(publication && typeof publication === 'object' && !Array.isArray(publication), 'factory-evidence-publication-shape', 'evidence publication must be an object');
  if (publication.mode === 'ci_artifact') {
    invariant(!Object.hasOwn(data, 'evidence_sha'), 'factory-ci-artifact-false-sha', 'ci_artifact must not claim an evidence Git SHA');
    invariant(data.manifest_locator?.kind === 'ci_artifact', 'factory-ci-artifact-locator', 'ci_artifact requires a typed CI manifest locator');
    invariant(typeof publication.media_type === 'string' && publication.media_type.trim(), 'factory-ci-artifact-media-type', 'ci_artifact requires an artifact media type');
    return;
  }
  invariant(publication.mode === 'evidence_only_commit', 'factory-evidence-publication-mode', `unsupported evidence publication mode ${String(publication.mode)}`);
  invariant(validateEvidenceSha(data.evidence_sha), 'factory-evidence-sha', 'evidence_only_commit requires a full Git SHA');
  invariant(data.manifest_locator?.kind === 'repo_file', 'factory-evidence-repo-locator', 'evidence_only_commit requires a repo_file manifest locator');
}

function validatePassingCaseResults(caseResults) {
  invariant(Array.isArray(caseResults) && caseResults.length > 0, 'factory-acceptance-cases-missing', 'passing acceptance requires non-empty case_results');
  for (const [index, testCase] of caseResults.entries()) {
    const id = typeof testCase === 'object' && testCase !== null ? testCase.id || `case-${index + 1}` : `case-${index + 1}`;
    const outcome = typeof testCase === 'string' ? testCase : testCase?.outcome ?? testCase?.status;
    invariant(['passed', 'waived'].includes(outcome), 'factory-acceptance-case-not-passed', `${id}: outcome ${String(outcome)} blocks a passing acceptance gate`);
    if (outcome === 'waived') {
      invariant(
        testCase?.waiver?.reason && testCase?.waiver?.approver_ref && testCase?.waiver?.approved_at && !Number.isNaN(Date.parse(testCase.waiver.approved_at)),
        'factory-acceptance-waiver-incomplete',
        `${id}: waived outcome requires reason, approver_ref and approved_at`,
      );
      continue;
    }
    invariant(testCase?.user_visible_error !== true, 'factory-acceptance-user-visible-error', `${id}: a user-visible error cannot pass acceptance`);
    const oracleResults = testCase?.oracle_results ?? testCase?.oracles;
    invariant(Array.isArray(oracleResults) && oracleResults.length > 0, 'factory-acceptance-oracle-missing', `${id}: passing case requires at least one oracle result`);
    for (const [oracleIndex, oracle] of oracleResults.entries()) {
      const oracleId = typeof oracle === 'object' && oracle !== null ? oracle.id || `oracle-${oracleIndex + 1}` : `oracle-${oracleIndex + 1}`;
      const oracleOutcome = typeof oracle === 'string' ? oracle : oracle?.outcome ?? oracle?.status;
      invariant(oracleOutcome === 'passed', 'factory-acceptance-oracle-not-passed', `${id}.${oracleId}: oracle outcome ${String(oracleOutcome)} blocks acceptance`);
    }
  }
}

function derivePhase(state) {
  if (state.gates.release.status === 'valid') return 'release_ready';
  if (state.gates.evidence.status === 'valid') return 'evidence_recorded';
  if (['valid', 'waived'].includes(state.gates.acceptance.status)) return 'acceptance_complete';
  if (state.gates.candidate.status === 'valid') return 'candidate_frozen';
  if (state.gates.corpus_closeout.status === 'valid') return 'corpus_closed';
  if (state.gates.consolidated_review.status === 'valid') return 'consolidated_reviewed';
  if (state.gates.integration.status === 'valid') return 'integrated';
  if (Object.values(state.lots).some((lot) => !['pending', 'legacy_completed_unreviewed'].includes(lot.status))) return 'executing';
  if (state.gates.technical_plan.status === 'valid') return 'plan_approved';
  if (state.gates.specification.status === 'valid') return 'spec_approved';
  return PHASES[0];
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
