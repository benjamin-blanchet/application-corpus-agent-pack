import fs from 'node:fs';
import path from 'node:path';

import {
  SHA_PATTERN,
  OUTCOMES,
  asArray,
  canonicalizeCaseOutcome,
  duplicateIds,
  ensureRequired,
  finding,
  requiredObject,
  resolveContainedRegularFile,
  sha256File,
  sha256Object,
} from './core.mjs';
import { scanEvidenceFile } from './minimize.mjs';

const PROFILE_KINDS = new Set(['local', 'preview', 'shared_nonprod']);
const AUTH_MODES = new Set(['service_identity', 'ephemeral_storage_state', 'interactive']);
const DATA_ISOLATIONS = new Set(['per_run', 'namespaced', 'shared']);
const ORACLE_TYPES = new Set(['ui', 'api', 'db_read', 'log', 'file', 'human_attestation']);
const CLEANUP_OUTCOMES = new Set(['passed', 'failed', 'pending', 'not_required']);
const MUTATION_OUTCOMES = new Set(['applied', 'not_applied', 'failed']);
const FORBIDDEN_PR_ACTIONS = ['push', 'approve', 'mark_ready', 'merge', 'force_push'];
const REQUIRED_ENVIRONMENT_OPERATIONS = {
  build: 'build',
  start: 'start',
  health: 'none',
  stop: 'stop',
  reset: 'reset',
  revision_probe: 'none',
};
const SIDE_EFFECTS = new Set(['none', 'build', 'start', 'stop', 'seed', 'reset', 'cleanup']);
const PLACEHOLDER_PATTERN = /<[^>]+>|^(?:unknown|runtime-provided)$/i;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9._\/-]{0,127}$/;
const ENV_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;
const EVIDENCE_MEDIA_TYPES = {
  screenshot: new Set(['image/png', 'image/jpeg', 'image/webp']),
  trace: new Set(['application/zip']),
  video: new Set(['video/webm', 'video/mp4']),
  log: new Set(['text/plain', 'application/json']),
  report: new Set(['text/html', 'application/json', 'application/xml', 'text/plain']),
  file: null,
};

function enumValue(value, allowed, code, scope, findings, file) {
  if (!allowed.has(value)) findings.push(finding(code, `${scope} has unsupported value ${JSON.stringify(value)}`, file));
}

function operationIds(ci) {
  return new Set(Object.keys(requiredObject(ci?.operations) ? ci.operations : {}));
}

function validReferencePath(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER_PATTERN.test(value);
}

function validateNotApplicable(value, scope, findings, file) {
  ensureRequired(value, ['not_applicable', 'reason'], scope, findings, file);
  if (value?.not_applicable !== true || String(value?.reason || '').trim().length < 8) {
    findings.push(finding('environment-not-applicable-invalid', `${scope} needs not_applicable: true and an explicit reason`, file));
    return false;
  }
  return true;
}

function validateWaiver(waiver, scope, findings, file) {
  ensureRequired(waiver, ['reason', 'approver_ref', 'approved_at'], scope, findings, file);
  if (waiver?.reason && String(waiver.reason).trim().length < 8) findings.push(finding('waiver-reason-invalid', `${scope}.reason must be explicit`, file));
  if (waiver?.approver_ref && !SAFE_REFERENCE_PATTERN.test(waiver.approver_ref)) findings.push(finding('waiver-approver-invalid', `${scope}.approver_ref must be a logical identity reference`, file));
  if (waiver?.approved_at && Number.isNaN(Date.parse(waiver.approved_at))) findings.push(finding('waiver-date-invalid', `${scope}.approved_at must be an ISO date`, file));
}

export function hasValidWaiver(waiver) {
  const local = [];
  validateWaiver(waiver, 'waiver', local, null);
  return local.length === 0;
}

