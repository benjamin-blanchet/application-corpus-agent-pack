#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  SHA_PATTERN,
  asArray,
  parseArgs,
  printResult,
  resolveContainedRegularFile,
  sha256File,
} from '../../lib/factory-delivery/core.mjs';
import { readData, writeData } from '../../lib/factory-delivery/files.mjs';
import { unavailableExecutionBoundaryFinding } from '../../lib/factory-delivery/execution-boundary.mjs';
import { applyVerifiedCapabilityContext, readVerifiedCapabilityContext } from '../../lib/factory-delivery/capabilities.mjs';
import { executeOperation } from '../../lib/factory-delivery/operations.mjs';
import { currentHead, verifyFileAtRevision } from '../../lib/factory-delivery/provenance.mjs';
import {
  validateAcceptancePlan,
  validateAcceptanceResults,
  validateEnvironment,
  validateEnvironmentObservation,
  validateFactoryCi,
} from '../../lib/factory-delivery/validation.mjs';
import { parseStructuredTestResults } from './results.mjs';

const args = parseArgs(process.argv.slice(2));
const root = fs.realpathSync(path.resolve(args.root || process.cwd()));

function repositoryFile(value, label) {
  try {
    return resolveContainedRegularFile(root, path.resolve(root, value)).absolute;
  } catch (error) {
    throw new Error(`${label} must be a contained regular repository file: ${error.message}`);
  }
}

function prepareOutputDirectory(value) {
  const target = path.resolve(value);
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error('evidence root must be a real directory');
    if (fs.readdirSync(target).length) throw new Error('evidence root must be empty');
    return fs.realpathSync(target);
  }
  const parent = path.dirname(target);
  if (!fs.existsSync(parent) || fs.lstatSync(parent).isSymbolicLink() || !fs.statSync(parent).isDirectory()) throw new Error('evidence root parent must be a real existing directory');
  const realParent = fs.realpathSync(parent);
  fs.mkdirSync(path.join(realParent, path.basename(target)));
  return fs.realpathSync(path.join(realParent, path.basename(target)));
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '-');
}

