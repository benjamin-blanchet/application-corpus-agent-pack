function safeId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value || '')) throw new Error(`${label} must be a safe identifier`);
  return value;
}

export function recordOracle(testInfo, { id, outcome = 'pass' } = {}) {
  const oracleId = safeId(id, 'oracle id');
  if (!['pass', 'fail', 'blocked', 'skipped'].includes(outcome)) throw new Error('oracle outcome is invalid');
  testInfo.annotations.push({ type: 'oracle', description: JSON.stringify({ id: oracleId, outcome }) });
}

// Call this as soon as an application error is observed. The reporter keeps
// the flag across retries and forces the case/campaign away from passed.
export function recordUserVisibleError(testInfo) {
  testInfo.annotations.push({ type: 'user_visible_error', description: JSON.stringify({ detected: true }) });
}

export function recordMutationResult(testInfo, {
  id,
  outcome = 'applied',
  cleanup,
  cleanupEvidence = [],
} = {}) {
  const mutationId = safeId(id, 'mutation id');
  if (!['applied', 'not_applied', 'failed'].includes(outcome)) throw new Error('mutation outcome is invalid');
  if (!['passed', 'failed', 'pending', 'not_required'].includes(cleanup)) throw new Error('mutation cleanup is invalid');
  const references = cleanupEvidence.map((reference) => safeId(reference, 'cleanup evidence attachment'));
  if (cleanup === 'passed' && references.length === 0) throw new Error('passed cleanup requires at least one attached cleanup evidence name');
  testInfo.annotations.push({
    type: 'mutation',
    description: JSON.stringify({ id: mutationId, outcome, cleanup, cleanup_evidence: references }),
  });
}
