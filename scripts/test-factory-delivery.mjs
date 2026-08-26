#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import FactoryEvidenceReporter from './adapters/playwright/reporter.mjs';
import { OUTCOMES, canonicalizeCaseOutcome, sha256Object } from './lib/factory-delivery/core.mjs';
import { assembleEvidence } from './lib/factory-delivery/evidence.mjs';
import { readData } from './lib/factory-delivery/files.mjs';
import { sourceTreeDigest, verifyEvidenceOnlyCommit } from './lib/factory-delivery/provenance.mjs';
import { renderEvidenceReport } from './lib/factory-delivery/report.mjs';
import {
  validateAcceptancePlan,
  validateEnvironment,
  validateEnvironmentObservation,
  validateEvidence,
  validateFactoryCi,
  validatePrDraft,
} from './lib/factory-delivery/validation.mjs';
import { parseYaml, stringifyYaml, YamlSyntaxError } from './lib/factory-delivery/yaml.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repository, 'scripts/fixtures/factory-delivery');
const subjectSha = 'a'.repeat(40);
const sourceDigest = `sha256:${'1'.repeat(64)}`;
const tempRoots = [];
const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function temporary(prefix = 'factory-delivery-') {
  const created = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(created);
  return created;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(name) {
  return readData(path.join(fixtureRoot, name));
}

function codes(findings) {
  return new Set(findings.map((item) => item.code));
}

function expectCode(findings, code) {
  assert.ok(codes(findings).has(code), `expected ${code}; got ${[...codes(findings)].join(', ') || '<none>'}`);
}

function runNode(script, args, options = {}) {
  return spawnSync(process.execPath, [path.join(repository, script), ...args], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...options.env },
  });
}

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function buildEvidence({ plan = fixture('acceptance-plan.yaml'), observation = fixture('observation.json'), results = fixture('results.json'), artifactText = null } = {}) {
  const artifactsRoot = temporary('factory-evidence-artifacts-');
  fs.copyFileSync(path.join(fixtureRoot, 'evidence/CASE-001.txt'), path.join(artifactsRoot, 'CASE-001.txt'));
  if (artifactText !== null) fs.writeFileSync(path.join(artifactsRoot, 'CASE-001.txt'), artifactText, 'utf8');
  const canonicalPlan = fixture('acceptance-plan.yaml');
  const canonical = JSON.stringify(plan) === JSON.stringify(canonicalPlan);
  if (!canonical) results.plan_digest = sha256Object(plan);
  const assembled = assembleEvidence({
    plan,
    environment: fixture('environment.yaml'),
    observation,
    results,
    artifactsRoot,
    repository,
    subjectSha,
    sourceDigest,
    specPackage: 'scripts/fixtures/factory-delivery',
    environmentContractPath: path.join(fixtureRoot, 'environment.yaml'),
    acceptancePlanPath: canonical ? path.join(fixtureRoot, 'acceptance-plan.yaml') : null,
    publication: {
      mode: 'ci_artifact',
      ci_run_id: 'fixture-ci-run',
      artifact_id: 'fixture-artifact',
      artifact_url: 'https://ci.example.invalid/runs/fixture-ci-run/artifacts/fixture-artifact',
      retention_days: 30,
    },
  });
  return { ...assembled, artifactsRoot };
}