export function validateFactoryCi(ci, {
  file = 'factory-ci.yaml',
  root = process.cwd(),
  allowPlaceholders = false,
  checkPipelineFile = false,
} = {}) {
  const findings = [];
  ensureRequired(ci, ['version', 'subject_revision', 'pipeline', 'operations', 'checks', 'artifacts', 'flake_policy', 'security'], 'factory_ci', findings, file);
  if (ci?.version !== 1) findings.push(finding('factory-ci-version-unsupported', 'factory_ci.version must be 1', file));
  if (ci?.subject_revision !== 'pull_request_head') {
    findings.push(finding('factory-ci-subject-ambiguous', 'subject_revision must be pull_request_head', file));
  }

  const operations = requiredObject(ci?.operations) ? ci.operations : {};
  if (Object.keys(operations).length === 0) findings.push(finding('factory-ci-operation-missing', 'factory_ci.operations must not be empty', file));
  for (const [id, operation] of Object.entries(operations)) {
    ensureRequired(operation, ['argv', 'cwd', 'timeout_seconds', 'privilege', 'side_effect'], `operations.${id}`, findings, file);
    if (!Array.isArray(operation?.argv) || operation.argv.length === 0 || operation.argv.some((arg) => typeof arg !== 'string' || !arg)) {
      findings.push(finding('factory-ci-operation-invalid', `operations.${id}.argv must be a non-empty string array`, file));
    }
    if (!allowPlaceholders && asArray(operation?.argv).some(isPlaceholder)) findings.push(finding('factory-ci-placeholder', `operations.${id}.argv contains an unresolved placeholder`, file));
    if (!validReferencePath(operation?.cwd || '.')) findings.push(finding('factory-ci-operation-invalid', `operations.${id}.cwd must remain repository-relative`, file));
    if (!Number.isInteger(operation?.timeout_seconds) || operation.timeout_seconds < 1) {
      findings.push(finding('factory-ci-operation-invalid', `operations.${id}.timeout_seconds must be a positive integer`, file));
    }
    enumValue(operation?.privilege, new Set(['unprivileged', 'protected_environment']), 'factory-ci-operation-invalid', `operations.${id}.privilege`, findings, file);
    enumValue(operation?.side_effect, SIDE_EFFECTS, 'factory-ci-operation-invalid', `operations.${id}.side_effect`, findings, file);
  }

  if (!Array.isArray(ci?.checks) || ci.checks.length === 0) findings.push(finding('factory-ci-check-missing', 'factory_ci.checks must not be empty', file));
  for (const duplicate of duplicateIds(ci?.checks)) findings.push(finding('factory-ci-check-duplicate', `duplicate check id ${duplicate}`, file));
  const providerNames = new Set();
  for (const check of asArray(ci?.checks)) {
    ensureRequired(check, ['id', 'provider_name', 'operation', 'required', 'secret_access'], `checks.${check?.id || '?'}`, findings, file);
    if (!Object.hasOwn(operations, check?.operation)) {
      findings.push(finding('factory-ci-operation-unknown', `check ${check?.id} references unknown operation ${check?.operation}`, file));
    }
    if (typeof check?.required !== 'boolean') findings.push(finding('factory-ci-check-invalid', `checks.${check?.id}.required must be boolean`, file));
    if (typeof check?.provider_name !== 'string' || !check.provider_name.trim() || isPlaceholder(check.provider_name)) findings.push(finding('factory-ci-check-invalid', `checks.${check?.id}.provider_name must be a concrete check-run name`, file));
    else if (providerNames.has(check.provider_name)) findings.push(finding('factory-ci-provider-name-duplicate', `provider check name ${check.provider_name} is ambiguous`, file));
    else providerNames.add(check.provider_name);
    enumValue(check?.secret_access, new Set(['none', 'protected_environment']), 'factory-ci-secret-policy-invalid', `checks.${check?.id}.secret_access`, findings, file);
    if (check?.secret_access === 'protected_environment' && operations[check.operation]?.privilege !== 'protected_environment') {
      findings.push(finding('factory-ci-secret-policy-invalid', `check ${check.id} exposes protected secrets to a non-protected operation`, file));
    }
  }

  const pipeline = ci?.pipeline || {};
  ensureRequired(pipeline, ['active_config_ref', 'candidate_build_operation', 'preview_mode', 'preview_operation', 'build_identity_operation'], 'factory_ci.pipeline', findings, file);
  if (!allowPlaceholders && Object.values(pipeline).some(isPlaceholder)) findings.push(finding('factory-ci-placeholder', 'factory_ci.pipeline contains an unresolved placeholder', file));
  if (!validReferencePath(pipeline.active_config_ref)) findings.push(finding('factory-ci-pipeline-invalid', 'pipeline.active_config_ref must be repository-relative', file));
  else if (checkPipelineFile && !allowPlaceholders) {
    try {
      const activeConfig = resolveContainedRegularFile(root, path.join(root, pipeline.active_config_ref));
      const workflowText = fs.readFileSync(activeConfig.absolute, 'utf8');
      if (/^\s*pull_request_target\s*:/m.test(workflowText)) findings.push(finding('factory-ci-pull-request-target-forbidden', 'active CI config uses pull_request_target', file));
      for (const match of workflowText.matchAll(/^\s*uses:\s*["']?([^\s#"']+)/gm)) {
        const reference = match[1];
        if (reference.startsWith('./')) continue;
        const pinnedAction = /@[0-9a-f]{40}$/i.test(reference);
        const pinnedContainer = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/i.test(reference);
        if (!pinnedAction && !pinnedContainer) findings.push(finding('factory-ci-action-not-pinned', `active CI action is not pinned to an immutable digest: ${reference}`, file));
      }
    } catch (error) {
      findings.push(finding('factory-ci-pipeline-missing', `active pipeline config is not a contained regular file: ${error.message}`, file));
    }
  }
  for (const key of ['candidate_build_operation', 'preview_operation', 'build_identity_operation']) {
    if (pipeline[key] && !isPlaceholder(pipeline[key]) && !Object.hasOwn(operations, pipeline[key])) findings.push(finding('factory-ci-operation-unknown', `pipeline.${key} references unknown operation ${pipeline[key]}`, file));
  }
  if (!['local', 'preview', 'shared_nonprod'].includes(pipeline.preview_mode) && !(allowPlaceholders && isPlaceholder(pipeline.preview_mode))) findings.push(finding('factory-ci-pipeline-invalid', 'pipeline.preview_mode must identify the executed candidate environment', file));

  const artifacts = ci?.artifacts || {};
  ensureRequired(artifacts, ['retention_days', 'required', 'conditional'], 'factory_ci.artifacts', findings, file);
  if (!Number.isInteger(artifacts.retention_days) || artifacts.retention_days < 1) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.retention_days must be a positive integer', file));
  const requiredArtifacts = new Set(asArray(artifacts.required));
  if (!Array.isArray(artifacts.required) || artifacts.required.some((item) => typeof item !== 'string' || !item)) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.required must be a string array', file));
  if (!Array.isArray(artifacts.conditional) || artifacts.conditional.some((item) => typeof item !== 'string' || !item)) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.conditional must be a string array', file));
  if (requiredArtifacts.size !== asArray(artifacts.required).length) findings.push(finding('factory-ci-artifacts-invalid', 'artifacts.required contains duplicates', file));
  for (const id of ['evidence-manifest', 'results-json', 'junit', 'html-report']) if (!requiredArtifacts.has(id)) findings.push(finding('factory-ci-artifact-missing', `${id} must be a required CI artifact`, file));

  const security = ci?.security || {};
  const requiredSecurity = {
    default_permissions: 'read',
    protected_job_requires_environment_approval: true,
    no_pull_request_target_checkout: true,
    actions_pinned_to_full_sha: true,
  };
  for (const [key, expected] of Object.entries(requiredSecurity)) {
    if (security[key] !== expected) findings.push(finding('factory-ci-security-weakened', `security.${key} must be ${JSON.stringify(expected)}`, file));
  }
  if (ci?.flake_policy?.retry_pass_outcome !== 'failed' || ci?.flake_policy?.retry_reason !== 'flaky_retry' || ci?.flake_policy?.flaky_blocks_readiness !== true) {
    findings.push(finding('factory-ci-flaky-policy-unsafe', 'retry-pass must be failed with reason flaky_retry and must block readiness', file));
  }
  return findings;
}

export function validateEnvironment(environment, ci, { file = 'environment-contract.yaml', allowPlaceholders = false } = {}) {
  const findings = [];
  ensureRequired(environment, ['version', 'profiles'], 'environment', findings, file);
  if (environment?.version !== 1) findings.push(finding('environment-version-unsupported', 'environment.version must be 1', file));
  if (!Array.isArray(environment?.profiles) || environment.profiles.length === 0) {
    findings.push(finding('environment-profile-missing', 'at least one environment profile is required', file));
    return findings;
  }
  const operations = operationIds(ci);
  for (const duplicate of duplicateIds(environment.profiles)) findings.push(finding('environment-profile-duplicate', `duplicate environment profile ${duplicate}`, file));
  for (const profile of environment.profiles) {
    const scope = `profiles.${profile?.id || '?'}`;
    const surfaceCanBeNotApplicable = profile?.runtime_type === 'cli' || profile?.runtime_type === 'library';
    ensureRequired(profile, ['id', 'kind', 'runtime_type', 'automated', 'operations', 'endpoint', 'revision', 'auth', 'data', 'mutation_policy', 'network'], scope, findings, file);
    enumValue(profile?.kind, PROFILE_KINDS, 'environment-profile-invalid', `${scope}.kind`, findings, file);
    enumValue(profile?.runtime_type, new Set(['server', 'cli', 'library', 'remote_service']), 'environment-profile-invalid', `${scope}.runtime_type`, findings, file);
    const endpointNotApplicable = profile?.endpoint?.not_applicable === true;
    if (endpointNotApplicable) {
      validateNotApplicable(profile.endpoint, `${scope}.endpoint`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-endpoint-required', `${profile.id} must declare a concrete endpoint`, file));
    } else {
      ensureRequired(profile?.endpoint, ['base_url_from', 'tls'], `${scope}.endpoint`, findings, file);
      if (!ENV_REFERENCE_PATTERN.test(profile?.endpoint?.base_url_from || '') && !(allowPlaceholders && isPlaceholder(profile?.endpoint?.base_url_from))) findings.push(finding('environment-endpoint-invalid', `${scope}.endpoint.base_url_from must be an environment-variable reference`, file));
      if (!['strict', 'local_self_signed'].includes(profile?.endpoint?.tls)) findings.push(finding('environment-tls-policy-invalid', `${scope}.endpoint.tls is invalid`, file));
      if (profile?.endpoint?.tls === 'local_self_signed' && profile?.kind !== 'local') {
        findings.push(finding('environment-tls-policy-invalid', 'local_self_signed TLS is allowed only for a local profile', file));
      }
    }
    if (profile?.revision?.must_equal_subject_sha !== true || !['probe', 'image_label', 'build_manifest'].includes(profile?.revision?.source)) {
      findings.push(finding('environment-revision-unbound', `${profile.id} must expose and compare its deployed revision`, file));
    }
    ensureRequired(profile?.operations, Object.keys(REQUIRED_ENVIRONMENT_OPERATIONS), `${scope}.operations`, findings, file);
    for (const [role, expectedSideEffect] of Object.entries(REQUIRED_ENVIRONMENT_OPERATIONS)) {
      const operation = profile?.operations?.[role];
      if (!operation) continue;
      if (requiredObject(operation)) {
        validateNotApplicable(operation, `${scope}.operations.${role}`, findings, file);
        if (profile.runtime_type === 'server' && ['start', 'health', 'stop', 'revision_probe'].includes(role)) findings.push(finding('environment-operation-required', `${profile.id}.${role} cannot be not_applicable for a server runtime`, file));
      } else if (typeof operation !== 'string') findings.push(finding('environment-operation-invalid', `${profile.id}.${role} must be an operation id or structured not_applicable declaration`, file));
      else if (!operations.has(operation)) findings.push(finding('environment-operation-unknown', `${profile.id}.${role} references unknown operation ${operation}`, file));
      else if (ci.operations[operation]?.side_effect !== expectedSideEffect) findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.${role} must reference a ${expectedSideEffect} operation`, file));
    }
    for (const [role, operation] of Object.entries(profile?.operations || {})) {
      if (typeof operation === 'string' && !operations.has(operation)) findings.push(finding('environment-operation-unknown', `${profile.id}.${role} references unknown operation ${operation}`, file));
    }
    for (const dependency of asArray(profile?.dependencies)) {
      ensureRequired(dependency, ['id', 'kind', 'readiness_operation', 'required'], `${scope}.dependencies.${dependency?.id || '?'}`, findings, file);
      if (dependency?.readiness_operation && !operations.has(dependency.readiness_operation)) {
        findings.push(finding('environment-operation-unknown', `dependency ${dependency.id} references unknown operation ${dependency.readiness_operation}`, file));
      } else if (dependency?.readiness_operation && ci?.operations?.[dependency.readiness_operation]?.side_effect !== 'none') {
        findings.push(finding('environment-probe-side-effect-invalid', `dependency ${dependency.id} readiness probe must be side-effect-free`, file));
      }
      if (dependency?.version_operation && !operations.has(dependency.version_operation)) {
        findings.push(finding('environment-operation-unknown', `dependency ${dependency.id} references unknown version operation ${dependency.version_operation}`, file));
      } else if (dependency?.version_operation && ci?.operations?.[dependency.version_operation]?.side_effect !== 'none') {
        findings.push(finding('environment-probe-side-effect-invalid', `dependency ${dependency.id} version probe must be side-effect-free`, file));
      }
    }
    const authNotApplicable = profile?.auth?.not_applicable === true;
    if (authNotApplicable) {
      validateNotApplicable(profile.auth, `${scope}.auth`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-auth-required', `${profile.id} must declare a concrete authentication strategy`, file));
    } else {
      enumValue(profile?.auth?.mode, AUTH_MODES, 'environment-auth-invalid', `${scope}.auth.mode`, findings, file);
      if (profile?.automated === true && (profile?.auth?.mode === 'interactive' || profile?.auth?.automated_compatible !== true)) {
        findings.push(finding('acceptance-not-unattended', `${profile.id} is automated but its authentication requires interaction`, file));
      }
      ensureRequired(profile?.auth, ['mode', 'actor_ref', 'automated_compatible', 'secret_refs'], `${scope}.auth`, findings, file);
      if (profile?.auth?.actor_ref && !SAFE_REFERENCE_PATTERN.test(profile.auth.actor_ref) && !(allowPlaceholders && isPlaceholder(profile.auth.actor_ref))) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.actor_ref must be a logical reference, never a credential value`, file));
      if (!Array.isArray(profile?.auth?.secret_refs)) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.secret_refs must be an array of logical references`, file));
      for (const ref of asArray(profile?.auth?.secret_refs)) if (!SAFE_REFERENCE_PATTERN.test(ref) && !(allowPlaceholders && isPlaceholder(ref))) findings.push(finding('environment-auth-reference-invalid', `${scope}.auth.secret_refs contains an invalid reference`, file));
    }
    const data = profile?.data || {};
    const dataNotApplicable = data?.not_applicable === true;
    if (dataNotApplicable) {
      validateNotApplicable(data, `${scope}.data`, findings, file);
      if (!surfaceCanBeNotApplicable) findings.push(finding('environment-data-required', `${profile.id} must declare a concrete data strategy`, file));
    } else {
      enumValue(data?.isolation, DATA_ISOLATIONS, 'environment-data-invalid', `${scope}.data.isolation`, findings, file);
      ensureRequired(data, ['isolation', 'dataset_id_from', 'dataset_version_from', 'cleanup_required'], `${scope}.data`, findings, file);
      for (const key of ['seed_operation', 'cleanup_operation']) if (!Object.hasOwn(data, key)) findings.push(finding('delivery-required-field-missing', `${scope}.data.${key} must be declared, using null when not applicable`, file));
      for (const key of ['dataset_id_from', 'dataset_version_from']) if (!ENV_REFERENCE_PATTERN.test(data[key] || '') && !(allowPlaceholders && isPlaceholder(data[key]))) findings.push(finding('environment-data-invalid', `${scope}.data.${key} must be an environment-variable reference`, file));
      if (typeof data.cleanup_required !== 'boolean') findings.push(finding('environment-data-invalid', `${scope}.data.cleanup_required must be boolean`, file));
      if (data.cleanup_required === true && !data.cleanup_operation) {
        findings.push(finding('environment-cleanup-undefined', `${profile.id} requires cleanup but declares no cleanup operation`, file));
      }
      for (const key of ['seed_operation', 'cleanup_operation']) {
        if (data[key] && !operations.has(data[key])) findings.push(finding('environment-operation-unknown', `${profile.id}.${key} references unknown operation ${data[key]}`, file));
      }
      if (data.seed_operation && ci?.operations?.[data.seed_operation]?.side_effect !== 'seed') findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.seed_operation must declare seed side effect`, file));
      if (data.cleanup_operation && !['cleanup', 'reset'].includes(ci?.operations?.[data.cleanup_operation]?.side_effect)) findings.push(finding('environment-operation-side-effect-invalid', `${profile.id}.cleanup_operation must declare cleanup or reset side effect`, file));
      if (data.isolation === 'shared' && profile?.mutation_policy?.allowed?.length && profile?.mutation_policy?.requires_human_approval !== true) {
        findings.push(finding('environment-shared-mutation-unguarded', `${profile.id} permits shared mutations without human approval`, file));
      }
    }
    ensureRequired(profile?.mutation_policy, ['allowed', 'requires_human_approval'], `${scope}.mutation_policy`, findings, file);
    if (!Array.isArray(profile?.mutation_policy?.allowed) || typeof profile?.mutation_policy?.requires_human_approval !== 'boolean') findings.push(finding('environment-mutation-policy-invalid', `${scope}.mutation_policy must declare an allowed array and boolean approval rule`, file));
    ensureRequired(profile?.network, ['policy'], `${scope}.network`, findings, file);
    if (!Object.hasOwn(profile?.network || {}, 'destinations_ref')) findings.push(finding('delivery-required-field-missing', `${scope}.network.destinations_ref must be declared`, file));
    if (!['deny_by_default', 'allowlist'].includes(profile?.network?.policy)) findings.push(finding('environment-network-policy-invalid', `${scope}.network.policy is invalid`, file));
    if (profile?.network?.policy === 'allowlist' && !SAFE_REFERENCE_PATTERN.test(profile?.network?.destinations_ref || '')) findings.push(finding('environment-network-policy-invalid', `${scope}.network.destinations_ref must be a logical reference`, file));
  }
  return findings;
}

