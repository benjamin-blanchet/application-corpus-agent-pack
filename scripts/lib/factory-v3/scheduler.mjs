import { claimsConflict, changedPathsInsideForbidden, changedPathsOutsideClaims, normalizedClaim } from './path-claims.mjs';
import { validateRoleCapability } from './capabilities.mjs';

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

export function validateLotResult(lot, result, reservation) {
  const findings = [];
  if (!reservation || reservation.status !== 'active' || reservation.lot_id !== lot.id) {
    findings.push(finding('factory-lot-without-reservation', `${lot.id}: no active matching reservation`));
    return findings;
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [finding('factory-lot-result-shape', `${lot.id}: result must be an object`)];
  if (!Array.isArray(result.changed_paths)) findings.push(finding('factory-lot-changed-paths-shape', `${lot.id}: changed_paths must be an array`));
  if (!Array.isArray(result.verification)) findings.push(finding('factory-lot-verification-shape', `${lot.id}: verification results must be an array`));
  const changedPaths = Array.isArray(result.changed_paths) ? result.changed_paths : [];
  const outside = changedPathsOutsideClaims(changedPaths, reservation.claims || []);
  if (outside.length) findings.push(finding('factory-lot-outside-reservation', `${lot.id}: changed unreserved paths: ${outside.join(', ')}`, { paths: outside }));
  const forbidden = changedPathsInsideForbidden(changedPaths, lot.forbidden_paths || []);
  if (forbidden.length) findings.push(finding('factory-lot-forbidden-path', `${lot.id}: changed forbidden paths: ${forbidden.join(', ')}`, { paths: forbidden }));
  if (!result.diff_sha256 || !/^[0-9a-f]{64}$/.test(result.diff_sha256)) findings.push(finding('factory-lot-diff-digest', `${lot.id}: valid diff_sha256 is required`));
  const verifications = new Map((Array.isArray(result.verification) ? result.verification : []).map((entry) => [entry?.id, entry]));
  for (const required of lot.verification || []) {
    if (verifications.get(required)?.status !== 'passed') findings.push(finding('factory-lot-verification-not-passed', `${lot.id}: ${required} did not pass`));
  }
  return findings;
}

function isReady(lot, state, activeReservations) {
  const current = state.lots?.[lot.id];
  if (current && !['pending', 'needs_correction', 'blocked', 'stale'].includes(current.status)) return false;
  if ((current?.attempts || 0) >= lot.max_attempts) return false;
  if ((state.blockers || []).some((blocker) => blocker.status !== 'resolved' && (!blocker.lot_id || blocker.lot_id === lot.id))) return false;
  for (const dependency of lot.dependencies || []) {
    const dep = state.lots?.[dependency];
    if (!dep || dep.status !== 'integrated' || dep.review?.verdict !== 'passed') return false;
  }
  if (activeReservations.some((reservation) => claimsConflict(lot.write_claims, reservation.claims || []))) return false;
  return state.gates?.specification?.status === 'valid' && state.gates?.technical_plan?.status === 'valid';
}

function finding(code, message, details = {}) {
  return { severity: 'P0', code, message, details };
}