test('the stack-neutral fixture contracts validate together', () => {
  const ci = fixture('ci.yaml');
  const environment = fixture('environment.yaml');
  const plan = fixture('acceptance-plan.yaml');
  const pr = fixture('pr-draft.yaml');
  assert.deepEqual(validateFactoryCi(ci), []);
  assert.deepEqual(validateEnvironment(environment, ci), []);
  assert.deepEqual(validateAcceptancePlan(plan, { root: repository, checkFiles: true }), []);
  assert.deepEqual(validatePrDraft(pr, ci), []);

  const result = runNode('scripts/validate-delivery.mjs', [
    '--package', 'scripts/fixtures/factory-delivery',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--json',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).summary.findings, 0);
});

test('the bounded YAML reader is deterministic and handles BOM, CRLF and Unicode', () => {
  const scenarios = fixture('scenarios.json');
  const source = `\uFEFFversion: 1\r\ntitle: "${scenarios.bom_crlf_unicode.expected_title}"\r\nitems: [one, two]\r\n`;
  const parsed = parseYaml(source, { source: 'bom-fixture.yaml' });
  assert.equal(parsed.title, scenarios.bom_crlf_unicode.expected_title);
  assert.deepEqual(parseYaml(stringifyYaml(parsed)), parsed);
  assert.deepEqual(parseYaml(stringifyYaml(fixture('acceptance-plan.yaml'))), fixture('acceptance-plan.yaml'));
  assert.throws(() => parseYaml('version: 1\nversion: 2\n'), YamlSyntaxError);
});

test('the public case vocabulary is canonical and retry-only success is failed', () => {
  assert.deepEqual([...OUTCOMES], ['passed', 'failed', 'blocked', 'skipped', 'waived']);
  assert.deepEqual(canonicalizeCaseOutcome('pass', 1), { outcome: 'passed', reason: null });
  assert.deepEqual(canonicalizeCaseOutcome('pass', 2), { outcome: 'failed', reason: 'flaky_retry' });
  assert.deepEqual(canonicalizeCaseOutcome('error', 1), { outcome: 'failed', reason: null });
});

test('preflight observations block schema drift, expired credentials and changed datasets', () => {
  const scenarios = fixture('scenarios.json');
  for (const name of ['schema_drift', 'expired_credential_post_commit', 'external_dataset_changed']) {
    const scenario = scenarios[name];
    const observation = fixture('observation.json');
    const check = observation.checks.find((item) => item.kind === scenario.check_kind);
    check.outcome = 'fail';
    check.message = `synthetic ${name}`;
    expectCode(validateEnvironmentObservation(observation), scenario.expected_code);
    expectCode(validateEnvironmentObservation(observation), 'environment-false-ready');
  }
});

test('an automated profile cannot rely on interactive authentication', () => {
  const scenarios = fixture('scenarios.json');
  const ci = fixture('ci.yaml');
  const environment = fixture('environment.yaml');
  environment.profiles[0].auth.mode = 'interactive';
  environment.profiles[0].auth.automated_compatible = false;
  expectCode(validateEnvironment(environment, ci), scenarios.interactive_auth.expected_code);
});

test('evidence assembly produces a ready, hash-verifiable manifest and factual report', () => {
  const { manifest, findings, artifactsRoot } = buildEvidence();
  assert.deepEqual(findings, []);
  assert.equal(manifest.verdict, 'ready');
  assert.equal(manifest.subject.head_sha, subjectSha);
  assert.equal(manifest.subject.tested_sha, subjectSha);
  assert.equal(manifest.publication.mode, 'ci_artifact');
  assert.equal(Object.hasOwn(manifest.subject, 'evidence_commit_sha'), false);
  assert.match(manifest.artifacts[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(validateEvidence(manifest, fixture('acceptance-plan.yaml'), { artifactsRoot, verifyArtifacts: true }), []);
  const report = renderEvidenceReport(manifest);
  assert.match(report, new RegExp(subjectSha));
  assert.match(report, /CASE-001-fixture-state/);
  assert.match(report, /\*\*READY\*\*/);

  fs.appendFileSync(path.join(artifactsRoot, 'CASE-001.txt'), 'tampered\n', 'utf8');
  expectCode(validateEvidence(manifest, fixture('acceptance-plan.yaml'), { artifactsRoot, verifyArtifacts: true }), 'evidence-artifact-hash-mismatch');
});

test('a passing label cannot hide failed or absent oracles', () => {
  const { manifest } = buildEvidence();
  const failedOracle = clone(manifest);
  failedOracle.cases[0].oracle_results[0].outcome = 'failed';
  expectCode(validateEvidence(failedOracle, fixture('acceptance-plan.yaml')), 'evidence-false-pass');

  const absentOracle = clone(manifest);
  absentOracle.cases[0].oracle_results = [];
  expectCode(validateEvidence(absentOracle, fixture('acceptance-plan.yaml')), 'evidence-oracle-result-missing');
});

test('stale revision, missing evidence, flaky retry and pending cleanup all block readiness', () => {
  const scenarios = fixture('scenarios.json');
  const golden = buildEvidence().manifest;

  const stale = clone(golden);
  stale.subject.tested_sha = scenarios.stale_subject_sha.other_sha;
  expectCode(validateEvidence(stale, fixture('acceptance-plan.yaml')), scenarios.stale_subject_sha.expected_code);

  const missing = clone(golden);
  missing.artifacts = [];
  expectCode(validateEvidence(missing, fixture('acceptance-plan.yaml')), scenarios.missing_evidence.expected_code);

  const retryResults = fixture('results.json');
  retryResults.cases[0].attempts = scenarios.flaky_retry_pass.attempts;
  const retry = buildEvidence({ results: retryResults });
  assert.equal(retry.manifest.cases[0].outcome, 'failed');
  assert.equal(retry.manifest.cases[0].reason, 'flaky_retry');
  assert.equal(retry.manifest.verdict, 'blocked');
  expectCode(retry.findings, scenarios.flaky_retry_pass.expected_code);

  const pending = clone(golden);
  pending.mutations[0].cleanup = 'pending';
  expectCode(validateEvidence(pending, fixture('acceptance-plan.yaml')), scenarios.shared_data_not_cleaned.expected_code);
});

test('partial coverage, empty campaigns and persisted generation findings cannot be ready', () => {
  const scenarios = fixture('scenarios.json');
  const plan = fixture('acceptance-plan.yaml');
  plan.criteria.push({ id: 'AC-002', cases: ['CASE-002'] });
  plan.cases.push({
    id: 'CASE-002',
    criteria: ['AC-002'],
    test_ref: { path: 'scripts/fixtures/factory-delivery/tests/feature.spec.mjs', title: 'CASE-002 fixture behaviour' },
    preconditions: ['environment-ready'],
    oracle: [{ id: 'fixture-oracle-2', type: 'file', assertion: 'executable' }],
    evidence: { required: [] },
    mutations: [],
  });
  const golden = buildEvidence().manifest;
  expectCode(validateEvidence(golden, plan), scenarios.partial_case_coverage.expected_code);

  const empty = clone(golden);
  empty.cases = [];
  empty.summary = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  expectCode(validateEvidence(empty, null), 'evidence-false-pass');

  const unresolved = clone(golden);
  unresolved.generation_findings = [{ code: 'synthetic-unresolved', message: 'synthetic unresolved fact' }];
  expectCode(validateEvidence(unresolved, null), 'synthetic-unresolved');
  expectCode(validateEvidence(unresolved, null), 'evidence-false-pass');
});

test('secret and PII minimization blocks unsafe evidence artifacts', () => {
  const unsafe = buildEvidence({ artifactText: 'operator=someone@example.invalid\n' });
  assert.equal(unsafe.manifest.verdict, 'blocked');
  expectCode(unsafe.findings, 'evidence-possible-email');

  const results = fixture('results.json');
  results.cases[0].evidence[0].path = 'storage-state.json';
  const artifactsRoot = temporary('factory-sensitive-artifacts-');
  fs.writeFileSync(path.join(artifactsRoot, 'storage-state.json'), '{}\n', 'utf8');
  const assembled = assembleEvidence({
    plan: fixture('acceptance-plan.yaml'),
    environment: fixture('environment.yaml'),
    observation: fixture('observation.json'),
    results,
    artifactsRoot,
    repository,
    subjectSha,
    sourceDigest,
  });
  expectCode(assembled.findings, 'evidence-sensitive-artifact');
});

test('provenance accepts evidence-only commits and rejects source changes', () => {
  const scenarios = fixture('scenarios.json');
  const repo = temporary('factory-provenance-');
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'Fixture']);
  fs.writeFileSync(path.join(repo, 'application.txt'), 'source-v1\n', 'utf8');
  git(repo, ['add', 'application.txt']);
  git(repo, ['commit', '--quiet', '-m', 'subject']);
  const subject = git(repo, ['rev-parse', 'HEAD']);

  fs.mkdirSync(path.join(repo, 'evidence'));
  fs.writeFileSync(path.join(repo, 'evidence/manifest.yaml'), 'verdict: ready\n', 'utf8');
  git(repo, ['add', 'evidence/manifest.yaml']);
  git(repo, ['commit', '--quiet', '-m', 'evidence']);
  const evidence = git(repo, ['rev-parse', 'HEAD']);
  assert.equal(verifyEvidenceOnlyCommit(repo, subject, evidence, ['evidence']).ok, true);

  fs.writeFileSync(path.join(repo, 'application.txt'), 'source-v2\n', 'utf8');
  git(repo, ['add', 'application.txt']);
  git(repo, ['commit', '--quiet', '-m', 'source changed after test']);
  const changed = git(repo, ['rev-parse', 'HEAD']);
  const check = verifyEvidenceOnlyCommit(repo, subject, changed, ['evidence']);
  assert.equal(check.ok, false);
  assert.equal(check.code, scenarios.review_scope_incomplete.expected_code);
  assert.deepEqual(check.forbidden, ['application.txt']);
});

test('the PR contract keeps all delivery authority narrow', () => {
  const scenarios = fixture('scenarios.json');
  const contract = fixture('pr-draft.yaml');
  contract.forbidden_actions = contract.forbidden_actions.filter((action) => action !== 'merge');
  expectCode(validatePrDraft(contract, fixture('ci.yaml')), scenarios.unauthorized_pr_operation.expected_code);
});

test('draft PR execution verifies the remote head through GitHub API only', () => {
  const source = fs.readFileSync(path.join(repository, 'scripts/factory-pr.mjs'), 'utf8');
  assert.equal(source.includes("['ls-remote'"), false);
  assert.match(source, /git\/ref\/heads\/\$\{headRef\}/);
});

test('preflight is blocked in dry-run and executes only declared side-effect-free probes', () => {
  const common = [
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--profile', 'fixture-local',
    '--subject-sha', subjectSha,
    '--run-id', 'fixture-run-001',
    '--instance-id', 'fixture-instance',
    '--build-or-image', 'fixture-build',
    '--schema-version', 'fixture-schema-v1',
    '--dataset-id', 'fixture-dataset',
    '--dataset-version', 'fixture-dataset-v1',
    '--json',
  ];
  const dryRun = runNode('scripts/factory-preflight.mjs', common);
  assert.equal(dryRun.status, 2, dryRun.stderr || dryRun.stdout);
  const dryPayload = JSON.parse(dryRun.stdout);
  assert.equal(dryPayload.summary.mode, 'dry-run');
  assert.equal(dryPayload.observation.status, 'blocked');
  assert.ok(dryPayload.observation.operations.every((operation) => operation.outcome === 'planned'));

  const execute = runNode('scripts/factory-preflight.mjs', [...common, '--execute']);
  assert.equal(execute.status, 0, execute.stderr || execute.stdout);
  const executePayload = JSON.parse(execute.stdout);
  assert.equal(executePayload.observation.status, 'ready');
  assert.equal(executePayload.observation.deployed_revision, subjectSha);
  assert.ok(executePayload.observation.operations.every((operation) => operation.side_effect === 'none'));
});

test('the Playwright reporter preserves retries and replay evidence references', async () => {
  const outputRoot = temporary('factory-reporter-');
  const previousRoot = process.env.FACTORY_EVIDENCE_ROOT;
  const previousResults = process.env.FACTORY_RESULTS_PATH;
  process.env.FACTORY_EVIDENCE_ROOT = outputRoot;
  process.env.FACTORY_RESULTS_PATH = path.join(outputRoot, 'results.json');
  const attachment = path.join(outputRoot, 'CASE-001.png');
  fs.writeFileSync(attachment, 'synthetic-image-fixture', 'utf8');
  try {
    const reporter = new FactoryEvidenceReporter();
    reporter.onBegin({ projects: [{ name: 'chromium' }] });
    const testCase = {
      id: 'playwright-fixture',
      title: 'CASE-001 fixture behaviour',
      annotations: [
        { type: 'case', description: 'CASE-001' },
        { type: 'criterion', description: 'AC-001' },
      ],
    };
    reporter.onTestEnd(testCase, { status: 'failed', retry: 0, attachments: [] });
    reporter.onTestEnd(testCase, { status: 'passed', retry: 1, attachments: [{ name: 'fixture-state', path: attachment, contentType: 'image/png' }] });
    await reporter.onEnd({ status: 'passed' });
    const payload = readData(path.join(outputRoot, 'results.json'));
    assert.equal(payload.cases[0].attempts, 2);
    assert.equal(payload.cases[0].outcome, 'pass');
    assert.equal(payload.cases[0].evidence[0].path, 'CASE-001.png');
    assert.deepEqual(payload.cases[0].criteria, ['AC-001']);
  } finally {
    if (previousRoot === undefined) delete process.env.FACTORY_EVIDENCE_ROOT;
    else process.env.FACTORY_EVIDENCE_ROOT = previousRoot;
    if (previousResults === undefined) delete process.env.FACTORY_RESULTS_PATH;
    else process.env.FACTORY_RESULTS_PATH = previousResults;
  }
});

test('evidence, report and draft-PR CLIs compose without push or merge capability', () => {
  const output = temporary('factory-cli-');
  const exactHead = git(repository, ['rev-parse', 'HEAD']);
  const exactObservation = fixture('observation.json');
  exactObservation.subject_sha = exactHead;
  exactObservation.deployed_revision = exactHead;
  const revisionOperation = exactObservation.operations.find((operation) => operation.id === 'fixture-revision');
  revisionOperation.stdout = `${exactHead}\n`;
  const observationFile = path.join(output, 'observation.json');
  fs.writeFileSync(observationFile, `${JSON.stringify(exactObservation, null, 2)}\n`, 'utf8');
  const artifactRoot = path.join(output, 'artifacts');
  fs.mkdirSync(artifactRoot);
  const exactResults = fixture('results.json');
  exactResults.candidate_sha = exactHead;
  const resultsFile = path.join(artifactRoot, 'results.json');
  fs.writeFileSync(resultsFile, `${JSON.stringify(exactResults, null, 2)}\n`, 'utf8');
  fs.copyFileSync(path.join(fixtureRoot, 'evidence/CASE-001.txt'), path.join(artifactRoot, 'CASE-001.txt'));
  const junitFile = path.join(artifactRoot, 'junit.xml');
  fs.writeFileSync(junitFile, '<testsuite tests="1" failures="0"/>\n', 'utf8');
  const htmlReport = path.join(artifactRoot, 'html-report');
  fs.mkdirSync(htmlReport);
  fs.writeFileSync(path.join(htmlReport, 'index.html'), '<html><body>synthetic report</body></html>\n', 'utf8');
  const manifestFile = path.join(output, 'evidence-manifest.yaml');
  const evidence = runNode('scripts/factory-evidence.mjs', [
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--observation', observationFile,
    '--results', resultsFile,
    '--artifacts-root', artifactRoot,
    '--subject-sha', exactHead,
    '--spec-package', 'scripts/fixtures/factory-delivery',
    '--out', manifestFile,
    '--ci-run-id', 'fixture-ci-run',
    '--ci-artifact-id', 'fixture-artifact',
    '--ci-artifact-url', 'https://ci.example.invalid/runs/fixture-ci-run/artifacts/fixture-artifact',
    '--junit', junitFile,
    '--html-report', htmlReport,
    '--json',
  ]);
  assert.equal(evidence.status, 0, evidence.stderr || evidence.stdout);
  assert.equal(JSON.parse(evidence.stdout).summary.verdict, 'ready');
  const manifest = readData(manifestFile);
  assert.equal(manifest.subject.source_tree_digest, sourceTreeDigest(repository, exactHead, { excludedPrefixes: ['scripts/fixtures/factory-delivery/acceptance/runs'] }));
  assert.equal(manifest.publication.mode, 'ci_artifact');
  assert.equal(Object.hasOwn(manifest.subject, 'evidence_commit_sha'), false);

  const reportFile = path.join(output, 'ACCEPTANCE_REPORT.md');
  const report = runNode('scripts/factory-report.mjs', [
    '--manifest', manifestFile,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--artifacts-root', artifactRoot,
    '--out', reportFile,
    '--json',
  ]);
  assert.equal(report.status, 0, report.stderr || report.stdout);
  assert.match(fs.readFileSync(reportFile, 'utf8'), /\*\*READY\*\*/);

  const exactPrContract = fixture('pr-draft.yaml');
  exactPrContract.replay_command = exactPrContract.replay_command.replace(subjectSha, exactHead);
  const exactPrContractFile = path.join(output, 'pr-draft.yaml');
  fs.writeFileSync(exactPrContractFile, `${stringifyYaml(exactPrContract)}\n`, 'utf8');
  const draft = runNode('scripts/factory-pr.mjs', [
    '--contract', exactPrContractFile,
    '--evidence', manifestFile,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--artifacts-root', artifactRoot,
    '--head-ref', 'fixture/delivery',
    '--head-sha', exactHead,
    '--json',
  ]);
  assert.equal(draft.status, 0, draft.stderr || draft.stdout);
  const payload = JSON.parse(draft.stdout);
  assert.equal(payload.summary.mode, 'dry-run');
  assert.equal(payload.plan.operation, 'create-draft');
  assert.equal(payload.plan.argv.includes('--draft'), true);
  assert.equal(payload.plan.argv.includes('--merge'), false);
  assert.equal(payload.plan.argv.includes('--push'), false);

  fs.appendFileSync(path.join(artifactRoot, 'CASE-001.txt'), 'tampered after assembly\n', 'utf8');
  const blockedReportFile = path.join(output, 'TAMPERED_REPORT.md');
  const blockedReport = runNode('scripts/factory-report.mjs', [
    '--manifest', manifestFile,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--artifacts-root', artifactRoot,
    '--out', blockedReportFile,
    '--json',
  ]);
  assert.equal(blockedReport.status, 2, blockedReport.stderr || blockedReport.stdout);
  assert.match(fs.readFileSync(blockedReportFile, 'utf8'), /\*\*BLOCKED\*\*/);
  const blockedDraft = runNode('scripts/factory-pr.mjs', [
    '--contract', exactPrContractFile,
    '--evidence', manifestFile,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--artifacts-root', artifactRoot,
    '--head-ref', 'fixture/delivery',
    '--head-sha', exactHead,
    '--json',
  ]);
  assert.equal(blockedDraft.status, 2, blockedDraft.stderr || blockedDraft.stdout);
  expectCode(JSON.parse(blockedDraft.stdout).findings, 'evidence-artifact-hash-mismatch');
});

let failed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
  }
}
for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
console.log(`factory delivery tests: ${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
