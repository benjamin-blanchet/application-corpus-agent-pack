#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { materializeEphemeralStorage } from './adapters/playwright/storage.mjs';
import { SHA_PATTERN, asArray, parseArgs, printResult, resolveContainedRegularFile, sha256File } from './lib/factory-delivery/core.mjs';
import { runMutationCleanups } from './lib/factory-delivery/cleanup.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';
import { unavailableExecutionBoundaryFinding } from './lib/factory-delivery/execution-boundary.mjs';
import { executeOperation, runPreflight } from './lib/factory-delivery/operations.mjs';
import { currentHead, verifyFileAtRevision } from './lib/factory-delivery/provenance.mjs';
import { validateAcceptancePlan, validateCrossContracts, validateEnvironment, validateEnvironmentObservation, validateFactoryCi } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = fs.realpathSync(path.resolve(args.root || process.cwd()));
const requestedControllerRoot = path.resolve(args['controller-root'] || root);
if (!fs.existsSync(requestedControllerRoot) || fs.lstatSync(requestedControllerRoot).isSymbolicLink() || !fs.statSync(requestedControllerRoot).isDirectory()) {
  throw new Error('--controller-root must be a real directory without symbolic links');
}
const controllerRoot = fs.realpathSync(requestedControllerRoot);
if (requestedControllerRoot !== controllerRoot) throw new Error('--controller-root contains a symbolic-link ancestor');

function containedFile(value, label) {
  try {
    return resolveContainedRegularFile(root, path.resolve(root, value)).absolute;
  } catch (error) {
    throw new Error(`${label} must be a contained regular repository file: ${error.message}`);
  }
}

function controllerFile(value, label) {
  try {
    return resolveContainedRegularFile(controllerRoot, path.resolve(controllerRoot, value)).absolute;
  } catch (error) {
    throw new Error(`${label} must come from the protected controller checkout: ${error.message}`);
  }
}

function runtimeEnvironment(profile, { includeProtected = false } = {}) {
  const ephemeralStorage = profile?.auth?.mode === 'ephemeral_storage_state';
  const names = new Set([
    'PATH', 'SystemRoot', 'TMPDIR', 'TMP', 'TEMP', 'CI', 'PLAYWRIGHT_BROWSERS_PATH',
    ...(includeProtected && ephemeralStorage ? ['FACTORY_EPHEMERAL_STORAGE_ROOT'] : []),
    profile?.endpoint?.not_applicable === true ? null : profile?.endpoint?.base_url_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_id_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_version_from,
  ].filter(Boolean));
  return Object.fromEntries([...names].filter((key) => Object.hasOwn(process.env, key)).map((key) => [key, process.env[key]]));
}

function runRole(ci, profile, role, lifecycle, env) {
  const operationId = profile?.operations?.[role];
  if (typeof operationId !== 'string') {
    lifecycle.push({ role, operation_id: null, outcome: 'not_applicable', reason: operationId?.reason || 'not applicable by environment contract' });
    return true;
  }
  const expected = { build: 'build', start: 'start', reset: 'reset', stop: 'stop' }[role];
  const result = executeOperation(ci, operationId, { cwd: root, env, dryRun: false, allowedSideEffects: [expected] });
  lifecycle.push({ role, operation_id: operationId, ...result });
  return result.outcome === 'pass';
}

function runBootstrap(ci, plan, lifecycle, env) {
  const operationId = plan?.campaign?.bootstrap_operation;
  if (!operationId) return true;
  const result = executeOperation(ci, operationId, { cwd: root, env, dryRun: false, allowedSideEffects: ['build'] });
  lifecycle.push({ role: 'campaign_bootstrap', operation_id: operationId, ...result });
  return result.outcome === 'pass';
}

