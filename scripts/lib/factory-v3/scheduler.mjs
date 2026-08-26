import { claimsConflict, changedPathsInsideForbidden, changedPathsOutsideClaims, normalizedClaim } from './path-claims.mjs';
import { sensitiveFactoryPaths, validateRoleCapability } from './capabilities.mjs';
import {
  ENVELOPE_HASH_ALGORITHM,
  FILE_ARTIFACT_HASH_ALGORITHM,
  TREE_ARTIFACT_HASH_ALGORITHM,
  lotResultDigest,
} from './proof-contracts.mjs';

export function readyLots(plan, state) {
  const activeReservations = Object.values(state.reservations || {}).filter((reservation) => reservation.status === 'active');
  return (plan.lots || [])
    .filter((lot) => lot.kind !== 'review')
    .filter((lot) => isReady(lot, state, activeReservations))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function nextWave(plan, state) {
  const selected = [];
  const occupied = Object.values(state.reservations || {})
    .filter((reservation) => reservation.status === 'active')
    .flatMap((reservation) => reservation.claims || []);

  for (const lot of readyLots(plan, state)) {
    if (validateRoleCapability(lot).length) continue;
    if (claimsConflict(lot.write_claims, occupied)) continue;
    if (selected.some((other) => claimsConflict(lot.write_claims, other.write_claims))) continue;
    selected.push(lot);
  }
  return selected.map((lot) => ({ lot_id: lot.id, claims: lot.write_claims.map(normalizedClaim) }));
}

export function validateReservedWave(plan, state, requestedLots) {
  const findings = [];
  if (!Array.isArray(requestedLots)) return [finding('factory-wave-shape', 'wave reservations must be an array')];
  const byId = new Map((plan.lots || []).map((lot) => [lot.id, lot]));
  const requested = requestedLots.map((item) => typeof item === 'string' ? item : item?.lot_id);
  const unique = new Set();

  for (const id of requested) {
    if (unique.has(id)) findings.push(finding('factory-wave-duplicate-lot', `${id} appears twice in the wave`));
    unique.add(id);
    const lot = byId.get(id);
    if (!lot) {
      findings.push(finding('factory-wave-unknown-lot', `unknown lot ${id}`));
      continue;
    }
    const dependencyReady = (lot.dependencies || []).every((dependency) => {
      const dependencyState = state.lots?.[dependency];
      return dependencyState?.status === 'integrated' && dependencyState.review?.verdict === 'passed';
    });
    if (!dependencyReady) {
      findings.push(finding('factory-wave-lot-not-ready', `${id} is not dependency- and review-ready`));
      continue;
    }
    const preimplementationContract = state.lots?.[id]?.preimplementation_contract;
    if (!preimplementationContract || preimplementationContract.plan_sha256 !== state.digests?.plan_sha256) {
      findings.push(finding('factory-preimplementation-contract-required', `${id}: a current content-addressed convention contract is required before reservation`));
      continue;
    }
    if (!isReady(lot, state, Object.values(state.reservations || {}).filter((r) => r.status === 'active'))) {
      findings.push(finding('factory-wave-lot-not-ready', `${id} is not dependency- and review-ready`));
    }
  }

  for (let i = 0; i < requested.length; i += 1) {
    for (let j = i + 1; j < requested.length; j += 1) {
      const left = byId.get(requested[i]);
      const right = byId.get(requested[j]);
      if (left && right && claimsConflict(left.write_claims, right.write_claims)) {
        findings.push(finding('factory-wave-path-collision', `${left.id} and ${right.id} have overlapping path claims`));
      }
    }
  }
  return findings;
}

export function validateLotResult(lot, result, reservation, preimplementationContract = null) {
  const findings = [];
  if (!reservation || reservation.status !== 'active' || reservation.lot_id !== lot.id) {
    findings.push(finding('factory-lot-without-reservation', `${lot.id}: no active matching reservation`));
    return findings;
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [finding('factory-lot-result-shape', `${lot.id}: result must be an object`)];
  if (result.algorithm !== ENVELOPE_HASH_ALGORITHM) findings.push(finding('factory-proof-algorithm', `${lot.id}: unsupported result algorithm`));
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(result.base_revision || '')) findings.push(finding('factory-lot-base-revision', `${lot.id}: full base_revision is required`));
  if (!Array.isArray(result.changed_paths)) findings.push(finding('factory-lot-changed-paths-shape', `${lot.id}: changed_paths must be an array`));
  if (!Array.isArray(result.files)) findings.push(finding('factory-proof-files-shape', `${lot.id}: files must be an array`));
  if (!Array.isArray(result.outputs)) findings.push(finding('factory-lot-outputs-shape', `${lot.id}: outputs must be an array`));
  if (!Array.isArray(result.verification)) findings.push(finding('factory-lot-verification-shape', `${lot.id}: verification results must be an array`));
  if (!/^[0-9a-f]{64}$/.test(result.preimplementation_contract_sha256 || '')) findings.push(finding('factory-preimplementation-contract-result', `${lot.id}: result must bind a preimplementation convention contract`));
  if (preimplementationContract) {
    if (result.preimplementation_contract_sha256 !== preimplementationContract.contract_sha256) {
      findings.push(finding('factory-preimplementation-contract-result-mismatch', `${lot.id}: result binds a different preimplementation convention contract`));
    }
    const plannedRules = conventionRules(preimplementationContract.observed_conventions);
    const appliedRules = conventionRules(result.observed_conventions);
    if (JSON.stringify(plannedRules) !== JSON.stringify(appliedRules)) {
      findings.push(finding('factory-convention-application-mismatch', `${lot.id}: result does not attest application of the pre-observed convention rules`));
    }
  }
  if (!Array.isArray(result.blockers) || result.blockers.length !== 0) findings.push(finding('factory-lot-result-blockers', `${lot.id}: completed result blockers must be empty`));
  const changedPaths = Array.isArray(result.changed_paths) ? result.changed_paths : [];
  if (lot.model_role === 'economy') {
    const sensitive = sensitiveFactoryPaths(changedPaths);
    if (sensitive.length) findings.push(finding(
      'factory-economy-sensitive-path',
      `${lot.id}: economy result touches sensitive paths: ${sensitive.join(', ')}`,
      { paths: sensitive },
    ));
  }
  const outside = changedPathsOutsideClaims(changedPaths, reservation.claims || []);
  if (outside.length) findings.push(finding('factory-lot-outside-reservation', `${lot.id}: changed unreserved paths: ${outside.join(', ')}`, { paths: outside }));
  const forbidden = changedPathsInsideForbidden(changedPaths, lot.forbidden_paths || []);
  if (forbidden.length) findings.push(finding('factory-lot-forbidden-path', `${lot.id}: changed forbidden paths: ${forbidden.join(', ')}`, { paths: forbidden }));
  if (!result.diff_sha256 || !/^[0-9a-f]{64}$/.test(result.diff_sha256)) findings.push(finding('factory-lot-diff-digest', `${lot.id}: valid diff_sha256 is required`));
  else if (result.algorithm === ENVELOPE_HASH_ALGORITHM) {
    try {
      if (lotResultDigest(result) !== result.diff_sha256) findings.push(finding('factory-lot-diff-digest-mismatch', `${lot.id}: diff_sha256 is not recomputable from the result envelope`));
    } catch {
      findings.push(finding('factory-lot-diff-envelope', `${lot.id}: result inventory cannot be canonically hashed`));
    }
  }

  const files = Array.isArray(result.files) ? result.files : [];
  const fileByPath = new Map(files.map((entry) => [entry?.path, entry]));
  if (files.length !== changedPaths.length || changedPaths.some((changed) => !fileByPath.has(changed))) findings.push(finding('factory-proof-files-coverage', `${lot.id}: files must cover changed_paths exactly`));
  for (const file of files) {
    const present = file?.status === 'present' && /^[0-9a-f]{64}$/.test(file?.sha256 || '');
    const deleted = file?.status === 'deleted' && (file?.sha256 === undefined || file.sha256 === null);
    if (!present && !deleted) findings.push(finding('factory-proof-file-state', `${lot.id}: each changed file must be present with a digest or deleted without one`));
  }

  const expectedOutputs = lot.handoff?.outputs || [];
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  if (outputs.length !== expectedOutputs.length || expectedOutputs.some((expected) => {
    const actual = outputs.find((entry) => entry?.id === expected.id);
    const expectedAlgorithm = actual?.kind === 'file' ? FILE_ARTIFACT_HASH_ALGORITHM
      : actual?.kind === 'tree' ? TREE_ARTIFACT_HASH_ALGORITHM : null;
    return !actual
      || actual.path !== expected.path
      || !expectedAlgorithm
      || actual.algorithm !== expectedAlgorithm
      || !/^[0-9a-f]{64}$/.test(actual.sha256 || '');
  })) findings.push(finding('factory-lot-output-coverage', `${lot.id}: outputs must exactly cover handoff.outputs with digests`));
  for (const output of outputs) {
    if (!expectedOutputs.some((expected) => expected.id === output?.id && expected.path === output?.path)) findings.push(finding('factory-lot-output-coverage', `${lot.id}: undeclared output ${String(output?.id)}`));
  }

  const verifications = Array.isArray(result.verification) ? result.verification : [];
  const requiredCommands = lot.verification || [];
  if (verifications.length !== requiredCommands.length || requiredCommands.some((required) => {
    const actual = verifications.find((entry) => entry?.command === required);
    return !actual || actual.status !== 'passed' || actual.exit_code !== 0 || !/^[0-9a-f]{64}$/.test(actual.receipt_sha256 || '');
  }) || verifications.some((entry) => !requiredCommands.includes(entry?.command))) {
    findings.push(finding('factory-lot-verification-coverage', `${lot.id}: verification receipts must exactly cover planned commands`));
  }
  return findings;
}

function isReady(lot, state, activeReservations) {
  const current = state.lots?.[lot.id];
  if (current && !['pending', 'needs_correction', 'blocked', 'stale'].includes(current.status)) return false;
  const effectiveMax = current?.effective_max_attempts ?? (lot.max_attempts + (current?.attempt_budget_extensions || 0));
  if ((current?.attempts || 0) >= effectiveMax) return false;
  if ((state.blockers || []).some((blocker) => blocker.status !== 'resolved' && (!blocker.lot_id || blocker.lot_id === lot.id))) return false;
  for (const dependency of lot.dependencies || []) {
    const dep = state.lots?.[dependency];
    if (!dep || dep.status !== 'integrated' || dep.review?.verdict !== 'passed') return false;
  }
  if (activeReservations.some((reservation) => claimsConflict(lot.write_claims, reservation.claims || []))) return false;
  if (!current?.preimplementation_contract || current.preimplementation_contract.plan_sha256 !== state.digests?.plan_sha256) return false;
  return state.gates?.specification?.status === 'valid' && state.gates?.technical_plan?.status === 'valid';
}

function conventionRules(conventions) {
  return (Array.isArray(conventions) ? conventions : [])
    .map((convention) => ({ id: convention?.id, rule: convention?.rule }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function finding(code, message, details = {}) {
  return { severity: 'P0', code, message, details };
}
