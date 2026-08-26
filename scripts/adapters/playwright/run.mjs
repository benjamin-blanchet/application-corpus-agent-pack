#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { SHA_PATTERN, asArray, isWithin, parseArgs, printResult, sha256File } from '../../lib/factory-delivery/core.mjs';
import { readData } from '../../lib/factory-delivery/files.mjs';
import { currentHead, verifyFileAtRevision } from '../../lib/factory-delivery/provenance.mjs';
import { validatePlaywrightSource } from './policy.mjs';
import { validateAcceptancePlan, validateAcceptanceResults, validateEnvironment, validateEnvironmentObservation, validateFactoryCi } from '../../lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());

function resolvePlaywrightCli() {
  const requireFromProject = createRequire(path.join(root, 'package.json'));
  try {
    return { cli: requireFromProject.resolve('@playwright/test/cli'), version: requireFromProject('@playwright/test/package.json').version };
  } catch {
    try {
      const packageFile = requireFromProject.resolve('@playwright/test/package.json');
      return { cli: path.resolve(path.dirname(packageFile), 'cli.js'), version: JSON.parse(fs.readFileSync(packageFile, 'utf8')).version };
    } catch {
      throw new Error('@playwright/test is not installed in the application repository');
    }
  }
}

try {
  for (const required of ['plan', 'environment', 'ci', 'observation', 'config', 'subject-sha', 'run-id']) if (!args[required]) throw new Error(`--${required} is required`);
  if (!SHA_PATTERN.test(args['subject-sha'])) throw new Error('--subject-sha must be a full 40-hex SHA');
  const planFile = path.resolve(root, args.plan);
  const environmentFile = path.resolve(root, args.environment);
  const ciFile = path.resolve(root, args.ci);
  const observationFile = path.resolve(root, args.observation);
  const configFile = path.resolve(root, args.config);
  const plan = readData(planFile);
  const environment = readData(environmentFile);
  const ci = readData(ciFile);
  const observation = readData(observationFile);
  const profile = asArray(environment?.profiles).find((candidate) => candidate?.id === plan?.environment_profile);
  const planDigest = sha256File(planFile);
  const environmentDigest = sha256File(environmentFile);
  const ciDigest = sha256File(ciFile);
  const findings = [
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validateEnvironment(environment, ci, { file: args.environment }),
    ...validateAcceptancePlan(plan, { file: args.plan, root, checkFiles: true }),
  ];
  findings.push(...validateEnvironmentObservation(observation, { provenanceWaiver: plan?.subject?.provenance_waiver || null, environment, ci }));
  if (observation?.run_id !== args['run-id']) findings.push({ severity: 'P0', code: 'playwright-observation-run-mismatch', message: 'observation run_id differs from --run-id' });
  if (observation?.subject_sha?.toLowerCase() !== args['subject-sha'].toLowerCase()) findings.push({ severity: 'P0', code: 'playwright-observation-sha-mismatch', message: 'observation subject differs from --subject-sha' });
  if (observation?.environment_contract_digest !== environmentDigest) findings.push({ severity: 'P0', code: 'playwright-environment-digest-mismatch', message: 'observation environment digest differs from the supplied contract' });
  if (observation?.ci_contract_digest !== ciDigest) findings.push({ severity: 'P0', code: 'playwright-ci-digest-mismatch', message: 'observation CI digest differs from the supplied contract' });
  if (currentHead(root) !== args['subject-sha'].toLowerCase()) findings.push({ severity: 'P0', code: 'playwright-working-revision-mismatch', message: 'repository HEAD differs from the frozen subject SHA' });
  if (plan?.campaign?.adapter !== 'playwright') findings.push({ severity: 'P0', code: 'playwright-adapter-not-selected', message: 'acceptance plan does not select the Playwright adapter' });
  if (!profile) findings.push({ severity: 'P0', code: 'playwright-environment-profile-missing', message: 'planned environment profile is absent from the environment contract' });
  if (profile?.endpoint?.not_applicable === true) findings.push({ severity: 'P0', code: 'playwright-endpoint-missing', message: 'Playwright requires a concrete preflighted endpoint' });
  if (profile?.endpoint?.base_url_from && !process.env[profile.endpoint.base_url_from]) findings.push({ severity: 'P0', code: 'playwright-base-url-missing', message: `runtime environment is missing ${profile.endpoint.base_url_from}` });
  for (const ref of asArray(profile?.auth?.secret_refs)) if (!process.env[ref]) findings.push({ severity: 'P0', code: 'playwright-secret-reference-missing', message: `runtime environment is missing declared secret reference ${ref}` });
  const ephemeralStorageState = process.env.FACTORY_EPHEMERAL_STORAGE_STATE;
  if (ephemeralStorageState) {
    const storagePath = path.resolve(ephemeralStorageState);
    try {
      if (profile?.auth?.mode !== 'ephemeral_storage_state') throw new Error('environment profile does not authorize ephemeral storage state');
      if (isWithin(root, storagePath)) throw new Error('ephemeral storage state must remain outside the repository');
      if (!fs.existsSync(storagePath) || fs.lstatSync(storagePath).isSymbolicLink() || !fs.statSync(storagePath).isFile()) throw new Error('ephemeral storage state must be a real external file');
      if ((fs.statSync(storagePath).mode & 0o077) !== 0) throw new Error('ephemeral storage state must not be group/world accessible');
    } catch (error) {
      findings.push({ severity: 'P0', code: 'playwright-storage-state-unsafe', message: error.message });
    }
  }
  if (!fs.existsSync(configFile)) findings.push({ severity: 'P0', code: 'playwright-config-missing', message: `config does not exist: ${args.config}` });
  for (const file of [planFile, environmentFile, ciFile, configFile, ...asArray(plan.cases).map((testCase) => path.resolve(root, testCase.test_ref.path))]) {
    if (!fs.existsSync(file)) continue;
    try {
      const revision = verifyFileAtRevision(root, file, args['subject-sha']);
      if (!revision.ok) findings.push({ severity: 'P0', code: 'playwright-input-not-frozen', message: `${revision.relative} differs from the frozen revision` });
    } catch (error) {
      findings.push({ severity: 'P0', code: 'playwright-input-not-frozen', message: error.message });
    }
  }
  for (const testFile of [...new Set(asArray(plan.cases).map((testCase) => path.resolve(root, testCase.test_ref.path)))]) {
    if (fs.existsSync(testFile)) findings.push(...validatePlaywrightSource(fs.readFileSync(testFile, 'utf8'), { file: path.relative(root, testFile) }));
  }
  if (findings.length) {
    printResult({ title: 'Factory Playwright adapter', summary: { findings: findings.length }, findings }, args.json === true);
    process.exit(2);
  }
  const playwright = resolvePlaywrightCli();
  const evidenceRoot = path.resolve(root, args['evidence-root'] || 'factory-evidence');
  const resultsPath = path.resolve(root, args.results || path.join(evidenceRoot, 'results.json'));
  if (fs.existsSync(resultsPath)) throw new Error(`results path already exists; use an empty run directory: ${path.relative(root, resultsPath)}`);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const tests = [...new Set(asArray(plan.cases).map((testCase) => testCase.test_ref.path))];
  const commandArgs = [playwright.cli, 'test', ...tests, '--config', configFile];
  if (args['list-only'] === true) commandArgs.push('--list');
  const allowedEnvironmentNames = new Set([
    'PATH', 'SystemRoot', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'CI', 'PLAYWRIGHT_BROWSERS_PATH',
    profile?.endpoint?.base_url_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_id_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_version_from,
    ...asArray(profile?.auth?.secret_refs),
  ].filter(Boolean));
  const env = {
    ...Object.fromEntries([...allowedEnvironmentNames].filter((key) => Object.hasOwn(process.env, key)).map((key) => [key, process.env[key]])),
    FACTORY_BASE_URL: process.env[profile.endpoint.base_url_from],
    ...(profile?.data?.not_applicable === true ? {} : {
      [profile.data.dataset_id_from]: observation.dataset_id,
      [profile.data.dataset_version_from]: observation.dataset_version,
    }),
    FACTORY_ACCEPTANCE_PLAN: planFile,
    FACTORY_EVIDENCE_ROOT: evidenceRoot,
    FACTORY_RESULTS_PATH: resultsPath,
    FACTORY_SUBJECT_SHA: args['subject-sha'].toLowerCase(),
    FACTORY_RUN_ID: args['run-id'] || `playwright-${Date.now()}`,
    FACTORY_PLAN_DIGEST: planDigest,
    FACTORY_ENVIRONMENT_DIGEST: environmentDigest,
    FACTORY_OBSERVATION_RUN_ID: observation.run_id,
    FACTORY_ADAPTER_VERSION: playwright.version,
    FACTORY_LOCAL_SELF_SIGNED: profile.endpoint.tls === 'local_self_signed' ? 'true' : 'false',
    ...(ephemeralStorageState ? { FACTORY_EPHEMERAL_STORAGE_STATE: path.resolve(ephemeralStorageState) } : {}),
  };
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: Number(args['timeout-seconds'] || 1800) * 1000,
    shell: false,
    stdio: args.json === true ? 'pipe' : 'inherit',
  });
  if (args['list-only'] !== true && !fs.existsSync(resultsPath)) throw new Error('Playwright completed without producing the factory results file');
  const resultFindings = args['list-only'] === true ? [] : validateAcceptanceResults(readData(resultsPath), {
    subjectSha: args['subject-sha'],
    observationRunId: observation.run_id,
    planDigest,
    environmentDigest,
    plan,
    provenanceWaiver: plan?.subject?.provenance_waiver || null,
  });
  const exitCode = result.status === 0 && resultFindings.length === 0 ? 0 : 2;
  if (args.json === true) printResult({
    title: 'Factory Playwright adapter',
    summary: { exit_code: result.status, evidence_root: evidenceRoot },
    findings: [...(result.status === 0 ? [] : [{ severity: 'P0', code: 'playwright-campaign-failed', message: 'one or more Playwright cases failed' }]), ...resultFindings],
    stdout: result.stdout,
    stderr: result.stderr,
  }, true);
  process.exit(exitCode);
} catch (error) {
  printResult({ title: 'Factory Playwright adapter', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'playwright-adapter-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