function blockedObservation({ profile, ci, subjectSha, runId, instanceId, buildOrImage, schemaVersion, datasetId, datasetVersion, environmentFile, ciFile }) {
  const expected = new Map();
  const add = (id, kind, required = true) => {
    if (typeof id === 'string' && !expected.has(id)) expected.set(id, { kind, required });
  };
  add(profile?.operations?.health, 'health');
  add(profile?.operations?.revision_probe, 'revision');
  for (const dependency of asArray(profile?.dependencies)) {
    add(dependency?.readiness_operation, dependency?.kind || 'dependency', dependency?.required !== false);
    add(dependency?.version_operation, dependency?.version_kind || 'version', dependency?.required !== false);
  }
  const checks = [...expected].map(([id, metadata]) => ({ id, ...metadata, outcome: 'planned', message: 'not executed: isolated acceptance boundary unavailable' }));
  const operations = [...expected.keys()].map((id) => {
    const declared = ci?.operations?.[id] || {};
    return {
      id,
      argv: asArray(declared.argv),
      cwd: declared.cwd || '.',
      timeout_seconds: Number.isInteger(declared.timeout_seconds) ? declared.timeout_seconds : 0,
      side_effect: declared.side_effect || 'none',
      outcome: 'planned',
      stdout: '',
      stderr: '',
    };
  });
  return {
    schema_version: 1,
    observed_at: new Date().toISOString(),
    run_id: runId,
    profile: profile?.id || 'unresolved-profile',
    subject_sha: subjectSha,
    deployed_revision: '0'.repeat(40),
    instance_id: instanceId || 'not-created-before-execution',
    build_or_image: buildOrImage || 'not-observed-before-execution',
    schema_version_value: schemaVersion || 'not-observed-before-execution',
    dataset_id: datasetId || 'not-observed-before-execution',
    dataset_version: datasetVersion || 'not-observed-before-execution',
    auth_actor_type: 'none-before-execution',
    environment_contract_digest: sha256File(environmentFile),
    ci_contract_digest: sha256File(ciFile),
    checks,
    operations,
    status: 'blocked',
  };
}

function blockedResults({ plan, subjectSha, runId, planFile, environmentFile }) {
  const playwright = plan?.campaign?.adapter === 'playwright';
  return {
    schema_version: 1,
    run_id: runId,
    candidate_sha: subjectSha,
    plan_digest: sha256File(planFile),
    environment_digest: sha256File(environmentFile),
    observation_run_id: runId,
    overall_status: 'blocked',
    toolchain: {
      adapter: plan?.campaign?.adapter || 'unresolved-adapter',
      adapter_version: 'factory-boundary-blocked-v1',
      browser: playwright ? 'not-executed' : 'not_applicable',
      browser_version: playwright ? 'not-executed' : 'not_applicable',
    },
    cases: asArray(plan?.cases).map((testCase) => ({
      id: testCase.id,
      title: testCase?.test_ref?.title || testCase.id,
      outcome: 'blocked',
      attempts: 0,
      user_visible_error: false,
      oracle_results: asArray(testCase?.oracle).map((oracle) => ({ id: oracle.id, outcome: 'blocked', recorded: false })),
      evidence: [],
    })),
    mutations: asArray(plan?.mutations).map((mutation) => ({
      id: mutation.id,
      outcome: 'not_applied',
      cleanup: mutation.cleanup_required === true ? 'pending' : 'not_required',
      cleanup_evidence_ids: [],
    })),
  };
}