export function validateAcceptancePlan(plan, {
  file = 'acceptance-plan.yaml',
  root = process.cwd(),
  checkFiles = false,
  specificationCriteria = null,
  allowPlaceholders = false,
} = {}) {
  const findings = [];
  ensureRequired(plan, ['version', 'spec_ref', 'environment_profile', 'subject', 'campaign', 'criteria', 'cases', 'mutations'], 'acceptance_plan', findings, file);
  if (plan?.version !== 1) findings.push(finding('acceptance-version-unsupported', 'acceptance_plan.version must be 1', file));
  if (!allowPlaceholders && isPlaceholder(plan?.spec_ref)) findings.push(finding('acceptance-placeholder', 'spec_ref contains an unresolved placeholder', file));
  if (plan?.subject?.freeze_at_execution !== true) findings.push(finding('acceptance-subject-not-frozen', 'subject.freeze_at_execution must be true', file));
  if (!validReferencePath(plan?.spec_ref) && !(allowPlaceholders && isPlaceholder(plan?.spec_ref))) findings.push(finding('acceptance-spec-reference-invalid', 'spec_ref must be repository-relative', file));
  ensureRequired(plan?.campaign, ['adapter', 'unattended_required', 'continue_after_failure', 'flaky_blocks', 'results_contract_version'], 'acceptance_plan.campaign', findings, file);
  if (!['playwright', 'command', 'manual'].includes(plan?.campaign?.adapter)) findings.push(finding('acceptance-adapter-invalid', 'campaign.adapter is invalid', file));
  if (plan?.campaign?.results_contract_version !== 1) findings.push(finding('acceptance-results-contract-invalid', 'campaign.results_contract_version must be 1', file));
  if (plan?.campaign?.flaky_blocks !== true) findings.push(finding('acceptance-flaky-policy-unsafe', 'campaign.flaky_blocks must be true', file));
  if (plan?.campaign?.unattended_required === true && plan?.campaign?.adapter === 'manual') {
    findings.push(finding('acceptance-not-unattended', 'a manual adapter cannot satisfy unattended_required', file));
  }

  for (const duplicate of duplicateIds(plan?.criteria)) findings.push(finding('acceptance-criterion-duplicate', `duplicate criterion ${duplicate}`, file));
  for (const duplicate of duplicateIds(plan?.cases)) findings.push(finding('acceptance-case-duplicate', `duplicate case ${duplicate}`, file));
  for (const duplicate of duplicateIds(plan?.mutations)) findings.push(finding('acceptance-mutation-duplicate', `duplicate mutation ${duplicate}`, file));
  const criteria = new Map(asArray(plan?.criteria).map((item) => [item.id, item]));
  const cases = new Map(asArray(plan?.cases).map((item) => [item.id, item]));
  const mutations = new Map(asArray(plan?.mutations).map((item) => [item.id, item]));

  for (const criterion of criteria.values()) {
    ensureRequired(criterion, ['id'], `criteria.${criterion?.id || '?'}`, findings, file);
    if ((!Array.isArray(criterion?.cases) || criterion.cases.length === 0) && !criterion?.waiver) findings.push(finding('acceptance-criterion-uncovered', `${criterion.id} has neither cases nor a waiver`, file));
    if (asArray(criterion?.cases).length > 0 && criterion?.waiver) findings.push(finding('acceptance-criterion-ambiguous', `${criterion.id} cannot have both executable cases and a waiver`, file));
    if (criterion?.waiver) validateWaiver(criterion.waiver, `criteria.${criterion.id}.waiver`, findings, file);
    for (const caseId of asArray(criterion?.cases)) {
      if (!cases.has(caseId)) findings.push(finding('acceptance-case-unknown', `${criterion.id} references unknown case ${caseId}`, file));
      else if (!asArray(cases.get(caseId)?.criteria).includes(criterion.id)) findings.push(finding('acceptance-traceability-asymmetric', `${criterion.id} references ${caseId}, but that case does not reference the criterion`, file));
    }
  }
  if (Array.isArray(specificationCriteria)) {
    for (const id of specificationCriteria) if (!criteria.has(id)) findings.push(finding('acceptance-criterion-uncovered', `${id} from the specification is absent from the acceptance plan`, file));
  }

  for (const testCase of cases.values()) {
    const scope = `cases.${testCase?.id || '?'}`;
    ensureRequired(testCase, ['id', 'criteria', 'test_ref', 'preconditions', 'oracle', 'evidence', 'mutations'], scope, findings, file);
    if (!Array.isArray(testCase?.criteria) || testCase.criteria.length === 0) findings.push(finding('acceptance-case-unmapped', `${testCase.id} maps to no criterion`, file));
    for (const criterionId of asArray(testCase?.criteria)) if (!criteria.has(criterionId)) findings.push(finding('acceptance-criterion-unknown', `${testCase.id} references unknown criterion ${criterionId}`, file));
    for (const [criterionId, criterion] of criteria.entries()) {
      if (asArray(testCase?.criteria).includes(criterionId) && !asArray(criterion?.cases).includes(testCase.id)) {
        findings.push(finding('acceptance-traceability-asymmetric', `${testCase.id} and ${criterionId} do not reference each other`, file));
      }
    }
    if (!validReferencePath(testCase?.test_ref?.path) || !testCase?.test_ref?.title) {
      findings.push(finding('acceptance-test-reference-invalid', `${testCase.id} needs a safe path and exact test title`, file));
    } else if (checkFiles && !isPlaceholder(testCase.test_ref.path)) {
      const testFile = path.join(root, testCase.test_ref.path);
      if (!fs.existsSync(testFile)) findings.push(finding('acceptance-test-missing', `${testCase.id} test file does not exist: ${testCase.test_ref.path}`, file));
      else if (!fs.readFileSync(testFile, 'utf8').includes(testCase.test_ref.title)) findings.push(finding('acceptance-test-title-missing', `${testCase.id} exact test title is absent from ${testCase.test_ref.path}`, file));
    }
    if (!allowPlaceholders && (isPlaceholder(testCase?.test_ref?.path) || isPlaceholder(testCase?.test_ref?.title))) findings.push(finding('acceptance-placeholder', `${testCase.id} contains an unresolved test reference`, file));
    if (!Array.isArray(testCase?.oracle) || testCase.oracle.length === 0) findings.push(finding('acceptance-oracle-missing', `${testCase.id} has no executable oracle`, file));
    for (const oracle of asArray(testCase?.oracle)) {
      ensureRequired(oracle, ['id', 'type', 'assertion'], `${scope}.oracle.${oracle?.id || '?'}`, findings, file);
      enumValue(oracle?.type, ORACLE_TYPES, 'acceptance-oracle-invalid', `${scope}.oracle.${oracle?.id}.type`, findings, file);
      if (plan?.campaign?.unattended_required === true && oracle?.type === 'human_attestation') findings.push(finding('acceptance-not-unattended', `${testCase.id} requires human attestation`, file));
    }
    for (const duplicate of duplicateIds(testCase?.oracle)) findings.push(finding('acceptance-oracle-duplicate', `${testCase.id} has duplicate oracle ${duplicate}`, file));
    const requiredEvidence = asArray(testCase?.evidence?.required);
    if (requiredEvidence.length === 0) findings.push(finding('acceptance-evidence-missing', `${testCase.id} has no required evidence checkpoint`, file));
    for (const evidence of requiredEvidence) {
      ensureRequired(evidence, ['id', 'type', 'checkpoint'], `${scope}.evidence.${evidence?.id || '?'}`, findings, file);
      if (!['screenshot', 'trace', 'video', 'log', 'report', 'file'].includes(evidence?.type)) findings.push(finding('acceptance-evidence-type-invalid', `${testCase.id}.${evidence?.id} has invalid type ${evidence?.type}`, file));
    }
    for (const duplicate of duplicateIds(requiredEvidence)) findings.push(finding('acceptance-evidence-duplicate', `${testCase.id} has duplicate evidence requirement ${duplicate}`, file));
    for (const mutationId of asArray(testCase?.mutations)) if (!mutations.has(mutationId)) findings.push(finding('acceptance-mutation-unknown', `${testCase.id} references unknown mutation ${mutationId}`, file));
  }

  for (const mutation of mutations.values()) {
    ensureRequired(mutation, ['id', 'scope', 'cleanup_required'], `mutations.${mutation?.id || '?'}`, findings, file);
    if (mutation?.cleanup_required === true && !mutation?.cleanup_operation && !mutation?.waiver) {
      findings.push(finding('acceptance-cleanup-undefined', `${mutation.id} requires cleanup but has no cleanup operation`, file));
    }
    if (mutation?.waiver) validateWaiver(mutation.waiver, `mutations.${mutation.id}.waiver`, findings, file);
  }
  return findings;
}

