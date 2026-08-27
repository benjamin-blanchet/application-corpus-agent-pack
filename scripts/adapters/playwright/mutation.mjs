function safeId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value || '')) throw new Error('mutation id must be a safe identifier');
  return value;
}

export function recordMutation(testInfo, {
  id,
  outcome = 'applied',
  cleanup,
} = {}) {
  const mutationId = safeId(id);
  if (!['applied', 'not_applied', 'failed'].includes(outcome)) throw new Error('mutation outcome is invalid');
  if (!['passed', 'failed', 'pending', 'not_required'].includes(cleanup)) throw new Error('mutation cleanup is invalid');
  testInfo.annotations.push({ type: 'mutation', description: `${mutationId}:${outcome}:${cleanup}` });
}