try {
  for (const required of ['plan', 'environment', 'ci', 'observation', 'subject-sha', 'run-id', 'evidence-root']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const subjectSha = String(args['subject-sha']).toLowerCase();
  if (!SHA_PATTERN.test(subjectSha)) throw new Error('--subject-sha must be a full 40-hex SHA');
  const planFile = repositoryFile(args.plan, 'acceptance plan');
  const environmentFile = repositoryFile(args.environment, 'environment contract');
  const ciFile = repositoryFile(args.ci, 'CI contract');
  const observationFile = path.resolve(args.observation);
  if (!fs.existsSync(observationFile) || fs.lstatSync(observationFile).isSymbolicLink() || !fs.statSync(observationFile).isFile()) throw new Error('observation must be a real file');
  const plan = readData(planFile);
  const environment = readData(environmentFile);
  const ci = readData(ciFile);
  const observation = readData(observationFile);
  const operationId = plan?.campaign?.operation;
  const findings = [
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validateEnvironment(environment, ci, { file: args.environment }),
    ...validateAcceptancePlan(plan, { file: args.plan, root, checkFiles: true }),
    ...validateEnvironmentObservation(observation, { environment, ci }),
  ];
  if (plan?.campaign?.adapter !== 'command') findings.push({ severity: 'P0', code: 'command-adapter-not-selected', message: 'acceptance plan does not select the command adapter' });
  findings.push(unavailableExecutionBoundaryFinding('direct command adapter execution'));
  if (typeof operationId !== 'string' || !ci?.operations?.[operationId]) findings.push({ severity: 'P0', code: 'command-operation-missing', message: 'campaign.operation must name a declared CI operation' });
  else if (ci.operations[operationId].side_effect !== 'none') findings.push({ severity: 'P0', code: 'command-operation-side-effect', message: 'command acceptance operation must be side-effect-free' });
  if (asArray(plan?.mutations).length) findings.push({ severity: 'P0', code: 'command-mutation-unsupported', message: 'the command adapter does not infer mutation or cleanup evidence' });
  if (observation?.run_id !== args['run-id']) findings.push({ severity: 'P0', code: 'command-observation-run-mismatch', message: 'observation run_id differs from --run-id' });
  if (observation?.subject_sha?.toLowerCase() !== subjectSha) findings.push({ severity: 'P0', code: 'command-observation-sha-mismatch', message: 'observation subject differs from --subject-sha' });
  if (observation?.environment_contract_digest !== sha256File(environmentFile)) findings.push({ severity: 'P0', code: 'command-environment-digest-mismatch', message: 'observation environment digest differs from the supplied contract' });
  if (observation?.ci_contract_digest !== sha256File(ciFile)) findings.push({ severity: 'P0', code: 'command-ci-digest-mismatch', message: 'observation CI digest differs from the supplied contract' });
  if (currentHead(root) !== subjectSha) findings.push({ severity: 'P0', code: 'command-working-revision-mismatch', message: 'repository HEAD differs from the frozen subject SHA' });
  for (const file of [planFile, environmentFile, ciFile, ...asArray(plan?.cases).map((item) => repositoryFile(item.test_ref.path, `${item.id} test reference`))]) {
    const frozen = verifyFileAtRevision(root, file, subjectSha);
    if (!frozen.ok) findings.push({ severity: 'P0', code: 'command-input-not-frozen', message: `${frozen.relative} differs from the frozen revision` });
  }
  if (findings.length) {
    printResult({ title: 'Factory command adapter', summary: { findings: findings.length }, findings }, args.json === true);
    process.exit(2);
  }

  const evidenceRoot = prepareOutputDirectory(args['evidence-root']);
  const profile = asArray(environment.profiles).find((item) => item.id === plan.environment_profile);
  const allowedEnvironmentNames = new Set([
    'PATH', 'SystemRoot', 'TMPDIR', 'TMP', 'TEMP', 'CI',
    profile?.endpoint?.not_applicable === true ? null : profile?.endpoint?.base_url_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_id_from,
    profile?.data?.not_applicable === true ? null : profile?.data?.dataset_version_from,
  ].filter(Boolean));
  const env = Object.fromEntries([...allowedEnvironmentNames].filter((key) => Object.hasOwn(process.env, key)).map((key) => [key, process.env[key]]));
  const startedAt = new Date().toISOString();
  const executed = executeOperation(ci, operationId, { cwd: root, env, dryRun: false, allowedSideEffects: ['none'] });
  const combinedOutput = [executed.stdout, executed.stderr].filter(Boolean).join('\n');
  const structuredResults = parseStructuredTestResults(combinedOutput);
  const cases = [];
  for (const testCase of asArray(plan.cases)) {
    const titleObserved = structuredResults.get(testCase.test_ref.title) === 'passed';
    const oracleResults = asArray(testCase.oracle).map((oracle) => {
      const markerObserved = typeof oracle.record_marker === 'string' && structuredResults.get(oracle.record_marker) === 'passed';
      return { id: oracle.id, outcome: executed.outcome === 'pass' && markerObserved ? 'pass' : 'fail', recorded: true };
    });
    const passed = executed.outcome === 'pass' && titleObserved && oracleResults.length > 0 && oracleResults.every((oracle) => oracle.outcome === 'pass');
    const evidence = [];
    for (const requirement of asArray(testCase?.evidence?.required)) {
      if (!['log', 'report', 'file'].includes(requirement.type)) throw new Error(`${testCase.id}.${requirement.id}: command adapter supports only log, report and file evidence`);
      const relative = `${safeId(testCase.id)}-${safeId(requirement.id)}.txt`;
      fs.writeFileSync(path.join(evidenceRoot, relative), combinedOutput || '<command produced no output>\n', { encoding: 'utf8', flag: 'wx' });
      evidence.push({
        id: `${safeId(testCase.id)}-${safeId(requirement.id)}`,
        requirement_id: requirement.id,
        type: requirement.type,
        checkpoint: requirement.checkpoint,
        path: relative,
        media_type: 'text/plain',
      });
    }
    cases.push({
      id: testCase.id,
      title: testCase.test_ref.title,
      outcome: passed ? 'pass' : 'fail',
      attempts: 1,
      user_visible_error: false,
      oracle_results: oracleResults,
      evidence,
    });
  }
  const results = applyVerifiedCapabilityContext({
    schema_version: 1,
    run_id: args['run-id'],
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    candidate_sha: subjectSha,
    plan_digest: sha256File(planFile),
    environment_digest: sha256File(environmentFile),
    observation_run_id: observation.run_id,
    overall_status: executed.outcome === 'pass' && cases.every((item) => item.outcome === 'pass') ? 'passed' : 'failed',
    toolchain: { adapter: 'command', adapter_version: 'factory-command-v1', browser: 'not_applicable', browser_version: 'not_applicable' },
    cases,
    mutations: [],
    raw_artifacts: [],
  }, plan, readVerifiedCapabilityContext());
  const resultFindings = validateAcceptanceResults(results, {
    subjectSha,
    observationRunId: observation.run_id,
    planDigest: sha256File(planFile),
    environmentDigest: sha256File(environmentFile),
    plan,
    environmentProfile: profile,
    ci,
    deferCleanup: args['defer-cleanup'] === true,
  });
  writeData(path.join(evidenceRoot, 'results.json'), results);
  const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const failures = cases.filter((item) => item.outcome !== 'pass');
  const junit = [
    `<testsuite name="factory-command" tests="${cases.length}" failures="${failures.length}">`,
    ...cases.map((item) => `  <testcase name="${xml(item.title)}">${item.outcome === 'pass' ? '' : '<failure message="command or exact title failed"/>'}</testcase>`),
    '</testsuite>',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(evidenceRoot, 'junit.xml'), junit, { encoding: 'utf8', flag: 'wx' });
  fs.mkdirSync(path.join(evidenceRoot, 'html-report'));
  fs.writeFileSync(path.join(evidenceRoot, 'html-report', 'index.html'), `<!doctype html><meta charset="utf-8"><title>Factory command acceptance</title><h1>${xml(results.overall_status)}</h1><ul>${cases.map((item) => `<li>${xml(item.id)}: ${xml(item.outcome)}</li>`).join('')}</ul>\n`, { encoding: 'utf8', flag: 'wx' });
  printResult({ title: 'Factory command adapter', summary: { status: results.overall_status, findings: resultFindings.length }, results: args.json === true ? results : undefined, findings: resultFindings }, args.json === true);
  process.exit(resultFindings.length || results.overall_status !== 'passed' ? 2 : 0);
} catch (error) {
  printResult({ title: 'Factory command adapter', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-command-adapter-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
