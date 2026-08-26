import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { asArray, requiredObject, resolveContainedDirectory } from './core.mjs';
import { redactRuntimeText } from './minimize.mjs';

function bounded(value, limit = 4000) {
  const text = redactRuntimeText(value);
  return text.length > limit ? `${text.slice(0, limit)}\n<output truncated>` : text;
}

export function executeOperation(ci, id, {
  cwd = process.cwd(),
  env = process.env,
  dryRun = true,
  allowedSideEffects = ['none'],
} = {}) {
  const operation = requiredObject(ci?.operations) && Object.hasOwn(ci.operations, id) ? ci.operations[id] : null;
  if (!operation) throw new Error(`unknown operation ${id}`);
  if (!allowedSideEffects.includes(operation.side_effect)) {
    throw new Error(`operation ${id} has disallowed side effect ${operation.side_effect}`);
  }
  const argv = asArray(operation.argv).map(String);
  const operationRoot = path.resolve(cwd);
  const operationDirectory = resolveContainedDirectory(operationRoot, path.resolve(operationRoot, operation.cwd || '.'));
  const plan = {
    id,
    argv,
    cwd: operationDirectory.absolute,
    timeout_seconds: operation.timeout_seconds,
    side_effect: operation.side_effect,
  };
  if (dryRun) return { ...plan, outcome: 'planned', exit_code: null, stdout: '', stderr: '' };
  const startedAt = new Date().toISOString();
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: plan.cwd,
    env,
    encoding: 'utf8',
    timeout: Number(operation.timeout_seconds) * 1000,
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  return {
    ...plan,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    outcome: exitCode === 0 ? 'pass' : 'fail',
    exit_code: exitCode,
    stdout: bounded(result.stdout),
    stderr: bounded(result.stderr || result.error?.message),
  };
}

function revisionFrom(output) {
  const match = String(output || '').match(/\b[0-9a-f]{40}\b/i);
  return match ? match[0].toLowerCase() : null;
}

export function runPreflight(environment, ci, profileId, subjectSha, options = {}) {
  const profile = asArray(environment?.profiles).find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`unknown environment profile ${profileId}`);
  const checks = [];
  const operations = [];
  const run = (id, kind, required = true) => {
    const result = executeOperation(ci, id, options);
    operations.push(result);
    checks.push({ id, kind, required, outcome: result.outcome, message: result.stderr || null });
    return result;
  };

  if (typeof profile.operations?.health === 'string') run(profile.operations.health, 'health');
  const revisionResult = typeof profile.operations?.revision_probe === 'string'
    ? run(profile.operations.revision_probe, 'revision')
    : null;
  for (const dependency of asArray(profile.dependencies)) {
    run(dependency.readiness_operation, dependency.kind || 'dependency', dependency.required !== false);
    if (dependency.version_operation) run(dependency.version_operation, dependency.version_kind || 'version', dependency.required !== false);
  }

  const deployedRevision = revisionResult?.outcome === 'pass'
    ? revisionFrom(revisionResult.stdout)
    : null;
  if (revisionResult && revisionResult.outcome === 'pass' && !deployedRevision) {
    const check = checks.find((item) => item.id === revisionResult.id);
    check.outcome = 'fail';
    check.message = 'revision probe did not return a full SHA';
  }
  const runtimeEnvironment = options.env || {};
  const dataNotApplicable = profile.data?.not_applicable === true;
  const authNotApplicable = profile.auth?.not_applicable === true;
  const endpointNotApplicable = profile.endpoint?.not_applicable === true;
  const ready = options.dryRun === false
    && checks.every((check) => check.required === false || check.outcome === 'pass')
    && deployedRevision === subjectSha.toLowerCase();

  return {
    schema_version: 1,
    run_id: options.runId || null,
    observed_at: new Date().toISOString(),
    profile: profile.id,
    profile_kind: profile.kind,
    subject_sha: subjectSha.toLowerCase(),
    deployed_revision: deployedRevision,
    instance_id: options.instanceId || (endpointNotApplicable ? 'not_applicable' : 'unknown'),
    build_or_image: options.buildOrImage || 'unknown',
    schema_version_value: options.schemaVersion || (dataNotApplicable ? 'not_applicable' : 'unknown'),
    dataset_id: options.datasetId || runtimeEnvironment[profile.data?.dataset_id_from] || (dataNotApplicable ? 'not_applicable' : 'unknown'),
    dataset_version: options.datasetVersion || runtimeEnvironment[profile.data?.dataset_version_from] || (dataNotApplicable ? 'not_applicable' : 'unknown'),
    environment_contract_digest: options.environmentContractDigest || null,
    ci_contract_digest: options.ciContractDigest || null,
    auth_actor_type: authNotApplicable ? 'not_applicable' : profile.auth?.mode || 'unknown',
    checks,
    operations,
    status: ready ? 'ready' : 'blocked',
  };
}