try {
  for (const required of ['plan', 'environment', 'ci', 'subject-sha', 'run-id', 'observation-out', 'evidence-root']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const subjectSha = String(args['subject-sha']).toLowerCase();
  if (!SHA_PATTERN.test(subjectSha)) throw new Error('--subject-sha must be a full 40-hex SHA');
  const planFile = containedFile(args.plan, 'acceptance plan');
  const environmentFile = containedFile(args.environment, 'environment contract');
  const ciFile = containedFile(args.ci, 'CI contract');
  const plan = readData(planFile);
  const environment = readData(environmentFile);
  const ci = readData(ciFile);
  const profile = asArray(environment.profiles).find((item) => item.id === plan.environment_profile);
  const findings = [
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validateEnvironment(environment, ci, { file: args.environment }),
    ...validateAcceptancePlan(plan, { file: args.plan, root, checkFiles: true }),
    ...validateCrossContracts({ environment, ci, plan }, { environment: args.environment, ci: args.ci, plan: args.plan }),
  ];
  if (!profile) findings.push({ severity: 'P0', code: 'acceptance-environment-profile-missing', message: 'planned environment profile is absent' });
  if (currentHead(root) !== subjectSha) findings.push({ severity: 'P0', code: 'acceptance-working-revision-mismatch', message: 'repository HEAD differs from the frozen candidate' });
  for (const file of [planFile, environmentFile, ciFile]) {
    const frozen = verifyFileAtRevision(root, file, subjectSha);
    if (!frozen.ok) findings.push({ severity: 'P0', code: 'acceptance-input-not-frozen', message: `${frozen.relative} differs from the frozen candidate` });
  }
  if (plan?.campaign?.adapter === 'manual') findings.push({ severity: 'P0', code: 'acceptance-manual-not-dispatchable', message: 'manual campaigns cannot run in unattended workflow dispatch' });
  findings.push(unavailableExecutionBoundaryFinding('acceptance lifecycle and adapter execution'));
  const secretRefs = asArray(profile?.auth?.secret_refs);
  const networkRequired = profile?.network?.policy === 'allowlist';
  const plannedMutations = asArray(plan?.mutations);
  if (secretRefs.length > 0) findings.push({ severity: 'P0', code: 'acceptance-secret-broker-unavailable', message: 'this installable runner has no isolated secret broker; no declared secret is forwarded to candidate code' });
  if (networkRequired || profile?.network?.policy === 'deny_by_default') findings.push({ severity: 'P0', code: 'acceptance-egress-enforcement-unavailable', message: 'this installable runner has no attestable host egress enforcement, including for deny-by-default profiles' });
  if (plannedMutations.length > 0) findings.push({ severity: 'P0', code: 'acceptance-mutation-broker-unavailable', message: 'this installable runner has no isolated data-mutation broker and blocks mutation campaigns before lifecycle' });
  if (process.env.FACTORY_ACCEPTANCE_CAPABILITY_RECEIPT) findings.push({ severity: 'P0', code: 'acceptance-capability-receipt-unsupported', message: 'a declarative receipt cannot replace missing process isolation, secret brokering or host egress enforcement' });
  if (findings.length) {
    const evidenceRoot = path.resolve(args['evidence-root']);
    const observation = blockedObservation({
      profile,
      ci,
      subjectSha,
      runId: args['run-id'],
      instanceId: args['instance-id'],
      buildOrImage: args['build-or-image'],
      schemaVersion: args['schema-version'],
      datasetId: args['dataset-id'],
      datasetVersion: args['dataset-version'],
      environmentFile,
      ciFile,
    });
    writeData(path.resolve(args['observation-out']), observation);
    writeData(path.join(evidenceRoot, 'results.json'), blockedResults({ plan, subjectSha, runId: args['run-id'], planFile, environmentFile }));
    if (args['lifecycle-out']) writeData(path.resolve(args['lifecycle-out']), {
      schema_version: 1,
      run_id: args['run-id'],
      subject_sha: subjectSha,
      capability_receipt: null,
      lifecycle: [],
      adapter: null,
      boundary: { status: 'blocked', findings: findings.map(({ code, message }) => ({ code, message })) },
    });
    printResult({ title: 'Factory acceptance lifecycle', summary: { findings: findings.length }, findings }, args.json === true);
    process.exit(2);
  }

  const lifecycleEnv = runtimeEnvironment(profile);
  const acceptanceEnv = runtimeEnvironment(profile, { includeProtected: true });
  let ephemeralStorage = null;
  let protectedEnvironmentActivated = false;
  const lifecycle = [];
  let primaryReady = true;
  let observation = null;
  let adapter = null;
  try {
    primaryReady = runRole(ci, profile, 'build', lifecycle, lifecycleEnv);
    if (primaryReady) primaryReady = runBootstrap(ci, plan, lifecycle, lifecycleEnv);
    if (primaryReady) primaryReady = runRole(ci, profile, 'start', lifecycle, lifecycleEnv);
    if (primaryReady && profile?.auth?.mode === 'ephemeral_storage_state') {
      try {
        ephemeralStorage = materializeEphemeralStorage({
          repository: root,
          storageRoot: acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_ROOT,
          storageState: acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_STATE,
          storageStateJson: acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_STATE_JSON,
        });
        acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_ROOT = ephemeralStorage.root;
        acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_STATE = ephemeralStorage.state;
        delete acceptanceEnv.FACTORY_EPHEMERAL_STORAGE_STATE_JSON;
      } catch (error) {
        primaryReady = false;
        findings.push({ severity: 'P0', code: 'acceptance-storage-state-unsafe', message: String(error?.message || error) });
      }
    }
    if (primaryReady) protectedEnvironmentActivated = true;
    if (primaryReady) {
      observation = runPreflight(environment, ci, profile.id, subjectSha, {
        cwd: root,
        env: acceptanceEnv,
        dryRun: false,
        runId: args['run-id'],
        instanceId: args['instance-id'],
        buildOrImage: args['build-or-image'],
        schemaVersion: args['schema-version'],
        datasetId: args['dataset-id'],
        datasetVersion: args['dataset-version'],
        environmentContractDigest: sha256File(environmentFile),
        ciContractDigest: sha256File(ciFile),
      });
      writeData(path.resolve(args['observation-out']), observation);
      const observationFindings = validateEnvironmentObservation(observation, { environment, ci });
      if (observationFindings.length) {
        findings.push(...observationFindings);
        primaryReady = false;
      }
    }
    if (primaryReady) {
      const script = plan.campaign.adapter === 'playwright'
        ? 'scripts/adapters/playwright/run.mjs'
        : 'scripts/adapters/command/run.mjs';
      const adapterArgs = [
        controllerFile(script, `${plan.campaign.adapter} adapter`),
        '--root', root,
        '--plan', planFile,
        '--environment', environmentFile,
        '--ci', ciFile,
        '--observation', path.resolve(args['observation-out']),
        '--subject-sha', subjectSha,
        '--run-id', args['run-id'],
        '--evidence-root', path.resolve(args['evidence-root']),
        '--defer-cleanup',
        '--json',
      ];
      if (plan.campaign.adapter === 'playwright' && args['playwright-config']) adapterArgs.push('--config', containedFile(args['playwright-config'], 'Playwright config'));
      const result = spawnSync(process.execPath, adapterArgs, {
        cwd: root,
        env: { ...acceptanceEnv },
        encoding: 'utf8',
        timeout: 2_000_000,
        maxBuffer: 64 * 1024 * 1024,
        shell: false,
      });
      adapter = { adapter: plan.campaign.adapter, exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
      if (result.status !== 0) findings.push({ severity: 'P0', code: 'acceptance-adapter-failed', message: `${plan.campaign.adapter} adapter did not complete successfully` });
    }
  } catch (error) {
    primaryReady = false;
    lifecycle.push({ role: 'lifecycle_exception', outcome: 'fail', exit_code: null, error: String(error?.message || error) });
    findings.push({ severity: 'P0', code: 'acceptance-lifecycle-exception', message: String(error?.message || error) });
  } finally {
    try {
      if (!runMutationCleanups({ root, ci, plan, lifecycle, env: protectedEnvironmentActivated ? acceptanceEnv : lifecycleEnv, evidenceRoot: path.resolve(args['evidence-root']) })) findings.push({ severity: 'P0', code: 'acceptance-mutation-cleanup-failed', message: 'one or more declared mutation cleanup operations did not complete successfully' });
    } catch (error) {
      lifecycle.push({ role: 'mutation_cleanup', outcome: 'fail', exit_code: null, error: String(error?.message || error) });
      findings.push({ severity: 'P0', code: 'acceptance-mutation-cleanup-failed', message: String(error?.message || error) });
    }
    for (const role of ['reset', 'stop']) {
      try {
        if (!runRole(ci, profile, role, lifecycle, lifecycleEnv)) findings.push({ severity: 'P0', code: `acceptance-${role}-failed`, message: `environment ${role} failed` });
      } catch (error) {
        lifecycle.push({ role, operation_id: profile?.operations?.[role] || null, outcome: 'fail', exit_code: null, error: String(error?.message || error) });
        findings.push({ severity: 'P0', code: `acceptance-${role}-failed`, message: String(error?.message || error) });
      }
    }
    if (ephemeralStorage?.materialized) {
      const cleaned = ephemeralStorage.cleanup();
      lifecycle.push({ role: 'ephemeral_storage_cleanup', outcome: cleaned ? 'pass' : 'fail', exit_code: cleaned ? 0 : 1 });
      if (!cleaned) findings.push({ severity: 'P0', code: 'acceptance-storage-cleanup-failed', message: 'materialized browser storage state could not be removed completely' });
    }
  }
  if (!primaryReady) findings.push({ severity: 'P0', code: 'acceptance-lifecycle-not-ready', message: 'build, bootstrap, start or preflight did not complete successfully' });
  if (args['lifecycle-out']) writeData(path.resolve(args['lifecycle-out']), {
    schema_version: 1,
    run_id: args['run-id'],
    subject_sha: subjectSha,
    capability_receipt: null,
    lifecycle,
    adapter,
  });
  printResult({ title: 'Factory acceptance lifecycle', summary: { status: findings.length ? 'blocked' : 'passed', findings: findings.length }, lifecycle, adapter, findings }, args.json === true);
  process.exit(findings.length ? 2 : 0);
} catch (error) {
  printResult({ title: 'Factory acceptance lifecycle', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-acceptance-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