export function validateAcceptanceResults(results, {
  file = 'results.json',
  subjectSha = null,
  observationRunId = null,
  planDigest = null,
  environmentDigest = null,
  plan = null,
  provenanceWaiver = null,
} = {}) {
  const findings = [];
  ensureRequired(results, ['schema_version', 'run_id', 'candidate_sha', 'plan_digest', 'environment_digest', 'observation_run_id', 'overall_status', 'toolchain', 'cases', 'mutations'], 'acceptance_results', findings, file);
  if (results?.schema_version !== 1) findings.push(finding('acceptance-results-version-invalid', 'acceptance results schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(results?.run_id || '') || isPlaceholder(results?.run_id)) findings.push(finding('acceptance-results-run-invalid', 'results.run_id must be a concrete logical identifier', file));
  if (results?.observation_run_id !== results?.run_id) findings.push(finding('acceptance-results-run-mismatch', 'results.observation_run_id must equal results.run_id', file));
  for (const key of ['plan_digest', 'environment_digest']) if (!/^sha256:[0-9a-f]{64}$/i.test(results?.[key] || '')) findings.push(finding('acceptance-results-digest-invalid', `${key} must be sha256:<64 hex>`, file));
  if (!SHA_PATTERN.test(results?.candidate_sha || '')) findings.push(finding('acceptance-results-sha-invalid', 'results.candidate_sha must be a full SHA', file));
  if (subjectSha && results?.candidate_sha?.toLowerCase() !== subjectSha.toLowerCase()) findings.push(finding('acceptance-results-sha-mismatch', 'results.candidate_sha differs from the frozen candidate', file));
  if (observationRunId && (results?.run_id !== observationRunId || results?.observation_run_id !== observationRunId)) findings.push(finding('acceptance-results-run-mismatch', 'results and environment observation run identities differ', file));
  if (planDigest && results?.plan_digest !== planDigest) findings.push(finding('acceptance-results-plan-mismatch', 'results were not produced from the supplied acceptance plan', file));
  if (environmentDigest && results?.environment_digest !== environmentDigest) findings.push(finding('acceptance-results-environment-mismatch', 'results were not produced from the supplied environment contract', file));
  if (!['passed', 'failed', 'blocked'].includes(results?.overall_status)) findings.push(finding('acceptance-results-status-invalid', 'overall_status must be passed, failed or blocked', file));
  else if (results.overall_status !== 'passed') findings.push(finding('acceptance-campaign-failed', `campaign overall_status is ${results.overall_status}`, file));
  const provenanceWaived = hasValidWaiver(provenanceWaiver);
  for (const key of ['adapter', 'adapter_version']) if ((!results?.toolchain?.[key] || isPlaceholder(results.toolchain[key]) || results.toolchain[key] === 'not_applicable') && !provenanceWaived) findings.push(finding('acceptance-results-toolchain-incomplete', `toolchain.${key} must be non-placeholder`, file));
  for (const key of ['browser', 'browser_version']) {
    const value = results?.toolchain?.[key];
    const validNonBrowserValue = results?.toolchain?.adapter !== 'playwright' && value === 'not_applicable';
    if ((!value || isPlaceholder(value) || (value === 'not_applicable' && !validNonBrowserValue)) && !provenanceWaived) findings.push(finding('acceptance-results-toolchain-incomplete', `toolchain.${key} must identify Playwright's browser or be not_applicable for another adapter`, file));
  }
  const plannedCases = new Map(asArray(plan?.cases).map((item) => [item.id, item]));
  const actualCases = new Map(asArray(results?.cases).map((item) => [item.id, item]));
  if (!Array.isArray(results?.cases)) findings.push(finding('acceptance-results-case-invalid', 'results.cases must be an array', file));
  if (!Array.isArray(results?.mutations)) findings.push(finding('acceptance-results-mutation-invalid', 'results.mutations must be an array', file));
  for (const duplicate of duplicateIds(results?.cases)) findings.push(finding('acceptance-results-case-duplicate', `duplicate result case ${duplicate}`, file));
  for (const id of plannedCases.keys()) if (!actualCases.has(id)) findings.push(finding('acceptance-results-case-missing', `${id} has no adapter result`, file));
  const evidenceIds = new Set();
  for (const result of asArray(results?.cases)) {
    ensureRequired(result, ['id', 'title', 'outcome', 'attempts', 'oracle_results', 'evidence'], `acceptance_results.cases.${result?.id || '?'}`, findings, file);
    const planned = plannedCases.get(result?.id);
    if (plan && !planned) findings.push(finding('acceptance-results-case-unplanned', `${result?.id} was not planned`, file));
    if (planned && result?.title !== planned?.test_ref?.title) findings.push(finding('acceptance-results-title-mismatch', `${result.id} did not execute the exact planned title`, file));
    if (!Number.isInteger(result?.attempts) || result.attempts < 1) findings.push(finding('acceptance-results-attempts-invalid', `${result?.id} attempts must be a positive integer`, file));
    const normalized = canonicalizeCaseOutcome(result?.outcome, result?.attempts);
    if (normalized.reason === 'invalid_adapter_outcome') findings.push(finding('acceptance-results-outcome-invalid', `${result?.id} has unsupported outcome ${JSON.stringify(result?.outcome)}`, file));
    if (normalized.outcome === 'waived') validateWaiver(result?.waiver, `acceptance_results.cases.${result?.id}.waiver`, findings, file);
    const plannedOracles = new Map(asArray(planned?.oracle).map((oracle) => [oracle.id, oracle]));
    const actualOracles = new Map(asArray(result?.oracle_results).map((oracle) => [oracle?.id, oracle]));
    if (!Array.isArray(result?.oracle_results)) findings.push(finding('acceptance-results-oracle-invalid', `${result?.id}.oracle_results must be an array`, file));
    for (const duplicate of duplicateIds(result?.oracle_results)) findings.push(finding('acceptance-results-oracle-duplicate', `${result?.id} has duplicate oracle ${duplicate}`, file));
    for (const oracleId of plannedOracles.keys()) if (!actualOracles.has(oracleId)) findings.push(finding('acceptance-results-oracle-missing', `${result?.id} has no result for oracle ${oracleId}`, file));
    for (const [oracleId, oracle] of actualOracles) {
      if (planned && !plannedOracles.has(oracleId)) findings.push(finding('acceptance-results-oracle-unplanned', `${result?.id} reports unplanned oracle ${oracleId}`, file));
      const oracleOutcome = canonicalizeCaseOutcome(oracle?.outcome);
      if (oracleOutcome.reason === 'invalid_adapter_outcome') findings.push(finding('acceptance-results-oracle-invalid', `${result?.id}.${oracleId} has unsupported outcome`, file));
      if (normalized.outcome === 'passed' && oracleOutcome.outcome !== 'passed') findings.push(finding('acceptance-results-false-pass', `${result?.id} passed while oracle ${oracleId} did not`, file));
    }
    const plannedEvidence = new Map(asArray(planned?.evidence?.required).map((requirement) => [requirement.id, requirement]));
    const boundRequirements = new Set();
    if (!Array.isArray(result?.evidence)) findings.push(finding('acceptance-results-evidence-invalid', `${result?.id}.evidence must be an array`, file));
    for (const [index, evidence] of asArray(result?.evidence).entries()) {
      ensureRequired(evidence, ['id', 'path'], `acceptance_results.cases.${result?.id}.evidence.${index}`, findings, file);
      if (evidenceIds.has(evidence?.id)) findings.push(finding('acceptance-results-evidence-duplicate', `artifact id ${evidence?.id} is reused`, file));
      else if (evidence?.id) evidenceIds.add(evidence.id);
      if (!evidence?.requirement_id) continue;
      if (boundRequirements.has(evidence.requirement_id)) findings.push(finding('acceptance-results-evidence-binding-duplicate', `${result?.id} binds ${evidence.requirement_id} more than once`, file));
      boundRequirements.add(evidence.requirement_id);
      const requirement = plannedEvidence.get(evidence.requirement_id);
      if (!requirement) findings.push(finding('acceptance-results-evidence-unplanned', `${result?.id} binds unknown evidence requirement ${evidence.requirement_id}`, file));
      else if (evidence.type !== requirement.type || evidence.checkpoint !== requirement.checkpoint) findings.push(finding('acceptance-results-evidence-type-mismatch', `${result?.id}.${evidence.requirement_id} has the wrong type or checkpoint`, file));
    }
    for (const requirementId of plannedEvidence.keys()) if (!boundRequirements.has(requirementId)) findings.push(finding('acceptance-results-evidence-missing', `${result?.id} has no artifact for ${requirementId}`, file));
  }
  const plannedMutations = new Map(asArray(plan?.mutations).map((mutation) => [mutation.id, mutation]));
  const actualMutations = new Map(asArray(results?.mutations).map((mutation) => [mutation?.id, mutation]));
  for (const duplicate of duplicateIds(results?.mutations)) findings.push(finding('acceptance-results-mutation-duplicate', `duplicate result mutation ${duplicate}`, file));
  for (const mutationId of plannedMutations.keys()) if (!actualMutations.has(mutationId)) findings.push(finding('acceptance-results-mutation-missing', `${mutationId} has no adapter result`, file));
  let unsafeMutation = false;
  for (const mutation of asArray(results?.mutations)) {
    ensureRequired(mutation, ['id', 'outcome', 'cleanup'], `acceptance_results.mutations.${mutation?.id || '?'}`, findings, file);
    const planned = plannedMutations.get(mutation?.id);
    if (plan && !planned) findings.push(finding('acceptance-results-mutation-unplanned', `${mutation?.id} was not planned`, file));
    if (!MUTATION_OUTCOMES.has(mutation?.outcome)) findings.push(finding('acceptance-results-mutation-invalid', `${mutation?.id} has invalid outcome ${mutation?.outcome}`, file));
    if (!CLEANUP_OUTCOMES.has(mutation?.cleanup)) findings.push(finding('acceptance-results-cleanup-invalid', `${mutation?.id} has invalid cleanup ${mutation?.cleanup}`, file));
    const usedByApprovedCase = asArray(plan?.cases).some((testCase) => asArray(testCase?.mutations).includes(mutation?.id)
      && ['passed', 'waived'].includes(canonicalizeCaseOutcome(actualCases.get(testCase.id)?.outcome, actualCases.get(testCase.id)?.attempts).outcome));
    if (usedByApprovedCase && mutation?.outcome !== 'applied') {
      unsafeMutation = true;
      findings.push(finding('acceptance-results-mutation-not-applied', `${mutation.id} was required by an approved case but was not applied`, file));
    }
    if (mutation?.outcome === 'failed' || ['failed', 'pending'].includes(mutation?.cleanup)) unsafeMutation = true;
    if (planned?.cleanup_required === true && mutation?.cleanup !== 'passed' && !hasValidWaiver(planned?.waiver)) {
      unsafeMutation = true;
      findings.push(finding('acceptance-results-cleanup-incomplete', `${mutation.id} requires a passed cleanup result`, file));
    }
  }
  if (results?.overall_status === 'passed') {
    const everyCaseApproved = asArray(results?.cases).every((result) => {
      const normalized = canonicalizeCaseOutcome(result?.outcome, result?.attempts);
      return normalized.outcome === 'passed' || (normalized.outcome === 'waived' && hasValidWaiver(result?.waiver));
    });
    if (!everyCaseApproved || unsafeMutation || (plan && actualCases.size !== plannedCases.size)) findings.push(finding('acceptance-results-false-pass', 'overall_status is passed while cases, coverage, mutations or cleanup are not ready', file));
  }
  return findings;
}

export function validateEnvironmentObservation(observation, {
  file = 'environment-observation.json',
  provenanceWaiver = null,
  environment = null,
} = {}) {
  const findings = [];
  ensureRequired(observation, ['schema_version', 'run_id', 'observed_at', 'profile', 'subject_sha', 'deployed_revision', 'instance_id', 'build_or_image', 'schema_version_value', 'dataset_id', 'dataset_version', 'auth_actor_type', 'environment_contract_digest', 'ci_contract_digest', 'checks', 'operations', 'status'], 'environment_observation', findings, file);
  if (observation?.schema_version !== 1) findings.push(finding('environment-observation-version-invalid', 'environment observation schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(observation?.run_id || '') || isPlaceholder(observation?.run_id)) findings.push(finding('environment-run-id-invalid', 'observation.run_id must be a concrete logical identifier', file));
  if (observation?.observed_at && Number.isNaN(Date.parse(observation.observed_at))) findings.push(finding('environment-observation-date-invalid', 'observed_at must be an ISO date', file));
  if (!['ready', 'blocked'].includes(observation?.status)) findings.push(finding('environment-status-invalid', 'observation.status must be ready or blocked', file));
  if (!Array.isArray(observation?.checks) || observation.checks.length === 0) findings.push(finding('environment-checks-missing', 'at least one environment preflight check is required', file));
  if (!Array.isArray(observation?.operations) || observation.operations.length === 0) findings.push(finding('environment-operations-missing', 'at least one executed preflight operation is required', file));
  for (const operation of asArray(observation?.operations)) {
    ensureRequired(operation, ['id', 'argv', 'cwd', 'timeout_seconds', 'side_effect', 'outcome'], `environment_observation.operations.${operation?.id || '?'}`, findings, file);
    for (const key of ['stdout', 'stderr']) if (!Object.hasOwn(operation || {}, key) || typeof operation[key] !== 'string') findings.push(finding('environment-operation-output-missing', `${operation?.id}.${key} must be a bounded string`, file));
    if (operation?.side_effect !== 'none') findings.push(finding('environment-probe-side-effect-invalid', `${operation?.id} observation is not side-effect-free`, file));
    if (!['planned', 'pass', 'fail'].includes(operation?.outcome)) findings.push(finding('environment-operation-outcome-invalid', `${operation?.id} has invalid operation outcome`, file));
  }
  if (!SHA_PATTERN.test(observation?.subject_sha || '') || !SHA_PATTERN.test(observation?.deployed_revision || '')) {
    findings.push(finding('environment-revision-invalid', 'subject and deployed revisions must be full 40-hex SHAs', file));
  } else if (observation.subject_sha.toLowerCase() !== observation.deployed_revision.toLowerCase()) {
    findings.push(finding('environment-revision-mismatch', 'the deployed revision does not equal the frozen subject revision', file));
  }
  for (const key of ['environment_contract_digest', 'ci_contract_digest']) if (!/^sha256:[0-9a-f]{64}$/i.test(observation?.[key] || '')) findings.push(finding('environment-contract-digest-invalid', `${key} must be sha256:<64 hex>`, file));
  const provenanceWaived = hasValidWaiver(provenanceWaiver);
  if (provenanceWaiver) validateWaiver(provenanceWaiver, 'environment_observation.provenance_waiver', findings, file);
  for (const key of ['run_id', 'instance_id', 'build_or_image', 'schema_version_value', 'dataset_id', 'dataset_version', 'auth_actor_type']) if ((!observation?.[key] || isPlaceholder(observation[key])) && !provenanceWaived) findings.push(finding('environment-provenance-incomplete', `${key} must be observed and non-placeholder`, file));
  for (const check of asArray(observation?.checks)) {
    if (check?.required !== false && check?.outcome !== 'pass') {
      const code = check?.kind === 'schema' ? 'environment-schema-mismatch'
        : check?.kind === 'dataset' ? 'environment-dataset-mismatch'
          : check?.kind === 'credential' ? 'environment-credential-expired'
            : 'environment-dependency-unready';
      findings.push(finding(code, `${check?.id || 'environment check'} did not pass`, file, check?.message || null));
    }
  }
  const profile = asArray(environment?.profiles).find((candidate) => candidate?.id === observation?.profile);
  if (environment && !profile) findings.push(finding('environment-observation-profile-unknown', `observation profile ${observation?.profile} is absent from the environment contract`, file));
  if (profile) {
    const expectedChecks = new Map();
    if (typeof profile.operations?.health === 'string') expectedChecks.set(profile.operations.health, { kind: 'health', required: true });
    if (typeof profile.operations?.revision_probe === 'string') expectedChecks.set(profile.operations.revision_probe, { kind: 'revision', required: true });
    for (const dependency of asArray(profile.dependencies)) {
      expectedChecks.set(dependency.readiness_operation, { kind: dependency.kind || 'dependency', required: dependency.required !== false });
      if (dependency.version_operation) expectedChecks.set(dependency.version_operation, { kind: dependency.version_kind || 'version', required: dependency.required !== false });
    }
    const checksById = new Map(asArray(observation?.checks).map((check) => [check?.id, check]));
    const operationsById = new Map(asArray(observation?.operations).map((operation) => [operation?.id, operation]));
    for (const duplicate of duplicateIds(observation?.checks)) findings.push(finding('environment-check-duplicate', `duplicate observation check ${duplicate}`, file));
    for (const duplicate of duplicateIds(observation?.operations)) findings.push(finding('environment-operation-duplicate', `duplicate observed operation ${duplicate}`, file));
    for (const [id, expected] of expectedChecks) {
      const check = checksById.get(id);
      const operation = operationsById.get(id);
      if (!check || !operation) findings.push(finding('environment-required-probe-missing', `${id} was required by the environment contract but was not observed`, file));
      else {
        if (check.kind !== expected.kind || check.required !== expected.required) findings.push(finding('environment-probe-contract-mismatch', `${id} observation metadata differs from the environment contract`, file));
        if (check.outcome !== operation.outcome) findings.push(finding('environment-probe-contract-mismatch', `${id} check outcome differs from its operation outcome`, file));
      }
    }
    for (const id of checksById.keys()) if (!expectedChecks.has(id)) findings.push(finding('environment-unplanned-probe', `${id} was not declared by the environment profile`, file));
    for (const id of operationsById.keys()) if (!expectedChecks.has(id)) findings.push(finding('environment-unplanned-probe', `${id} operation was not declared by the environment profile`, file));
    const revisionId = typeof profile.operations?.revision_probe === 'string' ? profile.operations.revision_probe : null;
    const revisionOperation = revisionId ? operationsById.get(revisionId) : null;
    const observedRevision = String(revisionOperation?.stdout || '').match(/\b[0-9a-f]{40}\b/i)?.[0]?.toLowerCase() || null;
    if (!revisionOperation || revisionOperation.outcome !== 'pass' || observedRevision !== String(observation?.deployed_revision || '').toLowerCase()) {
      findings.push(finding('environment-revision-not-observed', 'deployed_revision must come from the declared successful revision probe output', file));
    }
  }
  if (observation?.status === 'blocked') findings.push(finding('environment-not-ready', 'environment observation is blocked', file));
  if (observation?.status === 'ready' && findings.length) findings.push(finding('environment-false-ready', 'observation says ready while a required preflight check failed', file));
  return findings;
}

export function validateEvidence(manifest, plan = null, {
  file = 'evidence-manifest.yaml',
  artifactsRoot = null,
  verifyArtifacts = false,
  acceptancePlanFile = null,
  environmentContractFile = null,
  repositoryRoot = process.cwd(),
} = {}) {
  const findings = [];
  ensureRequired(manifest, ['schema_version', 'run_id', 'generated_at', 'spec_package', 'subject', 'environment', 'toolchain', 'acceptance', 'publication', 'criteria_waivers', 'cases', 'mutations', 'artifacts', 'summary', 'verdict'], 'evidence', findings, file);
  if (manifest?.schema_version !== 1) findings.push(finding('evidence-version-unsupported', 'evidence.schema_version must be 1', file));
  if (!SAFE_REFERENCE_PATTERN.test(manifest?.run_id || '') || isPlaceholder(manifest?.run_id)) findings.push(finding('evidence-run-id-invalid', 'run_id must be a concrete logical identifier', file));
  if (Number.isNaN(Date.parse(manifest?.generated_at))) findings.push(finding('evidence-generated-at-invalid', 'generated_at must be an ISO date', file));
  if (!validReferencePath(manifest?.spec_package)) findings.push(finding('evidence-spec-package-invalid', 'spec_package must be repository-relative', file));
  const subject = manifest?.subject || {};
  for (const key of ['head_sha', 'tested_sha']) if (!SHA_PATTERN.test(subject[key] || '')) findings.push(finding('evidence-sha-invalid', `subject.${key} must be a full 40-hex SHA`, file));
  if (subject.base_sha && !SHA_PATTERN.test(subject.base_sha)) findings.push(finding('evidence-sha-invalid', 'subject.base_sha must be a full 40-hex SHA when present', file));
  if (subject.head_sha && subject.tested_sha && subject.head_sha.toLowerCase() !== subject.tested_sha.toLowerCase()) findings.push(finding('evidence-subject-stale', 'tested_sha differs from the frozen subject head_sha', file));
  if (!/^sha256:[0-9a-f]{64}$/i.test(subject.source_tree_digest || '')) findings.push(finding('evidence-source-digest-invalid', 'subject.source_tree_digest must be sha256:<64 hex>', file));
  if (subject.evidence_commit_sha && !SHA_PATTERN.test(subject.evidence_commit_sha)) findings.push(finding('evidence-sha-invalid', 'subject.evidence_commit_sha must be a full 40-hex SHA when present', file));
  ensureRequired(manifest?.publication, ['mode'], 'evidence.publication', findings, file);
  if (!['ci_artifact', 'evidence_only_commit'].includes(manifest?.publication?.mode)) findings.push(finding('evidence-publication-mode-invalid', 'publication.mode must be ci_artifact or evidence_only_commit', file));
  if (manifest?.publication?.mode === 'evidence_only_commit' && !SHA_PATTERN.test(subject.evidence_commit_sha || '')) {
    findings.push(finding('evidence-commit-sha-missing', 'evidence_only_commit publication requires subject.evidence_commit_sha', file));
  }
  if (manifest?.publication?.mode === 'ci_artifact') {
    ensureRequired(manifest.publication, ['ci_run_id', 'artifact_id', 'artifact_url', 'retention_days', 'bundle_digest'], 'evidence.publication', findings, file);
    if (isPlaceholder(manifest.publication.ci_run_id) || isPlaceholder(manifest.publication.artifact_id)) findings.push(finding('evidence-publication-provenance-incomplete', 'CI publication identifiers must be non-placeholder', file));
    try {
      const url = new URL(manifest.publication.artifact_url);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('not a stable credential-free HTTPS URL');
    } catch {
      findings.push(finding('evidence-publication-url-invalid', 'publication.artifact_url must be an HTTPS URL', file));
    }
    if (!Number.isInteger(manifest.publication.retention_days) || manifest.publication.retention_days < 1) findings.push(finding('evidence-publication-retention-invalid', 'publication.retention_days must be positive', file));
    if (!/^sha256:[0-9a-f]{64}$/i.test(manifest.publication.bundle_digest || '')) findings.push(finding('evidence-publication-digest-invalid', 'publication.bundle_digest must be sha256:<64 hex>', file));
    else if (manifest.publication.bundle_digest !== sha256Object(asArray(manifest?.artifacts))) findings.push(finding('evidence-publication-digest-mismatch', 'publication.bundle_digest does not match the artifact inventory', file));
  }
  if (!SHA_PATTERN.test(manifest?.environment?.deployed_revision || '') || manifest?.environment?.deployed_revision?.toLowerCase() !== subject.tested_sha?.toLowerCase()) {
    findings.push(finding('evidence-deployed-revision-mismatch', 'environment.deployed_revision must equal subject.tested_sha', file));
  }
  if (!/^sha256:[0-9a-f]{64}$/i.test(manifest?.environment?.contract_digest || '')) findings.push(finding('evidence-environment-digest-invalid', 'environment.contract_digest must be sha256:<64 hex>', file));
  const provenanceWaived = hasValidWaiver(manifest?.provenance_waiver);
  if (manifest?.provenance_waiver) validateWaiver(manifest.provenance_waiver, 'evidence.provenance_waiver', findings, file);
  for (const key of ['instance_id', 'build_or_image', 'schema_version', 'dataset_id', 'dataset_version', 'auth_actor_type']) {
    if ((!manifest?.environment?.[key] || isPlaceholder(manifest.environment[key])) && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `environment.${key} must be non-placeholder or explicitly waived`, file));
  }
  for (const key of ['adapter', 'adapter_version']) {
    if ((!manifest?.toolchain?.[key] || isPlaceholder(manifest.toolchain[key]) || manifest.toolchain[key] === 'not_applicable') && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `toolchain.${key} must be non-placeholder or explicitly waived`, file));
  }
  for (const key of ['browser', 'browser_version']) {
    const value = manifest?.toolchain?.[key];
    const validNonBrowserValue = manifest?.toolchain?.adapter !== 'playwright' && value === 'not_applicable';
    if ((!value || isPlaceholder(value) || (value === 'not_applicable' && !validNonBrowserValue)) && !provenanceWaived) findings.push(finding('evidence-provenance-incomplete', `toolchain.${key} must identify the browser for Playwright, or be not_applicable for a non-browser adapter`, file));
  }
  ensureRequired(manifest?.acceptance, ['plan_path', 'plan_digest'], 'evidence.acceptance', findings, file);
  if (!validReferencePath(manifest?.acceptance?.plan_path)) findings.push(finding('evidence-plan-path-invalid', 'acceptance.plan_path must be repository-relative', file));
  if (!/^sha256:[0-9a-f]{64}$/i.test(manifest?.acceptance?.plan_digest || '')) findings.push(finding('evidence-plan-digest-invalid', 'acceptance.plan_digest must be sha256:<64 hex>', file));
  if (acceptancePlanFile) {
    if (!fs.existsSync(acceptancePlanFile)) findings.push(finding('evidence-plan-missing', `acceptance plan is absent: ${acceptancePlanFile}`, file));
    else {
      const relative = path.relative(path.resolve(repositoryRoot), path.resolve(acceptancePlanFile)).split(path.sep).join('/');
      if (relative !== manifest?.acceptance?.plan_path) findings.push(finding('evidence-plan-path-mismatch', `manifest plan path ${manifest?.acceptance?.plan_path} differs from ${relative}`, file));
      if (sha256File(acceptancePlanFile) !== manifest?.acceptance?.plan_digest) findings.push(finding('evidence-plan-digest-mismatch', 'acceptance plan content differs from the tested manifest input', file));
    }
  }
  if (environmentContractFile) {
    if (!fs.existsSync(environmentContractFile)) findings.push(finding('evidence-environment-missing', `environment contract is absent: ${environmentContractFile}`, file));
    else if (sha256File(environmentContractFile) !== manifest?.environment?.contract_digest) findings.push(finding('evidence-environment-digest-mismatch', 'environment contract content differs from the tested manifest input', file));
  }

  for (const duplicate of duplicateIds(manifest?.cases)) findings.push(finding('evidence-case-duplicate', `duplicate evidence case ${duplicate}`, file));
  for (const duplicate of duplicateIds(manifest?.artifacts)) findings.push(finding('evidence-artifact-duplicate', `duplicate artifact ${duplicate}`, file));
  const artifacts = new Map(asArray(manifest?.artifacts).map((artifact) => [artifact.id, artifact]));
  const planCases = new Map(asArray(plan?.cases).map((testCase) => [testCase.id, testCase]));
  const actualCases = new Map(asArray(manifest?.cases).map((testCase) => [testCase.id, testCase]));
  const globallyBoundArtifactIds = new Set();
  const plannedCriterionWaivers = new Map(asArray(plan?.criteria)
    .filter((criterion) => criterion?.waiver)
    .map((criterion) => [criterion.id, criterion.waiver]));
  const actualCriterionWaivers = new Map(asArray(manifest?.criteria_waivers)
    .map((waiver) => [waiver?.criterion_id, waiver]));
  for (const duplicate of duplicateIds(asArray(manifest?.criteria_waivers).map((waiver) => ({ id: waiver?.criterion_id })))) {
    findings.push(finding('evidence-criterion-waiver-duplicate', `duplicate criterion waiver ${duplicate}`, file));
  }
  for (const [criterionId, plannedWaiver] of plannedCriterionWaivers) {
    const actualWaiver = actualCriterionWaivers.get(criterionId);
    if (!actualWaiver) findings.push(finding('evidence-criterion-waiver-missing', `${criterionId} waiver is absent from the evidence`, file));
    else {
      validateWaiver(actualWaiver, `criteria_waivers.${criterionId}`, findings, file);
      const { criterion_id: ignored, ...actualApproval } = actualWaiver;
      if (sha256Object(actualApproval) !== sha256Object(plannedWaiver)) findings.push(finding('evidence-criterion-waiver-mismatch', `${criterionId} waiver differs from the approved acceptance plan`, file));
    }
  }
  for (const criterionId of actualCriterionWaivers.keys()) {
    if (!plannedCriterionWaivers.has(criterionId)) findings.push(finding('evidence-criterion-waiver-unplanned', `${criterionId} has an evidence waiver absent from the acceptance plan`, file));
  }
  for (const id of planCases.keys()) if (!actualCases.has(id)) findings.push(finding('evidence-case-missing', `${id} was planned but has no result`, file));
  for (const testCase of actualCases.values()) {
    ensureRequired(testCase, ['id', 'criteria', 'outcome', 'attempts', 'oracle_results', 'evidence_ids', 'evidence_bindings'], `evidence.cases.${testCase?.id || '?'}`, findings, file);
    const planned = planCases.get(testCase?.id);
    if (plan && !planned) findings.push(finding('evidence-case-unplanned', `${testCase?.id} was not declared in the acceptance plan`, file));
    if (planned) {
      const expectedCriteria = [...new Set(asArray(planned.criteria))].sort();
      const actualCriteria = [...new Set(asArray(testCase.criteria))].sort();
      if (sha256Object(actualCriteria) !== sha256Object(expectedCriteria)) findings.push(finding('evidence-criteria-mismatch', `${testCase.id} criteria differ from the acceptance plan`, file));
    }
    if (!Number.isInteger(testCase?.attempts) || testCase.attempts < 1) findings.push(finding('evidence-attempts-invalid', `${testCase?.id} attempts must be a positive integer`, file));
    if (!OUTCOMES.has(testCase?.outcome)) findings.push(finding('evidence-outcome-invalid', `${testCase?.id} has invalid outcome ${testCase?.outcome}`, file));
    else if (testCase.outcome === 'waived') {
      validateWaiver(testCase?.waiver, `cases.${testCase.id}.waiver`, findings, file);
    } else if (testCase.outcome !== 'passed') findings.push(finding('evidence-case-not-pass', `${testCase.id} outcome is ${testCase.outcome}`, file));
    if (testCase?.outcome === 'passed' && Number(testCase?.attempts) > 1) findings.push(finding('acceptance-flaky-blocking', `${testCase.id} passed only after retry and must be failed`, file));
    for (const oracle of asArray(testCase?.oracle_results)) {
      if (!OUTCOMES.has(oracle?.outcome)) findings.push(finding('evidence-oracle-outcome-invalid', `${testCase.id}.${oracle?.id || '?'} has invalid outcome ${oracle?.outcome}`, file));
    }
    if (testCase?.outcome === 'passed' && testCase?.reason) findings.push(finding('evidence-false-pass', `${testCase.id} is passed but carries blocking reason ${testCase.reason}`, file));
    if (testCase?.outcome === 'passed' && asArray(testCase?.oracle_results).some((oracle) => oracle?.outcome !== 'passed')) findings.push(finding('evidence-false-pass', `${testCase.id} is passed while an oracle is not passed`, file));
    if (testCase?.outcome === 'passed' && asArray(testCase?.oracle_results).length === 0) findings.push(finding('evidence-oracle-result-missing', `${testCase.id} is passed without an oracle result`, file));
    if (planned) {
      const oracleResults = new Map(asArray(testCase?.oracle_results).map((oracle) => [oracle.id, oracle]));
      for (const duplicate of duplicateIds(testCase?.oracle_results)) findings.push(finding('evidence-oracle-result-duplicate', `${testCase.id} has duplicate oracle result ${duplicate}`, file));
      for (const oracle of asArray(planned.oracle)) {
        if (!oracleResults.has(oracle.id)) findings.push(finding('evidence-oracle-result-missing', `${testCase.id} has no result for oracle ${oracle.id}`, file));
      }
      const plannedOracleIds = new Set(asArray(planned.oracle).map((oracle) => oracle.id));
      for (const oracleId of oracleResults.keys()) if (!plannedOracleIds.has(oracleId)) findings.push(finding('evidence-oracle-result-unplanned', `${testCase.id} reports unplanned oracle ${oracleId}`, file));
      const requiredEvidence = asArray(planned?.evidence?.required);
      for (const binding of asArray(testCase?.evidence_bindings)) ensureRequired(binding, ['requirement_id', 'artifact_id', 'type', 'checkpoint'], `evidence.cases.${testCase.id}.evidence_bindings`, findings, file);
      const evidenceBindings = new Map(asArray(testCase?.evidence_bindings).map((binding) => [binding.requirement_id, binding]));
      const bindingRequirementIds = asArray(testCase?.evidence_bindings).map((binding) => ({ id: binding?.requirement_id }));
      for (const duplicate of duplicateIds(bindingRequirementIds)) findings.push(finding('evidence-binding-duplicate', `${testCase.id} binds requirement ${duplicate} more than once`, file));
      const boundArtifactIds = new Set();
      for (const requirement of requiredEvidence) {
        const binding = evidenceBindings.get(requirement.id);
        if (!binding) findings.push(finding('evidence-artifact-missing', `${testCase.id} has no artifact bound to ${requirement.id}`, file));
        else {
          if (binding.type !== requirement.type || binding.checkpoint !== requirement.checkpoint) findings.push(finding('evidence-artifact-type-mismatch', `${testCase.id}.${requirement.id} does not match its required type/checkpoint`, file));
          const artifact = artifacts.get(binding.artifact_id);
          if (!artifact) findings.push(finding('evidence-artifact-missing', `${testCase.id}.${requirement.id} references missing artifact ${binding.artifact_id}`, file));
          else if (EVIDENCE_MEDIA_TYPES[requirement.type] && !EVIDENCE_MEDIA_TYPES[requirement.type].has(artifact.media_type)) findings.push(finding('evidence-artifact-media-mismatch', `${testCase.id}.${requirement.id} media type does not satisfy ${requirement.type}`, file));
          if (boundArtifactIds.has(binding.artifact_id)) findings.push(finding('evidence-artifact-reused', `${testCase.id}.${requirement.id} reuses an artifact already bound to another requirement`, file));
          if (globallyBoundArtifactIds.has(binding.artifact_id)) findings.push(finding('evidence-artifact-reused', `${testCase.id}.${requirement.id} reuses an artifact bound to another case`, file));
          boundArtifactIds.add(binding.artifact_id);
          globallyBoundArtifactIds.add(binding.artifact_id);
        }
      }
      const requiredEvidenceIds = new Set(requiredEvidence.map((requirement) => requirement.id));
      for (const requirementId of evidenceBindings.keys()) if (!requiredEvidenceIds.has(requirementId)) findings.push(finding('evidence-artifact-unplanned', `${testCase.id} binds unplanned requirement ${requirementId}`, file));
      if (asArray(testCase?.evidence_bindings).length !== requiredEvidence.length) findings.push(finding('evidence-artifact-unplanned', `${testCase.id} evidence bindings are not exhaustive and exact`, file));
    }
    if (new Set(asArray(testCase?.evidence_ids)).size !== asArray(testCase?.evidence_ids).length) findings.push(finding('evidence-artifact-reused', `${testCase.id} evidence_ids contains duplicates`, file));
    for (const id of asArray(testCase?.evidence_ids)) if (!artifacts.has(id)) findings.push(finding('evidence-artifact-missing', `${testCase.id} references missing artifact ${id}`, file));
  }

  const plannedMutations = new Map(asArray(plan?.mutations).map((mutation) => [mutation.id, mutation]));
  const actualMutations = new Map(asArray(manifest?.mutations).map((mutation) => [mutation.id, mutation]));
  for (const duplicate of duplicateIds(manifest?.mutations)) findings.push(finding('acceptance-mutation-duplicate', `duplicate evidence mutation ${duplicate}`, file));
  for (const id of plannedMutations.keys()) if (!actualMutations.has(id)) findings.push(finding('acceptance-mutation-missing', `${id} has no execution result`, file));
  for (const mutation of asArray(manifest?.mutations)) {
    ensureRequired(mutation, ['id', 'outcome', 'cleanup'], `evidence.mutations.${mutation?.id || '?'}`, findings, file);
    if (plan && !plannedMutations.has(mutation?.id)) findings.push(finding('acceptance-mutation-unplanned', `${mutation?.id} was not planned`, file));
    if (!MUTATION_OUTCOMES.has(mutation?.outcome)) findings.push(finding('acceptance-mutation-outcome-invalid', `${mutation?.id} has invalid outcome ${mutation?.outcome}`, file));
    if (mutation?.outcome === 'failed') findings.push(finding('acceptance-mutation-failed', `${mutation.id} failed`, file));
    if (!CLEANUP_OUTCOMES.has(mutation?.cleanup)) findings.push(finding('acceptance-cleanup-invalid', `${mutation?.id} has invalid cleanup ${mutation?.cleanup}`, file));
    if (mutation?.cleanup === 'failed' || mutation?.cleanup === 'pending') findings.push(finding('acceptance-cleanup-pending', `${mutation.id} cleanup is ${mutation.cleanup}`, file));
    const planned = plannedMutations.get(mutation?.id);
    if (planned?.cleanup_required === true && mutation?.cleanup !== 'passed' && !hasValidWaiver(planned?.waiver)) findings.push(finding('acceptance-cleanup-pending', `${mutation.id} requires a passed cleanup result`, file));
    const usedByApprovedCase = asArray(plan?.cases).some((plannedCase) => asArray(plannedCase?.mutations).includes(mutation?.id)
      && ['passed', 'waived'].includes(actualCases.get(plannedCase.id)?.outcome));
    if (usedByApprovedCase && mutation?.outcome !== 'applied') findings.push(finding('acceptance-mutation-not-applied', `${mutation.id} was required by an approved case but was not applied`, file));
  }
  for (const artifact of artifacts.values()) {
    ensureRequired(artifact, ['id', 'path', 'media_type', 'sha256', 'bytes'], `evidence.artifacts.${artifact?.id || '?'}`, findings, file);
    if (!artifact?.path || path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) findings.push(finding('evidence-artifact-path-invalid', `${artifact?.id} has unsafe path ${artifact?.path}`, file));
    if (!/^sha256:[0-9a-f]{64}$/i.test(artifact?.sha256 || '')) findings.push(finding('evidence-artifact-hash-invalid', `${artifact?.id} has no valid sha256`, file));
    if (!Number.isInteger(artifact?.bytes) || artifact.bytes < 0) findings.push(finding('evidence-artifact-size-invalid', `${artifact?.id} has invalid byte size`, file));
    if (verifyArtifacts && artifactsRoot && artifact?.path) {
      try {
        const resolved = resolveContainedRegularFile(artifactsRoot, path.resolve(artifactsRoot, artifact.path));
        if (sha256File(resolved.absolute) !== artifact.sha256) findings.push(finding('evidence-artifact-hash-mismatch', `${artifact.id} content does not match its recorded hash`, file));
        if (fs.statSync(resolved.absolute).size !== artifact.bytes) findings.push(finding('evidence-artifact-size-mismatch', `${artifact.id} size does not match its recorded byte count`, file));
        for (const issue of scanEvidenceFile(resolved.absolute, resolved.relative)) findings.push(finding(issue.code, issue.message, file));
      } catch (error) {
        findings.push(finding(error.message.includes('symbolic') ? 'evidence-artifact-symlink' : 'evidence-artifact-path-invalid', `${artifact.id}: ${error.message}`, file));
      }
    }
  }

  const recomputed = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  for (const testCase of actualCases.values()) if (Object.hasOwn(recomputed, testCase.outcome)) recomputed[testCase.outcome] += 1;
  for (const [key, count] of Object.entries(recomputed)) if (manifest?.summary?.[key] !== count) findings.push(finding('evidence-summary-mismatch', `summary.${key} is ${manifest?.summary?.[key]} but results contain ${count}`, file));
  if (!Array.isArray(manifest?.generation_findings)) findings.push(finding('evidence-generation-findings-invalid', 'generation_findings must be an array', file));
  for (const item of asArray(manifest?.generation_findings)) {
    findings.push(finding(item?.code || 'evidence-generation-finding', item?.message || 'evidence generation reported an unresolved finding', file));
  }
  const actuallyReady = findings.length === 0
    && (actualCases.size > 0 || actualCriterionWaivers.size > 0)
    && [...actualCases.values()].every((testCase) => testCase.outcome === 'passed' || (testCase.outcome === 'waived' && hasValidWaiver(testCase.waiver)))
    && [...actualCriterionWaivers.values()].every(hasValidWaiver);
  if (manifest?.verdict === 'ready' && !actuallyReady) findings.push(finding('evidence-false-pass', 'manifest verdict is ready while its evidence is incomplete or failing', file));
  if (!['ready', 'blocked'].includes(manifest?.verdict)) findings.push(finding('evidence-verdict-invalid', 'verdict must be ready or blocked', file));
  return findings;
}

export function validatePrDraft(contract, ci = null, { file = 'pr-draft.yaml', allowPlaceholders = false } = {}) {
  const findings = [];
  ensureRequired(contract, ['version', 'provider', 'draft', 'title', 'base_ref', 'head_ref_from', 'body_path', 'spec_ref', 'technical_plan_ref', 'acceptance_matrix_ref', 'replay_command', 'required_checks', 'authorization', 'permissions', 'forbidden_actions'], 'pr_draft', findings, file);
  if (contract?.version !== 1) findings.push(finding('pr-version-unsupported', 'pr_draft.version must be 1', file));
  if (contract?.provider !== 'github') findings.push(finding('pr-provider-unsupported', 'only the github draft provider is supported', file));
  if (contract?.draft !== true) findings.push(finding('pr-not-draft', 'factory PR creation is draft-only', file));
  const permissionKeys = Object.keys(requiredObject(contract?.permissions) ? contract.permissions : {}).sort();
  if (contract?.permissions?.contents !== 'read' || contract?.permissions?.pull_requests !== 'write' || sha256Object(permissionKeys) !== sha256Object(['contents', 'pull_requests'])) findings.push(finding('pr-permissions-invalid', 'draft PR permissions must be exactly contents:read and pull_requests:write', file));
  for (const action of FORBIDDEN_PR_ACTIONS) if (!asArray(contract?.forbidden_actions).includes(action)) findings.push(finding('pr-authority-too-broad', `${action} must remain forbidden`, file));
  if (contract?.authorization?.required !== true || contract?.authorization?.provider !== 'external_receipt' || !contract?.authorization?.gate_id) findings.push(finding('pr-authorization-missing', 'draft creation requires an external authorization receipt gate', file));
  if (!SAFE_REFERENCE_PATTERN.test(contract?.authorization?.gate_id || '') || isPlaceholder(contract?.authorization?.gate_id)) findings.push(finding('pr-authorization-missing', 'authorization.gate_id must be a concrete logical gate reference', file));
  if (typeof contract?.title !== 'string' || !contract.title.trim() || /[\r\n]/.test(contract.title) || (!allowPlaceholders && isPlaceholder(contract.title))) findings.push(finding('pr-title-invalid', 'title must be one concrete single-line value', file));
  const baseRefPlaceholder = allowPlaceholders && isPlaceholder(contract?.base_ref);
  if (!baseRefPlaceholder && (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(contract?.base_ref || '') || String(contract?.base_ref).includes('..') || isPlaceholder(contract?.base_ref))) findings.push(finding('pr-base-ref-invalid', 'base_ref must be a concrete safe Git ref', file));
  if (!ENV_REFERENCE_PATTERN.test(contract?.head_ref_from || '')) findings.push(finding('pr-head-ref-source-invalid', 'head_ref_from must name one environment variable', file));
  if (!validReferencePath(contract?.body_path)) findings.push(finding('pr-body-path-invalid', 'body_path must be a safe repository-relative path', file));
  for (const key of ['body_path', 'spec_ref', 'technical_plan_ref', 'acceptance_matrix_ref']) {
    if (!validReferencePath(contract?.[key])) findings.push(finding('pr-reference-path-invalid', `${key} must be repository-relative`, file));
    if (!allowPlaceholders && isPlaceholder(contract?.[key])) findings.push(finding('pr-placeholder', `${key} contains an unresolved placeholder`, file));
  }
  if (typeof contract?.replay_command !== 'string' || !contract.replay_command.trim() || /[\r\n]/.test(contract.replay_command) || (!allowPlaceholders && isPlaceholder(contract.replay_command))) findings.push(finding('pr-replay-command-invalid', 'replay_command must be one concrete single-line command', file));
  if (!Array.isArray(contract?.required_checks) || contract.required_checks.length === 0) findings.push(finding('pr-required-check-missing', 'required_checks must not be empty', file));
  if (new Set(asArray(contract?.required_checks)).size !== asArray(contract?.required_checks).length) findings.push(finding('pr-required-check-duplicate', 'required_checks must not contain duplicates', file));
  if (ci) {
    const checks = new Set(asArray(ci.checks).filter((check) => check.required === true).map((check) => check.id));
    for (const id of checks) if (!asArray(contract?.required_checks).includes(id)) findings.push(finding('pr-required-check-missing', `${id} is required by CI but absent from the PR contract`, file));
    for (const id of asArray(contract?.required_checks)) if (!checks.has(id)) findings.push(finding('pr-required-check-unplanned', `${id} is not a required CI check`, file));
  }
  return findings;
}

export function validateCrossContracts({ environment, ci, plan, pr }, files = {}) {
  const findings = [];
  const profiles = new Map(asArray(environment?.profiles).map((profile) => [profile.id, profile]));
  if (plan?.environment_profile && !profiles.has(plan.environment_profile)) findings.push(finding('acceptance-environment-unknown', `acceptance profile ${plan.environment_profile} is not declared`, files.plan));
  const profile = profiles.get(plan?.environment_profile);
  if (plan?.campaign?.unattended_required === true && profile?.automated !== true) findings.push(finding('acceptance-not-unattended', `${profile.id} is not automation-compatible`, files.plan));
  if (pr && ci) findings.push(...validatePrDraft(pr, ci, { file: files.pr, allowPlaceholders: files.allowPlaceholders === true }));
  if (profile) {
    const allowedMutations = new Set(asArray(profile?.mutation_policy?.allowed));
    for (const mutation of asArray(plan?.mutations)) {
      if (!allowedMutations.has(mutation.id)) findings.push(finding('acceptance-mutation-not-allowed', `${mutation.id} is not allowed by environment profile ${profile.id}`, files.plan));
      if (mutation.cleanup_operation) {
        const cleanup = requiredObject(ci?.operations) && Object.hasOwn(ci.operations, mutation.cleanup_operation) ? ci.operations[mutation.cleanup_operation] : null;
        if (!cleanup) findings.push(finding('acceptance-cleanup-operation-unknown', `${mutation.id} references unknown cleanup operation ${mutation.cleanup_operation}`, files.plan));
        else if (cleanup.side_effect !== 'cleanup' && cleanup.side_effect !== 'reset') findings.push(finding('acceptance-cleanup-operation-invalid', `${mutation.id} cleanup operation must declare cleanup or reset side effect`, files.plan));
      }
    }
  }
  return findings;
}
