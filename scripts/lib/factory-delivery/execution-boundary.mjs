import { pathToFileURL } from 'node:url';

import { asArray, requiredObject, sha256File } from './core.mjs';

export const INSTALLABLE_EXECUTION_BOUNDARY_CODE = 'acceptance-execution-boundary-unavailable';
export const EXTERNAL_EXECUTOR_API_VERSION = 1;

// The pack has no process, filesystem and egress sandbox. A signed receipt or
// a protected workflow environment cannot turn an ordinary child process into
// one, so every shipped candidate executor stays fail-closed until an external
// isolated broker is integrated.
export function unavailableExecutionBoundaryFinding(surface = 'candidate execution') {
  return {
    severity: 'P0',
    code: INSTALLABLE_EXECUTION_BOUNDARY_CODE,
    message: `${surface} is blocked: the installable pack has no attestable isolated process/filesystem/egress executor`,
  };
}

function exactKeys(value, expected) {
  return requiredObject(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function assertedControl(value, required, label) {
  const allowed = required ? ['enforced'] : ['enforced', 'not_required'];
  if (!allowed.includes(value)) throw new Error(`external executor did not attest ${label}`);
}

export function verifyExternalExecutorResponse(response, request) {
  if (!exactKeys(response, ['schema_version', 'provider', 'binding', 'boundary', 'attestation', 'observation', 'results', 'lifecycle', 'adapter'])) {
    throw new Error('external executor response has missing or unsupported fields');
  }
  if (response.schema_version !== EXTERNAL_EXECUTOR_API_VERSION) throw new Error('external executor response version is unsupported');
  if (!exactKeys(response.provider, ['id', 'version'])
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(response.provider.id || '')
    || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(response.provider.version || '')) {
    throw new Error('external executor provider identity is invalid');
  }
  if (!exactKeys(response.binding, ['run_id', 'subject_sha', 'plan_sha256', 'environment_sha256', 'ci_sha256'])
    || response.binding.run_id !== request.run_id
    || response.binding.subject_sha !== request.subject_sha
    || response.binding.plan_sha256 !== request.inputs.plan.sha256
    || response.binding.environment_sha256 !== request.inputs.environment.sha256
    || response.binding.ci_sha256 !== request.inputs.ci.sha256) {
    throw new Error('external executor response is not bound to the exact run and frozen inputs');
  }
  if (!exactKeys(response.boundary, ['process_isolation', 'filesystem_isolation', 'egress_enforcement', 'secret_broker', 'mutation_broker'])) {
    throw new Error('external executor boundary attestation has missing or unsupported fields');
  }
  assertedControl(response.boundary.process_isolation, true, 'process isolation');
  assertedControl(response.boundary.filesystem_isolation, true, 'filesystem isolation');
  assertedControl(response.boundary.egress_enforcement, true, 'egress enforcement');
  assertedControl(response.boundary.secret_broker, request.requirements.secrets, 'the secret broker');
  assertedControl(response.boundary.mutation_broker, request.requirements.mutations, 'the mutation broker');
  if (!exactKeys(response.attestation, ['kind', 'reference', 'digest_sha256'])
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(response.attestation.kind || '')
    || typeof response.attestation.reference !== 'string'
    || response.attestation.reference.length < 3
    || response.attestation.reference.length > 512
    || !/^sha256:[0-9a-f]{64}$/.test(response.attestation.digest_sha256 || '')) {
    throw new Error('external executor host attestation is invalid');
  }
  if (!requiredObject(response.observation) || !requiredObject(response.results)
    || !Array.isArray(response.lifecycle) || (response.adapter !== null && !requiredObject(response.adapter))) {
    throw new Error('external executor outputs have an invalid shape');
  }
  return response;
}

export async function runExternalExecutor({ providerFile, request }) {
  const providerUrl = pathToFileURL(providerFile);
  providerUrl.searchParams.set('sha256', sha256File(providerFile));
  const provider = await import(providerUrl.href);
  if (provider.apiVersion !== EXTERNAL_EXECUTOR_API_VERSION || typeof provider.executeAcceptance !== 'function') {
    throw new Error(`external executor provider must export apiVersion=${EXTERNAL_EXECUTOR_API_VERSION} and executeAcceptance(request)`);
  }
  const response = await provider.executeAcceptance(Object.freeze({
    ...request,
    requirements: Object.freeze({
      ...request.requirements,
      secret_refs: Object.freeze([...asArray(request.requirements.secret_refs)]),
      egress_allowlist: Object.freeze([...asArray(request.requirements.egress_allowlist)]),
    }),
  }));
  return verifyExternalExecutorResponse(response, request);
}
