import { asArray } from './core.mjs';

const SUMMARY_KEYS = [
  'provider', 'repository', 'workflow_ref', 'provider_run_id',
  'receipt_sha256', 'grants',
];

export function capabilitySummary(verified) {
  if (!verified) return null;
  const receipt = verified.receipt;
  return {
    provider: receipt.provider,
    repository: receipt.repository,
    workflow_ref: receipt.workflow_ref,
    provider_run_id: String(receipt.provider_run_id),
    receipt_sha256: verified.receipt_sha256,
    grants: verified.grants.map((grant) => ({ ...grant })),
  };
}
export function readVerifiedCapabilityContext(value = process.env.FACTORY_VERIFIED_CAPABILITY_CONTEXT) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(',') !== [...SUMMARY_KEYS].sort().join(',')
    || !/^[0-9a-f]{64}$/.test(parsed.receipt_sha256 || '')
    || !Array.isArray(parsed.grants)) throw new Error('verified acceptance capability context is malformed');
  return parsed;
}

export function applyVerifiedCapabilityContext(results, plan, context) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('acceptance results must be a mapping');
  delete results.capability_receipt;
  for (const mutation of asArray(results.mutations)) delete mutation.authorization;
  if (!context) return results;
  results.capability_receipt = context;
  const dataGrants = new Map(context.grants
    .filter((grant) => grant.capability === 'data_mutation')
    .map((grant) => [grant.target, grant]));
  const plannedById = new Map(asArray(plan?.mutations).map((mutation) => [mutation.id, mutation]));
  for (const mutation of asArray(results.mutations)) {
    const planned = plannedById.get(mutation.id);
    const grant = planned && dataGrants.get(planned.target);
    if (grant) mutation.authorization = { ...grant, receipt_sha256: context.receipt_sha256 };
  }
  return results;
}
