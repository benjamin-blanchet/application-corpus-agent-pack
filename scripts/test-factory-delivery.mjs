#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import FactoryEvidenceReporter from './adapters/playwright/reporter.mjs';
import { resolvePlannedPlaywrightInputs } from './adapters/playwright/discovery.mjs';
import { parseStructuredTestResults } from './adapters/command/results.mjs';
import { materializeEphemeralStorage, resolveEphemeralStorage } from './adapters/playwright/storage.mjs';
import { OUTCOMES, canonicalizeCaseOutcome, sha256File, sha256Object, stableJson } from './lib/factory-delivery/core.mjs';
import { githubArtifactAttestationRef, verifyAuthorizationReceipt, verifyGitHubActionsAttestation, verifyReleaseReviewReceipt } from './lib/factory-delivery/authorization.mjs';
import { runMutationCleanups } from './lib/factory-delivery/cleanup.mjs';
import { assembleEvidence } from './lib/factory-delivery/evidence.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';
import { sourceTreeDigest, verifyEvidenceOnlyCommit } from './lib/factory-delivery/provenance.mjs';
import { renderEvidenceReport } from './lib/factory-delivery/report.mjs';
import { validateReleaseEnvelope } from './lib/factory-delivery/release.mjs';
import {
  validateAcceptancePlan,
  validateDeliveryWorkflowTemplates,
  validateEnvironment,
  validateEnvironmentObservation,
  validateEvidence,
  validateFactoryCi,
  validatePrDraft,
} from './lib/factory-delivery/validation.mjs';
import { parseYaml, stringifyYaml, YamlSyntaxError } from './lib/factory-delivery/yaml.mjs';
import { canonicalHash, normalizedFileHash } from './lib/factory-v3/canonical-json.mjs';
import { repositoryArtifactDigest } from './lib/factory-v3/artifact-digest.mjs';
import { controllerCorpusExclusions } from './lib/factory-v3/corpus-attestation.mjs';
import { buildEvent, eventLogHash, readEventFile, serializeEventLog } from './lib/factory-v3/event-log.mjs';
import { buildCandidateBinding, captureGitCommitSnapshot } from './lib/factory-v3/git-review-attestation.mjs';
import {
  ENVELOPE_HASH_ALGORITHM,
  CORPUS_TREE_ALGORITHM,
  CORPUS_VALIDATION_ALGORITHM,
  NORMALIZED_TEXT_HASH_ALGORITHM,
  WORKSPACE_DELTA_ALGORITHM,
  WORKSPACE_SNAPSHOT_ALGORITHM,
  changeInventoryDigest,
  corpusTreeDigest,
  integrationVerificationDigest,
  lotResultDigest,
  preimplementationConventionDigest,
  workspaceSnapshotDigest,
} from './lib/factory-v3/proof-contracts.mjs';
import { reduceFactory } from './lib/factory-v3/reducer.mjs';
import { VERIFICATION_RECEIPT_ALGORITHM, verificationReceiptDigest } from './lib/factory-v3/verification-receipt.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repository, 'scripts/fixtures/factory-delivery');
const subjectSha = 'a'.repeat(40);
const sourceDigest = `sha256:${'1'.repeat(64)}`;
const tempRoots = [];
const tests = [];
const learningTestsArg = process.argv.indexOf('--learning-tests-json');
const selectedLearningTests = learningTestsArg >= 0
  ? new Set(JSON.parse(process.argv[learningTestsArg + 1] || '[]'))
  : null;
const discoveredLearningTests = new Set();

function test(name, run) {
  discoveredLearningTests.add(name);
  if (selectedLearningTests && !selectedLearningTests.has(name)) return;
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

// The adopted copy of a delivery workflow, materialized from its installable
// template. The pack ships the template and no longer adopts three of the four
// itself, so sourcing fixtures from .github/workflows/ would tie this suite to
// one repository's adoption choices. delivery-workflow-active-drift already
// requires the two to be semantically identical wherever a repository does
// adopt, so the template is the faithful — and the shipped — subject.
const ADOPTED_WORKFLOW_TEMPLATES = {
  'factory-policy.yml': 'factory-policy.workflow.yml',
  'factory-acceptance.yml': 'factory-acceptance.workflow.yml',
  'factory-release.yml': 'factory-release.workflow.yml',
  'factory-draft-pr.yml': 'factory-draft-pr.workflow.yml',
};

function adoptedWorkflowSource(active) {
  const template = ADOPTED_WORKFLOW_TEMPLATES[active];
  if (!template) throw new Error(`no installable template for ${active}`);
  return path.join(repository, '.github/templates/software-factory/delivery', template);
}

function installAdoptedWorkflow(destinationRoot, active) {
  fs.copyFileSync(adoptedWorkflowSource(active), path.join(destinationRoot, '.github/workflows', active));
}

function workflowValidationSandbox() {
  const root = temporary('factory-workflow-sandbox-');
  fs.mkdirSync(path.join(root, '.github/templates/software-factory'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.cpSync(
    path.join(repository, '.github/templates/software-factory/delivery'),
    path.join(root, '.github/templates/software-factory/delivery'),
    { recursive: true },
  );
  for (const active of ['factory-policy.yml', 'factory-acceptance.yml', 'factory-release.yml', 'factory-draft-pr.yml']) {
    installAdoptedWorkflow(root, active);
  }
  return root;
}

function mutateWorkflowTemplate(name, mutate) {
  const root = workflowValidationSandbox();
  const file = path.join(root, '.github/templates/software-factory/delivery', name);
  fs.writeFileSync(file, mutate(fs.readFileSync(file, 'utf8')), 'utf8');
  return validateDeliveryWorkflowTemplates({ root });
}

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function buildReleasedDeliveryScenario({ publicationMode = 'ci_artifact' } = {}) {
  const repo = temporary('factory-released-repo-');
  const packageRelative = 'scripts/fixtures/factory-delivery';
  const packageRoot = path.join(repo, packageRelative);
  fs.mkdirSync(path.dirname(packageRoot), { recursive: true });
  fs.cpSync(fixtureRoot, packageRoot, { recursive: true });
  fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  installAdoptedWorkflow(repo, 'factory-policy.yml');
  const corpusManifestFile = path.join(repo, 'doc/CORPUS_MANIFEST.md');
  fs.mkdirSync(path.dirname(corpusManifestFile), { recursive: true });
  fs.writeFileSync(corpusManifestFile, '# Synthetic delivery corpus manifest\n');

  const ciFile = path.join(packageRoot, 'ci.yaml');
  const ci = readData(ciFile);
  ci.operations['fixture-revision'].argv = ['git', 'rev-parse', 'HEAD'];
  writeData(ciFile, ci);
  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'Fixture']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '--quiet', '-m', 'implementation base']);
  const implementationBaseSha = git(repo, ['rev-parse', 'HEAD']);
  let candidateSha = null;

  const planFile = path.join(packageRoot, 'acceptance-plan.yaml');
  const environmentFile = path.join(packageRoot, 'environment.yaml');
  const factoryPlanFile = path.join(packageRoot, 'factory/plan.v3.json');
  const specFile = path.join(packageRoot, 'SPECIFICATION.md');
  const contractFile = path.join(packageRoot, 'pr-draft.yaml');
  const plan = readData(planFile);
  const environment = readData(environmentFile);
  const artifactsRoot = temporary('factory-release-envelope-');
  fs.copyFileSync(path.join(fixtureRoot, 'evidence/CASE-001.txt'), path.join(artifactsRoot, 'CASE-001.txt'));
  const manifestFile = path.join(artifactsRoot, 'evidence-manifest.yaml');
  let evidenceCommitSha = null;
  let persistedManifest = null;

  const factoryPlan = readData(factoryPlanFile);
  const specDigest = normalizedFileHash(specFile);
  const factoryPlanDigest = canonicalHash(factoryPlan);
  const changedPath = `${packageRelative}/evidence/CASE-001.txt`;
  const changedProof = repositoryArtifactDigest({ repoRoot: repo, repoPath: changedPath });
  const outputProofs = factoryPlan.lots[0].handoff.outputs.map((output) => {
    const proof = repositoryArtifactDigest({ repoRoot: repo, repoPath: output.path });
    return {
      id: output.id,
      path: output.path,
      kind: proof.kind,
      algorithm: proof.algorithm,
      sha256: proof.sha256,
    };
  });
  const verificationReference = {
    path: changedPath,
    sha256: changedProof.sha256,
    bytes: fs.statSync(path.join(repo, changedPath)).size,
  };
  const lotVerification = factoryPlan.lots[0].verification.map((command, index) => {
    const receipt = {
      algorithm: VERIFICATION_RECEIPT_ALGORITHM,
      id: `synthetic-delivery-verification-${index + 1}`,
      command,
      status: 'passed',
      runner: { kind: 'protected_ci', id: 'fixture-ci-run-12345', version: 1, attestation_ref: 'github-actions:acme/repo:12345' },
      exit_code: 0,
      stdout: verificationReference,
      stderr: verificationReference,
      artifacts: [],
      receipt_sha256: null,
    };
    receipt.receipt_sha256 = verificationReceiptDigest(receipt);
    return receipt;
  });
  const workspaceSnapshot = {
    v: 1,
    algorithm: WORKSPACE_SNAPSHOT_ALGORITHM,
    workspace_id: 'e'.repeat(64),
    workspace_mode: 'isolated_worktree',
    attestation_mode: 'retrospective_attestation',
    base_revision: implementationBaseSha,
    exclusions: [],
    entries: [],
    snapshot_sha256: null,
  };
  workspaceSnapshot.snapshot_sha256 = workspaceSnapshotDigest(workspaceSnapshot);
  const toWorkspaceSnapshot = {
    ...workspaceSnapshot,
    entries: [{ path: changedPath, origin: 'tracked', status: 'present', sha256: changedProof.sha256 }],
    snapshot_sha256: null,
  };
  toWorkspaceSnapshot.snapshot_sha256 = workspaceSnapshotDigest(toWorkspaceSnapshot);
  const preimplementationContract = {
    algorithm: ENVELOPE_HASH_ALGORITHM,
    source_revision: implementationBaseSha,
    observed_conventions: [{ id: 'fixture-convention', rule: 'preserve the fixture evidence layout', examples: [verificationReference] }],
    contract_sha256: null,
  };
  preimplementationContract.contract_sha256 = preimplementationConventionDigest(preimplementationContract);
  const lotResult = {
    algorithm: ENVELOPE_HASH_ALGORITHM,
    base_revision: implementationBaseSha,
    changed_paths: [changedPath],
    files: [{ path: changedPath, status: 'present', sha256: changedProof.sha256 }],
    workspace_delta: {
      algorithm: WORKSPACE_DELTA_ALGORITHM,
      from_snapshot_sha256: workspaceSnapshot.snapshot_sha256,
      to_snapshot: toWorkspaceSnapshot,
      files_sha256: changeInventoryDigest([{ path: changedPath, status: 'present', sha256: changedProof.sha256 }]),
      metrics: { algorithm: 'git-numstat-plus-untracked-v1', files: 1, added_lines: 1, deleted_lines: 0, binary_files: 0 },
      budget: { source: 'policy_default', max_files: 12, max_added_lines: 800, max_deleted_lines: 800, max_binary_files: 0, override_event_id: null },
    },
    diff_sha256: null,
    outputs: outputProofs,
    verification: lotVerification,
    preimplementation_contract_sha256: preimplementationContract.contract_sha256,
    observed_conventions: [{ id: 'fixture-convention', rule: 'preserve the fixture evidence layout', examples: [verificationReference] }],
    refactor_assessment: { status: 'not_required', reason: 'The synthetic fixture follows its existing bounded layout.' },
    blockers: [],
  };
  lotResult.diff_sha256 = lotResultDigest(lotResult);
  let integration = null;
  const diffDigest = lotResult.diff_sha256;
  const controller = { role: 'controller', execution_id: 'controller-1', capabilities: ['read', 'write', 'execute'], model: { planned: null, requested: null, used: null, model_family: 'controller' } };
  const implementer = { role: 'implementer', execution_id: 'worker-1', capabilities: ['read', 'write', 'execute'], model: { planned: 'standard', requested: 'model-standard', used: 'model-standard', model_family: 'implementation-family' } };
  const conventionObserver = { role: 'implementer', execution_id: 'convention-observer-1', capabilities: ['read'], model: { planned: 'standard', requested: 'model-standard', used: 'model-standard', model_family: 'implementation-family' } };
  const reviewer = { role: 'reviewer', execution_id: 'reviewer-1', capabilities: ['read', 'execute'], model: { planned: 'reviewer', requested: 'model-reviewer', used: 'model-reviewer', model_family: 'review-family' } };
  const acceptance = { role: 'acceptance', execution_id: 'acceptance-1', capabilities: ['read', 'execute'], model: { planned: 'expert', requested: 'model-expert', used: 'model-expert', model_family: 'acceptance-family' } };
  const events = [];
  const append = (type, data = {}, { actor = controller, lotId = null } = {}) => {
    const event = buildEvent(events, {
      run_id: 'RUN-12345',
      type,
      at: '2026-08-26T10:00:00.000Z',
      controller_id: 'controller-1',
      expected_previous_seq: events.length,
      actor,
      subject: { package: packageRelative, lot_id: lotId },
      basis: { spec_sha256: specDigest, plan_sha256: factoryPlanDigest, candidate_sha: candidateSha, diff_sha256: lotId ? diffDigest : null },
      data,
    });
    events.push(event);
    return event;
  };
  append('package_initialized', { schema_version: 3, run_mode: 'retrospective_attestation' });
  append('spec_proposed', { spec_sha256: specDigest });
  append('spec_approved', { spec_sha256: specDigest, approved_by: 'product-owner', approved_at: '2026-08-26T10:00:00.000Z' });
  append('plan_proposed', { plan_sha256: factoryPlanDigest });
  append('plan_approved', { plan_sha256: factoryPlanDigest, approved_by: 'tech-owner', approved_at: '2026-08-26T10:00:00.000Z' });
  append('execution_policy_resolved', {
    mode: 'balanced',
    observed_at: '2026-08-26T10:00:00.000Z',
    models: { economy: 'model-economy', standard: 'model-standard', expert: 'model-expert', reviewer: 'model-reviewer' },
    model_families: { economy: 'economy-family', standard: 'implementation-family', expert: 'acceptance-family', reviewer: 'review-family' },
  });
  append('lot_conventions_observed', preimplementationContract, { actor: conventionObserver, lotId: 'LOT-1' });
  append('wave_reserved', { reservations: [{ reservation_id: 'RES-1', lot_id: 'LOT-1' }] });
  append('lot_started', { reservation_id: 'RES-1', workspace_snapshot: workspaceSnapshot }, { actor: implementer, lotId: 'LOT-1' });
  append('lot_result_reported', { result: lotResult }, { actor: implementer, lotId: 'LOT-1' });
  append('lot_reviewed', { diff_sha256: diffDigest, verdict: 'passed', findings: [], fresh_context: true }, { actor: reviewer, lotId: 'LOT-1' });
  append('lot_integrated', {}, { lotId: 'LOT-1' });
  const sourceCurrent = {
    plan_sha256: factoryPlanDigest,
    spec_exists: true,
    spec_sha256: specDigest,
    evidence_manifest_sha256: null,
    provenance_status: null,
  };
  const committedEventsFile = path.join(packageRoot, 'factory/events.v3.jsonl');
  const committedStateFile = path.join(packageRoot, 'factory/state.v3.json');
  fs.writeFileSync(committedEventsFile, serializeEventLog(events), 'utf8');
  writeData(committedStateFile, reduceFactory({ plan: factoryPlan, events, current: sourceCurrent }));
  git(repo, ['add', path.relative(repo, committedEventsFile), path.relative(repo, committedStateFile)]);
  git(repo, ['commit', '--quiet', '-m', 'reviewed control prefix']);
  const reviewedSha = git(repo, ['rev-parse', 'HEAD']);
  integration = {
    status: 'passed',
    algorithm: ENVELOPE_HASH_ALGORITHM,
    verifications: lotVerification,
    reviewed_snapshot: captureGitCommitSnapshot({ repoRoot: repo, revision: reviewedSha }),
    verification_sha256: null,
  };
  integration.verification_sha256 = integrationVerificationDigest(integration);
  append('integration_verified', integration);
  append('consolidated_reviewed', { verdict: 'passed', findings: [], fresh_context: true, reviewed_snapshot: integration.reviewed_snapshot }, { actor: reviewer });
  const corpusCloseout = {
    root_path: 'doc',
    algorithm: CORPUS_TREE_ALGORITHM,
    exclusions: controllerCorpusExclusions(packageRelative),
    files: [{ path: 'doc/CORPUS_MANIFEST.md', sha256: normalizedFileHash(corpusManifestFile) }],
    corpus_tree_sha256: null,
    validation: {
      algorithm: CORPUS_VALIDATION_ALGORITHM,
      validator_path: 'scripts/validate-corpus.mjs',
      validator_sha256: canonicalHash({ fixture: 'validate-corpus.mjs' }),
      arguments: ['--json'],
      status: 'passed',
      result_sha256: canonicalHash({ fixture: 'corpus-validation', status: 'passed' }),
    },
  };
  corpusCloseout.corpus_tree_sha256 = corpusTreeDigest(corpusCloseout);
  const corpusEvent = append('corpus_closed', corpusCloseout);
  fs.writeFileSync(committedEventsFile, serializeEventLog(events), 'utf8');
  writeData(committedStateFile, reduceFactory({ plan: factoryPlan, events, current: sourceCurrent }));
  git(repo, ['add', path.relative(repo, committedEventsFile), path.relative(repo, committedStateFile)]);
  git(repo, ['commit', '--quiet', '-m', 'corpus-closed candidate']);
  candidateSha = git(repo, ['rev-parse', 'HEAD']);
  const binding = buildCandidateBinding({
    repoRoot: repo,
    packageRef: packageRelative,
    reviewedSnapshot: integration.reviewed_snapshot,
    candidateSha,
    corpusEvent,
  });

  const observation = fixture('observation.json');
  observation.run_id = 'RUN-12345';
  observation.subject_sha = candidateSha;
  observation.deployed_revision = candidateSha;
  observation.environment_contract_digest = sha256File(environmentFile);
  observation.ci_contract_digest = sha256File(ciFile);
  const revisionOperation = observation.operations.find((operation) => operation.id === 'fixture-revision');
  revisionOperation.argv = [...ci.operations['fixture-revision'].argv];
  revisionOperation.stdout = `${candidateSha}\n`;
  const results = fixture('results.json');
  results.run_id = 'RUN-12345';
  results.observation_run_id = 'RUN-12345';
  results.capability_receipt.provider_run_id = '12345';
  results.capability_receipt.grants.find((grant) => grant.capability === 'network').run_id = 'RUN-12345';
  results.candidate_sha = candidateSha;
  results.plan_digest = sha256File(planFile);
  results.environment_digest = sha256File(environmentFile);
  const publication = publicationMode === 'ci_artifact'
    ? {
      mode: 'ci_artifact',
      ci_run_id: '12345',
      artifact_id: '456',
      artifact_url: 'https://github.com/acme/repo/actions/runs/12345/artifacts/456',
      retention_days: ci.artifacts.retention_days,
    }
    : { mode: 'evidence_only_commit' };
  const assembled = assembleEvidence({
    plan,
    environment,
    ci,
    observation,
    results,
    artifactsRoot,
    repository: repo,
    subjectSha: candidateSha,
    sourceDigest: sourceTreeDigest(repo, candidateSha, { excludedPrefixes: [`${packageRelative}/acceptance/runs`] }),
    specPackage: packageRelative,
    environmentContractPath: environmentFile,
    acceptancePlanPath: planFile,
    publication,
  });
  assert.deepEqual(assembled.findings, []);
  assert.equal(assembled.manifest.verdict, 'ready');
  writeData(manifestFile, assembled.manifest);
  persistedManifest = readData(manifestFile);
  if (publicationMode === 'evidence_only_commit') {
    const committedManifestFile = path.join(packageRoot, 'acceptance/runs/12345/evidence-manifest.yaml');
    writeData(committedManifestFile, persistedManifest);
    git(repo, ['add', path.relative(repo, committedManifestFile)]);
    git(repo, ['commit', '--quiet', '-m', 'publish evidence-only manifest']);
    evidenceCommitSha = git(repo, ['rev-parse', 'HEAD']);
  }
  append('candidate_frozen', { candidate_sha: candidateSha, binding });
  append('acceptance_started', {}, { actor: acceptance });
  append('acceptance_completed', {
    status: 'passed',
    tested_sha: candidateSha,
    test_bundle_sha256: '5'.repeat(64),
    case_results: persistedManifest.cases.map((testCase) => ({
      id: testCase.id,
      outcome: canonicalizeCaseOutcome(testCase.outcome).outcome,
      ...(typeof testCase.user_visible_error === 'boolean'
        ? { user_visible_error: testCase.user_visible_error }
        : {}),
      oracle_results: testCase.oracle_results.map((oracle) => ({
        id: oracle.id,
        outcome: canonicalizeCaseOutcome(oracle.outcome).outcome,
      })),
    })),
  }, { actor: acceptance });
  const manifestDigest = canonicalHash(persistedManifest);
  const manifestLocator = publicationMode === 'ci_artifact' ? {
    kind: 'ci_artifact',
    provider: 'github_actions',
    artifact_id: '789',
    name: 'factory-evidence-envelope-12345',
    run_id: '12345',
    path: 'evidence-manifest.yaml',
    digest_sha256: manifestDigest,
    bundle_digest: persistedManifest.publication.bundle_digest,
    attestation_ref: githubArtifactAttestationRef({ repository: 'acme/repo', runId: '12345', artifactId: '789', digest: `sha256:${'9'.repeat(64)}` }),
  } : {
    kind: 'repo_file',
    path: `${packageRelative}/acceptance/runs/12345/evidence-manifest.yaml`,
    digest_sha256: manifestDigest,
  };
  append('evidence_committed', {
    manifest_locator: manifestLocator,
    evidence_manifest_sha256: manifestDigest,
    ...(publicationMode === 'evidence_only_commit' ? { evidence_sha: evidenceCommitSha } : {}),
    publication: publicationMode === 'ci_artifact'
      ? { mode: 'ci_artifact', media_type: 'application/zip' }
      : { mode: 'evidence_only_commit' },
  });
  append('release_reviewed', {
    verdict: 'passed',
    fresh_context: true,
    findings: [],
    independence_exception: {
      reason: 'Synthetic fixture reuses the configured reviewer family.',
      approved_by: 'quality-owner',
      approved_at: '2026-08-26T10:00:00.000Z',
      author_model_families: ['implementation-family', 'review-family'],
      reviewer_model_family: 'review-family',
      plan_sha256: factoryPlanDigest,
    },
  }, { actor: reviewer });
  const state = reduceFactory({
    plan: factoryPlan,
    events,
    current: {
      plan_sha256: factoryPlanDigest,
      spec_exists: true,
      spec_sha256: specDigest,
      git_head: candidateSha,
      git_change_class: 'none',
      evidence_manifest_sha256: manifestDigest,
      provenance_status: 'valid',
    },
  });
  assert.equal(state.phase, 'release_ready');
  const eventsFile = path.join(artifactsRoot, 'events.v3.jsonl');
  const stateFile = path.join(artifactsRoot, 'state.v3.json');
  const releaseMetadataFile = path.join(artifactsRoot, 'release-envelope.json');
  fs.writeFileSync(eventsFile, serializeEventLog(events), 'utf8');
  writeData(stateFile, state);
  writeData(releaseMetadataFile, {
    schema_version: 1,
    workflow_ref: '.github/workflows/factory-release.yml',
    controller_sha: 'f'.repeat(40),
    candidate_sha: candidateSha,
    acceptance_run_id: '12345',
    factory_run_id: 'RUN-12345',
    evidence_manifest_sha256: canonicalHash(persistedManifest),
    acceptance_attestation_sha256: '7'.repeat(64),
    acceptance_artifact_digest: `sha256:${'9'.repeat(64)}`,
    review_receipt_sha256: '8'.repeat(64),
    events_sha256: eventLogHash(events),
    state_sha256: sha256File(stateFile),
    generated_at: '2026-08-26T10:00:00.000Z',
  });
  return {
    repo,
    packageRelative,
    packageRoot,
    artifactsRoot,
    candidateSha,
    evidenceCommitSha,
    ci,
    contractFile,
    planFile,
    environmentFile,
    manifestFile,
    eventsFile,
    stateFile,
    releaseMetadataFile,
    manifest: persistedManifest,
  };
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
    ci: fixture('ci.yaml'),
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

function buildAcceptanceLifecycleScenario() {
  const repo = temporary('factory-acceptance-lifecycle-repo-');
  fs.cpSync(path.join(repository, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
  fs.copyFileSync(
    adoptedWorkflowSource('factory-policy.yml'),
    path.join(repo, '.github/workflows/factory-policy.yml'),
  );

  const packageRelative = 'scripts/fixtures/factory-delivery';
  const packageRoot = path.join(repo, packageRelative);
  const planFile = path.join(packageRoot, 'acceptance-plan.yaml');
  const environmentFile = path.join(packageRoot, 'environment.yaml');
  const ciFile = path.join(packageRoot, 'ci.yaml');
  const probeRelative = `${packageRelative}/lifecycle-probe.mjs`;
  const probeFile = path.join(repo, probeRelative);
  fs.writeFileSync(probeFile, `import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const role = process.argv[2];
const mode = process.argv[3] || 'pass';
fs.appendFileSync(path.join(process.cwd(), '.factory-lifecycle.log'), \`${'${role}'}\\n\`, 'utf8');
fs.appendFileSync(path.join(process.cwd(), '.factory-lifecycle-env.jsonl'), JSON.stringify({
  role,
  protected_credential: Object.hasOwn(process.env, 'FACTORY_FIXTURE_CREDENTIAL'),
  raw_storage_json: Object.hasOwn(process.env, 'FACTORY_EPHEMERAL_STORAGE_STATE_JSON'),
  storage_root: Boolean(process.env.FACTORY_EPHEMERAL_STORAGE_ROOT && fs.existsSync(process.env.FACTORY_EPHEMERAL_STORAGE_ROOT)),
  storage_state: Boolean(process.env.FACTORY_EPHEMERAL_STORAGE_STATE && fs.existsSync(process.env.FACTORY_EPHEMERAL_STORAGE_STATE)),
}) + '\\n', 'utf8');
if (role === 'revision') {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', shell: false });
  if (revision.status !== 0) process.exit(18);
  process.stdout.write(revision.stdout.trim() + '\\n');
} else if (role === 'acceptance') {
  console.log('ok 1 - CASE-001 fixture behaviour');
} else {
  console.log(role);
}
if (mode === 'fail') process.exit(17);
`, 'utf8');

  const plan = readData(planFile);
  plan.campaign.adapter = 'command';
  plan.campaign.operation = 'fixture-acceptance-command';
  delete plan.campaign.config;
  delete plan.campaign.bootstrap_operation;
  plan.cases[0].oracle[0].record_marker = 'CASE-001 fixture behaviour';
  plan.cases[0].mutations = [];
  plan.mutations = [];
  writeData(planFile, plan);

  const environment = readData(environmentFile);
  const lifecycleProfile = environment.profiles.find((item) => item.id === 'fixture-local');
  lifecycleProfile.kind = 'local';
  lifecycleProfile.auth.secret_refs = [];
  lifecycleProfile.network = { policy: 'deny_by_default', destinations_ref: null, destinations: [] };
  writeData(environmentFile, environment);

  const ci = readData(ciFile);
  const roles = {
    'fixture-build': ['build', 'build'],
    'fixture-start': ['start', 'start'],
    'fixture-health': ['health', 'none'],
    'fixture-revision': ['revision', 'none'],
    'fixture-schema': ['schema', 'none'],
    'fixture-dataset': ['dataset', 'none'],
    'fixture-credential': ['credential', 'none'],
    'fixture-reset': ['reset', 'reset'],
    'fixture-stop': ['stop', 'stop'],
    'fixture-acceptance-command': ['acceptance', 'none'],
  };
  for (const [id, [role, sideEffect]] of Object.entries(roles)) {
    ci.operations[id] = {
      argv: ['node', probeRelative, role],
      cwd: '.',
      timeout_seconds: 30,
      privilege: 'unprivileged',
      side_effect: sideEffect,
    };
  }
  writeData(ciFile, ci);

  git(repo, ['init', '--quiet']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['config', 'user.name', 'Fixture']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '--quiet', '-m', 'frozen lifecycle scenario']);

  return { repo, packageRelative, planFile, environmentFile, ciFile, baseCi: ci };
}

function configureAcceptanceLifecycleScenario(scenario, { failingRole = null, invalidCwdRole = null } = {}) {
  const ci = clone(scenario.baseCi);
  for (const operation of Object.values(ci.operations)) {
    if (Array.isArray(operation.argv) && operation.argv[1]?.endsWith('/lifecycle-probe.mjs')) {
      operation.argv = operation.argv.slice(0, 3);
      if (operation.argv[2] === failingRole) operation.argv.push('fail');
      if (operation.argv[2] === invalidCwdRole) operation.cwd = 'missing-lifecycle-directory';
    }
  }
  writeData(scenario.ciFile, ci);
  const changed = git(scenario.repo, ['status', '--porcelain']);
  if (changed) {
    git(scenario.repo, ['add', path.relative(scenario.repo, scenario.ciFile)]);
    git(scenario.repo, ['commit', '--quiet', '-m', `lifecycle scenario ${failingRole || invalidCwdRole || 'passing'}`]);
  }
  return git(scenario.repo, ['rev-parse', 'HEAD']);
}

function runAcceptanceLifecycleScenario(scenario, label, subject, { env: extraEnvironment = {} } = {}) {
  const output = temporary(`factory-acceptance-${label}-`);
  const evidenceRoot = path.join(output, 'evidence');
  const observationFile = path.join(output, 'observation.json');
  const lifecycleFile = path.join(output, 'lifecycle.json');
  fs.mkdirSync(evidenceRoot);
  const result = runNode('scripts/factory-acceptance.mjs', [
    '--root', scenario.repo,
    '--plan', `${scenario.packageRelative}/acceptance-plan.yaml`,
    '--environment', `${scenario.packageRelative}/environment.yaml`,
    '--ci', `${scenario.packageRelative}/ci.yaml`,
    '--subject-sha', subject,
    '--run-id', `RUN-${label}`,
    '--instance-id', `instance-${label}`,
    '--build-or-image', `build-${label}`,
    '--schema-version', 'schema-v1',
    '--dataset-id', 'dataset-v1',
    '--dataset-version', 'dataset-version-v1',
    '--observation-out', observationFile,
    '--lifecycle-out', lifecycleFile,
    '--evidence-root', evidenceRoot,
    '--json',
  ], {
    env: {
      FACTORY_BASE_URL: 'http://127.0.0.1:65535',
      FACTORY_DATASET_ID: 'dataset-v1',
      FACTORY_DATASET_VERSION: 'dataset-version-v1',
      FACTORY_FIXTURE_CREDENTIAL: 'synthetic-test-credential',
      ...extraEnvironment,
    },
  });
  const logFile = path.join(scenario.repo, '.factory-lifecycle.log');
  const environmentLogFile = path.join(scenario.repo, '.factory-lifecycle-env.jsonl');
  const operationLog = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
    : [];
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  const environmentLog = fs.existsSync(environmentLogFile)
    ? fs.readFileSync(environmentLogFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  if (fs.existsSync(environmentLogFile)) fs.unlinkSync(environmentLogFile);
  return {
    result,
    payload: JSON.parse(result.stdout),
    lifecycle: fs.existsSync(lifecycleFile) ? readData(lifecycleFile) : null,
    observation: fs.existsSync(observationFile) ? readData(observationFile) : null,
    results: fs.existsSync(path.join(evidenceRoot, 'results.json')) ? readData(path.join(evidenceRoot, 'results.json')) : null,
    operationLog,
    environmentLog,
  };
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
  assert.deepEqual(validateDeliveryWorkflowTemplates({ root: repository, requireActiveWorkflows: false }), []);

  const result = runNode('scripts/validate-delivery.mjs', [
    '--package', 'scripts/fixtures/factory-delivery',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--allow-unadopted-workflows',
    '--json',
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).summary.findings, 0);
});

test('Factory CI records the protected policy boundary instead of a stale pull-request ban', () => {
  const legacy = fixture('ci.yaml');
  legacy.security.no_pull_request_target_checkout = true;
  delete legacy.security.policy_definition_source;
  const findings = validateFactoryCi(legacy);
  expectCode(findings, 'factory-ci-security-weakened');
  expectCode(findings, 'delivery-unknown-field');
});

test('the delivery contract is draft-only and forbids every elevated repository action', () => {
  const ci = fixture('ci.yaml');
  const contract = fixture('pr-draft.yaml');
  assert.deepEqual(validatePrDraft(contract, ci), []);
  assert.equal(contract.draft, true);
  assert.deepEqual(
    new Set(contract.forbidden_actions),
    new Set(['push', 'approve', 'mark_ready', 'merge', 'force_push']),
  );
  assert.deepEqual(Object.fromEntries(Object.entries(contract.permissions)), {
    actions: 'read',
    contents: 'read',
    checks: 'read',
    pull_requests: 'write',
  });
  assert.equal(contract.authorization.required, true);
});

test('acceptance criteria require exact oracle-linked test markers', () => {
  const linked = fixture('acceptance-plan.yaml');
  assert.deepEqual(validateAcceptancePlan(linked, { root: repository, checkFiles: true }), []);

  const missingCriteria = clone(linked);
  delete missingCriteria.cases[0].oracle[0].criteria;
  expectCode(validateAcceptancePlan(missingCriteria, { root: repository, checkFiles: true }), 'acceptance-oracle-criteria-missing');
  expectCode(validateAcceptancePlan(missingCriteria, { root: repository, checkFiles: true }), 'acceptance-criterion-oracle-uncovered');
  assert.equal(buildEvidence({ plan: missingCriteria }).manifest.verdict, 'blocked');

  const unrelatedMarker = clone(linked);
  unrelatedMarker.campaign.adapter = 'command';
  unrelatedMarker.campaign.operation = 'pack-test';
  delete unrelatedMarker.campaign.config;
  unrelatedMarker.cases[0].oracle[0].record_marker = 'a passing label cannot hide failed or absent oracles';
  expectCode(validateAcceptancePlan(unrelatedMarker, { root: repository, checkFiles: true }), 'acceptance-command-oracle-marker-unlinked');
  assert.equal(buildEvidence({ plan: unrelatedMarker }).manifest.verdict, 'blocked');

  const missingMarker = clone(unrelatedMarker);
  delete missingMarker.cases[0].oracle[0].record_marker;
  expectCode(validateAcceptancePlan(missingMarker, { root: repository, checkFiles: true }), 'acceptance-command-oracle-marker-missing');
});

test('command acceptance requires a structured passed record for each exact test title', () => {
  const passed = parseStructuredTestResults('ok 1 - exact title\nFACTORY_TEST_RESULT {"id":"json title","status":"passed"}\n');
  assert.equal(passed.get('exact title'), 'passed');
  assert.equal(passed.get('json title'), 'passed');

  const skipped = parseStructuredTestResults('ok 1 - exact title # SKIP disabled\n');
  assert.equal(skipped.get('exact title'), 'skipped');
  const misleading = parseStructuredTestResults("# Subtest: exact title\ntest('exact title', { skip: true })\n");
  assert.equal(misleading.has('exact title'), false);
  const conflicting = parseStructuredTestResults('ok 1 - exact title\nnot ok 2 - exact title\n');
  assert.equal(conflicting.get('exact title'), 'blocked');
});

test('installable delivery workflows are present in the npm package', () => {
  const npmCache = temporary('factory-npm-cache-');
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: npmCache },
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const files = new Set(JSON.parse(packed.stdout)[0].files.map((item) => item.path));
  for (const name of ['factory-policy.workflow.yml', 'factory-acceptance.workflow.yml', 'factory-release.workflow.yml', 'factory-draft-pr.workflow.yml']) {
    assert.ok(files.has(`.github/templates/software-factory/delivery/${name}`), `${name} is absent from npm pack`);
  }
  for (const shipped of ['scripts/factory-acceptance.mjs', 'scripts/factory-stage-evidence.mjs', 'scripts/factory-release.mjs', 'scripts/factory-actions-attestation.mjs', 'scripts/factory-workflow-context.mjs', 'scripts/factory-ci-check.mjs', 'scripts/test-factory-suite.mjs', 'scripts/lib/factory-delivery/cleanup.mjs', 'scripts/lib/factory-delivery/execution-boundary.mjs', 'scripts/adapters/command/run.mjs', 'scripts/adapters/playwright/recording.mjs', 'scripts/adapters/playwright/storage.mjs']) {
    assert.ok(files.has(shipped), `${shipped} is absent from npm pack`);
  }
});

test('the real npm tarball runs the portable suite without dispatching the consumer test script', () => {
  const packRoot = temporary('factory-packed-consumer-');
  const npmCache = temporary('factory-packed-npm-cache-');
  const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', packRoot], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: npmCache },
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const [{ filename }] = JSON.parse(packed.stdout);
  const extractRoot = path.join(packRoot, 'extract');
  fs.mkdirSync(extractRoot);
  const extracted = spawnSync('tar', ['-xzf', path.join(packRoot, filename), '-C', extractRoot], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(extracted.status, 0, extracted.stderr || extracted.stdout);
  const consumer = path.join(extractRoot, 'package');
  fs.writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify({
    name: 'factory-consumer-fixture',
    private: true,
    type: 'module',
    scripts: {
      test: `node -e "require('node:fs').writeFileSync('consumer-test-ran','unsafe');process.exit(99)"`,
    },
  }, null, 2)}\n`, 'utf8');
  const execution = spawnSync(process.execPath, ['scripts/test-factory-suite.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.equal(fs.existsSync(path.join(consumer, 'consumer-test-ran')), false);
  assert.match(execution.stdout, /every learning catalogue fixture actually executes and passes by exact name/);
  assert.match(execution.stdout, /5\/5 Factory suite checks passed/);
});

test('portable Factory suite never dispatches the consumer package test script', () => {
  const root = temporary('factory-portable-suite-');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(repository, 'scripts/test-factory-suite.mjs'), path.join(root, 'scripts/test-factory-suite.mjs'));
  fs.mkdirSync(path.join(root, 'scripts/lib/factory-v3'), { recursive: true });
  fs.copyFileSync(path.join(repository, 'scripts/lib/factory-v3/child-environment.mjs'), path.join(root, 'scripts/lib/factory-v3/child-environment.mjs'));
  fs.mkdirSync(path.join(root, 'scripts/factory-fixtures'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/factory-fixtures/catalog.json'), `${JSON.stringify({
    fixtures: [{
      id: 'portable-list-fixture',
      polarity: 'positive',
      test_file: 'scripts/portable-fixture.mjs',
      test_name: 'portable fixture exact name',
    }],
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    type: 'module',
    scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'npm-test-ran\', \'unsafe\')"' },
  }));
  for (const relative of [
    'scripts/test-runtime-sources.mjs',
    'scripts/test-factory-v3.mjs',
    'scripts/validate-factory.mjs',
    'scripts/validate-delivery.mjs',
    'scripts/test-factory-learning.mjs',
  ]) {
    fs.writeFileSync(path.join(root, relative), `process.stdout.write(${JSON.stringify(`${relative} executed\n`)});\n`);
  }
  const execution = spawnSync(process.execPath, ['scripts/test-factory-suite.mjs'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.equal(fs.existsSync(path.join(root, 'npm-test-ran')), false);
  assert.match(execution.stdout, /5\/5 Factory suite checks passed/);
  const listed = spawnSync(process.execPath, ['scripts/test-factory-suite.mjs', '--list'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(listed.status, 0, listed.stderr || listed.stdout);
  assert.equal(JSON.parse(listed.stdout).learning_fixtures[0].test_name, 'portable fixture exact name');
});

test('ordinary repository CI operation runs with a scrubbed process environment', () => {
  const root = temporary('factory-ci-check-');
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.copyFileSync(
    adoptedWorkflowSource('factory-policy.yml'),
    path.join(root, '.github/workflows/factory-policy.yml'),
  );
  const ci = fixture('ci.yaml');
  const check = ci.checks.find((item) => item.id === 'factory-application-ci');
  ci.operations[check.operation] = {
    argv: [process.execPath, '-e', 'process.exit(process.env.FACTORY_STOLEN_SECRET || process.env.GITHUB_TOKEN || process.env.ACTIONS_RUNTIME_TOKEN || process.env.FACTORY_PARENT_HOME || !/factory-policy-operation-/.test(process.env.HOME || "") ? 9 : 0)'],
    cwd: '.',
    timeout_seconds: 30,
    privilege: 'unprivileged',
    side_effect: 'none',
  };
  writeData(path.join(root, 'ci.json'), ci);
  const execution = runNode('scripts/factory-ci-check.mjs', [
    '--root', root,
    '--ci', 'ci.json',
    '--check', 'factory-application-ci',
    '--json',
  ], {
    env: {
      FACTORY_STOLEN_SECRET: 'must-not-cross-boundary',
      GITHUB_TOKEN: 'must-not-cross-boundary',
      ACTIONS_RUNTIME_TOKEN: 'must-not-cross-boundary',
      FACTORY_PARENT_HOME: process.env.HOME || '/parent-home',
    },
  });
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  assert.match(execution.stdout, /"outcome": "pass"/);
});

test('repository ordinary CI produces every locally declared non-protected required check', () => {
  const workflow = fs.readFileSync(path.join(repository, '.github/workflows/factory-ordinary-ci.yml'), 'utf8');
  const ci = readData(path.join(repository, 'doc/project/cicd/FACTORY_CI.yaml'));
  for (const checkId of ['factory-application-ci', 'factory-delivery-validation']) {
    const check = ci.checks.find((candidate) => candidate.id === checkId);
    assert.ok(check?.required, `${checkId} must remain a required repository check`);
    assert.match(workflow, new RegExp(`name: ${check.provider_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(workflow, new RegExp(`--check ${checkId}`));
  }
  assert.match(workflow, /\n\s+pull_request:\s*\n/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read\s*\n/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|(?:^|\s)(?:write-all|[a-z-]+:\s*write)(?:\s|$)/m);
  assert.doesNotMatch(workflow, /uses:\s*[^@\s]+@(?![0-9a-f]{40}(?:\s|#|$))/);
});

test('workflow validation rejects direct shell interpolation and active/template drift', () => {
  const root = temporary('factory-workflow-negative-');
  fs.mkdirSync(path.join(root, '.github/templates/software-factory'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.cpSync(
    path.join(repository, '.github/templates/software-factory/delivery'),
    path.join(root, '.github/templates/software-factory/delivery'),
    { recursive: true },
  );
  for (const active of ['factory-policy.yml', 'factory-acceptance.yml', 'factory-release.yml', 'factory-draft-pr.yml']) {
    installAdoptedWorkflow(root, active);
  }
  const acceptance = path.join(root, '.github/templates/software-factory/delivery/factory-acceptance.workflow.yml');
  const acceptanceText = fs.readFileSync(acceptance, 'utf8').replace(
    '--github-output "$GITHUB_OUTPUT" --json',
    '--github-output "$GITHUB_OUTPUT" --json && echo "${{ github.event.client_payload.run_id }}"',
  );
  fs.writeFileSync(acceptance, acceptanceText, 'utf8');
  const policy = path.join(root, '.github/templates/software-factory/delivery/factory-policy.workflow.yml');
  fs.writeFileSync(policy, fs.readFileSync(policy, 'utf8').replace(
    '$GITHUB_WORKSPACE/factory-controller/scripts/test-factory-suite.mjs',
    '$GITHUB_WORKSPACE/candidate/scripts/test-factory-suite.mjs',
  ), 'utf8');
  const findings = validateDeliveryWorkflowTemplates({ root });
  expectCode(findings, 'delivery-workflow-input-shell-interpolation');
  expectCode(findings, 'delivery-workflow-template-incomplete');
  expectCode(findings, 'delivery-workflow-active-drift');
});

test('required policy rejects an unprotected definition, checkout or validator', () => {
  const protectedPolicy = fs.readFileSync(adoptedWorkflowSource('factory-policy.yml'), 'utf8');
  assert.doesNotMatch(protectedPolicy, /factory-ci-check|working-directory:\s*candidate|\bnpm\s+(?:ci|install|test)\b/);

  const sourceFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    'pull_request_target:',
    'pull_request:',
  ));
  expectCode(sourceFindings, 'delivery-policy-definition-source-invalid');

  const controllerFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    'ref: ${{ vars.FACTORY_CONTROLLER_SHA }}',
    'ref: ${{ github.event.pull_request.head.sha }}',
  ));
  expectCode(controllerFindings, 'delivery-workflow-checkout-boundary-invalid');

  const validatorFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    '$GITHUB_WORKSPACE/factory-controller/scripts/validate-factory.mjs',
    '$GITHUB_WORKSPACE/candidate/scripts/validate-factory.mjs',
  ));
  expectCode(validatorFindings, 'delivery-workflow-trust-anchor-invalid');

  const orderFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    '  validate:\n    runs-on:',
    '  validate:\n    needs: candidate-check\n    runs-on:',
  ));
  expectCode(orderFindings, 'delivery-policy-job-order-invalid');

  const secretFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    '      FACTORY_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha }}',
    '      FACTORY_CANDIDATE_SHA: ${{ github.event.pull_request.head.sha }}\n      FACTORY_STOLEN_SECRET: ${{ secrets.APPLICATION_TOKEN }}',
  ));
  expectCode(secretFindings, 'delivery-workflow-secret-scope-invalid');

  const executionFindings = mutateWorkflowTemplate('factory-policy.workflow.yml', (text) => text.replace(
    '      - name: Corpus\n',
    '      - name: Unsafe candidate operation\n        id: candidate-operation\n        working-directory: candidate\n        run: node scripts/validate-delivery.mjs\n      - name: Corpus\n',
  ));
  expectCode(executionFindings, 'delivery-workflow-trust-anchor-invalid');
});

test('candidate exit-zero validators cannot replace the protected policy guard', () => {
  const root = temporary('factory-malicious-policy-candidate-');
  fs.mkdirSync(path.join(root, '.github/templates'), { recursive: true });
  fs.cpSync(
    path.join(repository, '.github/templates/software-factory'),
    path.join(root, '.github/templates/software-factory'),
    { recursive: true },
  );
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  for (const active of ['factory-policy.yml', 'factory-acceptance.yml', 'factory-release.yml', 'factory-draft-pr.yml']) {
    installAdoptedWorkflow(root, active);
  }
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/validate-delivery.mjs'), 'process.exit(0);\n', 'utf8');
  for (const relative of [
    '.github/templates/software-factory/delivery/factory-policy.workflow.yml',
    '.github/workflows/factory-policy.yml',
  ]) {
    const file = path.join(root, relative);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(
      '$GITHUB_WORKSPACE/factory-controller/scripts/validate-delivery.mjs',
      '$GITHUB_WORKSPACE/candidate/scripts/validate-delivery.mjs',
    ), 'utf8');
  }
  const marker = path.join(root, 'candidate-validator-ran');
  fs.writeFileSync(path.join(root, 'scripts/validate-delivery.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'unsafe'); process.exit(0);\n`, 'utf8');
  const execution = runNode('scripts/validate-delivery.mjs', [
    '--root', root,
    '--lint-template',
    '--allow-unadopted-workflows',
    '--json',
  ]);
  assert.equal(execution.status, 2, execution.stderr || execution.stdout);
  assert.equal(fs.existsSync(marker), false, 'candidate validator executed instead of the protected controller validator');
  assert.match(execution.stdout, /delivery-workflow-trust-anchor-invalid/);
});

test('draft PR workflow rejects candidate-controlled controller code and trust anchors', () => {
  const checkoutFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    'ref: ${{ vars.FACTORY_CONTROLLER_SHA }}',
    'ref: ${{ github.event.client_payload.head_sha }}',
  ));
  expectCode(checkoutFindings, 'delivery-workflow-checkout-boundary-invalid');

  const candidateDefinitionFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text
    .replace('repository_dispatch:\n    types: [factory-draft-pr]', 'workflow_dispatch:')
    .replace('    if: ${{ github.sha == vars.FACTORY_CONTROLLER_SHA }}\n', ''));
  expectCode(candidateDefinitionFindings, 'delivery-workflow-definition-source-invalid');
  expectCode(candidateDefinitionFindings, 'delivery-workflow-controller-pin-missing');

  const guardFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    '$GITHUB_WORKSPACE/factory-controller/scripts/factory-pr.mjs',
    '$GITHUB_WORKSPACE/candidate/scripts/factory-pr.mjs',
  ));
  expectCode(guardFindings, 'delivery-workflow-template-incomplete');
  expectCode(guardFindings, 'delivery-workflow-trust-anchor-invalid');

  const keyFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    '${{ vars.FACTORY_AUTHORIZATION_PUBLIC_KEY_PATH }}',
    '${{ inputs.authorization_receipt_json }}',
  ));
  expectCode(keyFindings, 'delivery-workflow-trust-anchor-invalid');
});

test('every privileged workflow rejects candidate-defined dispatch and an unpinned controller revision', () => {
  for (const [file, eventType, job] of [
    ['factory-acceptance.workflow.yml', 'factory-acceptance', 'acceptance'],
    ['factory-release.workflow.yml', 'factory-release', 'release'],
    ['factory-draft-pr.workflow.yml', 'factory-draft-pr', 'draft-pr'],
  ]) {
    const triggerFindings = mutateWorkflowTemplate(file, (text) => text.replace(
      `repository_dispatch:\n    types: [${eventType}]`,
      'workflow_dispatch:',
    ));
    expectCode(triggerFindings, 'delivery-workflow-definition-source-invalid');

    const typeFindings = mutateWorkflowTemplate(file, (text) => text.replace(
      `types: [${eventType}]`,
      'types: [candidate-controlled]',
    ));
    expectCode(typeFindings, 'delivery-workflow-definition-source-invalid');

    // Drop the job-level pin wherever it sits, so a comment above it cannot
    // silently turn this mutation into a no-op and the assertion into a
    // tautology.
    const pinFindings = mutateWorkflowTemplate(file, (text) => {
      const withoutPin = text.replace(/^ {4}if: \$\{\{ github\.sha == vars\.FACTORY_CONTROLLER_SHA \}\}\n/m, '');
      assert.notEqual(withoutPin, text, `${file}: the controller pin was not found to remove`);
      return withoutPin;
    });
    expectCode(pinFindings, 'delivery-workflow-controller-pin-missing');
  }
});

test('acceptance workflow keeps candidate execution credential-free and controller-owned', () => {
  const secretFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    '    steps:\n',
    '      FACTORY_STOLEN_CREDENTIAL: ${{ secrets.FACTORY_ACCEPTANCE_EPHEMERAL_CREDENTIAL }}\n    steps:\n',
  ));
  expectCode(secretFindings, 'delivery-workflow-secret-scope-invalid');

  const installFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    '      - name: Run protected lifecycle and selected acceptance adapter',
    '      - name: Unsafe candidate dependency install\n        working-directory: candidate\n        run: npm ci\n      - name: Run protected lifecycle and selected acceptance adapter',
  ));
  expectCode(installFindings, 'delivery-workflow-candidate-install-unsafe');

  const adapterFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    '$GITHUB_WORKSPACE/factory-controller/scripts/factory-acceptance.mjs',
    '$GITHUB_WORKSPACE/candidate/scripts/factory-acceptance.mjs',
  ));
  expectCode(adapterFindings, 'delivery-workflow-template-incomplete');
  expectCode(adapterFindings, 'delivery-workflow-protected-controller-command-invalid');
});

test('acceptance workflow rejects raw upload and retention detached from the selected CI contract', () => {
  const rawFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    'path: ${{ runner.temp }}/factory-evidence-staging',
    'path: ${{ runner.temp }}',
  ));
  expectCode(rawFindings, 'delivery-workflow-staging-upload-invalid');

  const retentionFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replaceAll(
    'retention-days: ${{ steps.contract.outputs.retention_days }}',
    'retention-days: 30',
  ));
  expectCode(retentionFindings, 'delivery-workflow-retention-source-invalid');

  const contractFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    '--ci "$FACTORY_INPUT_CI"',
    '--ci "fixed-ci.yaml"',
  ));
  expectCode(contractFindings, 'delivery-workflow-ci-contract-source-invalid');
});

test('protected workflows reject extra executable, action and permission surfaces', () => {
  const runFindings = mutateWorkflowTemplate('factory-acceptance.workflow.yml', (text) => text.replace(
    '      - name: Enforce honest campaign verdict\n',
    '      - name: Execute candidate bypass\n        run: node "$GITHUB_WORKSPACE/candidate/scripts/factory-pr.mjs"\n      - name: Enforce honest campaign verdict\n',
  ));
  expectCode(runFindings, 'delivery-workflow-run-surface-invalid');

  const actionFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    '      - name: Materialize signed external authorization receipt\n',
    '      - name: Unexpected privileged action\n        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\n        with:\n          name: bypass\n          path: candidate\n      - name: Materialize signed external authorization receipt\n',
  ));
  expectCode(actionFindings, 'delivery-workflow-action-surface-invalid');

  const permissionFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    '  pull-requests: write\n',
    '  pull-requests: write\n  packages: write\n',
  ));
  expectCode(permissionFindings, 'delivery-workflow-permission-surface-invalid');

  const jobPermissionFindings = mutateWorkflowTemplate('factory-draft-pr.workflow.yml', (text) => text.replace(
    '    timeout-minutes: 20\n',
    '    timeout-minutes: 20\n    permissions: write-all\n',
  ));
  expectCode(jobPermissionFindings, 'delivery-workflow-job-surface-invalid');
});

test('protected workflow context binds disjoint full SHAs and exports selected CI retention', () => {
  const controller = fs.realpathSync(temporary('factory-controller-checkout-'));
  fs.writeFileSync(path.join(controller, 'README.md'), 'protected controller fixture\n', 'utf8');
  git(controller, ['init', '--quiet']);
  git(controller, ['config', 'user.email', 'fixture@example.invalid']);
  git(controller, ['config', 'user.name', 'Fixture']);
  git(controller, ['add', '.']);
  git(controller, ['commit', '--quiet', '-m', 'protected controller']);
  const controllerSha = git(controller, ['rev-parse', 'HEAD']);

  const candidate = fs.realpathSync(temporary('factory-candidate-checkout-'));
  fs.mkdirSync(path.join(candidate, 'scripts/fixtures/factory-delivery'), { recursive: true });
  fs.mkdirSync(path.join(candidate, '.github/workflows'), { recursive: true });
  const ci = fixture('ci.yaml');
  ci.artifacts.retention_days = 17;
  writeData(path.join(candidate, 'scripts/fixtures/factory-delivery/ci.yaml'), ci);
  installAdoptedWorkflow(candidate, 'factory-policy.yml');
  git(candidate, ['init', '--quiet']);
  git(candidate, ['config', 'user.email', 'fixture@example.invalid']);
  git(candidate, ['config', 'user.name', 'Fixture']);
  git(candidate, ['add', '.']);
  git(candidate, ['commit', '--quiet', '-m', 'candidate contract']);
  const candidateSha = git(candidate, ['rev-parse', 'HEAD']);
  const githubOutput = path.join(fs.realpathSync(temporary('factory-context-output-')), 'github-output');
  fs.writeFileSync(githubOutput, '', { encoding: 'utf8', mode: 0o600 });
  const common = [
    '--controller-root', controller,
    '--controller-sha', controllerSha,
    '--candidate-root', candidate,
    '--candidate-sha', candidateSha,
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--github-output', githubOutput,
    '--json',
  ];
  const result = runNode('scripts/factory-workflow-context.mjs', common);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'retention_days=17\n');

  const stale = runNode('scripts/factory-workflow-context.mjs', common.map((value, index, values) => values[index - 1] === '--controller-sha' ? 'f'.repeat(40) : value));
  assert.equal(stale.status, 1, stale.stderr || stale.stdout);
  assert.match(JSON.parse(stale.stdout).findings[0].message, /does not match/);

  const linkedController = path.join(fs.realpathSync(temporary('factory-controller-link-parent-')), 'controller');
  fs.symlinkSync(controller, linkedController, 'dir');
  const linked = runNode('scripts/factory-workflow-context.mjs', common.map((value, index, values) => values[index - 1] === '--controller-root' ? linkedController : value));
  assert.equal(linked.status, 1, linked.stderr || linked.stdout);
  assert.match(JSON.parse(linked.stdout).findings[0].message, /symbolic|real directory/);
});

test('the acceptance workflow installs the browser declared by the CI contract', () => {
  const templateRoot = path.join(repository, '.github/templates/software-factory/delivery');
  const ci = readData(path.join(templateRoot, 'factory-ci.yaml'));
  assert.deepEqual(ci.operations['acceptance-browser-bootstrap'].argv, [
    './node_modules/.bin/playwright',
    'install',
    '--with-deps',
    'chromium',
  ]);
  const workflow = fs.readFileSync(path.join(templateRoot, 'factory-acceptance.workflow.yml'), 'utf8');
  assert.match(workflow, /node ["']?\$GITHUB_WORKSPACE\/factory-controller\/scripts\/factory-acceptance\.mjs/);
  const planTemplate = readData(path.join(repository, '.github/templates/software-factory/acceptance/acceptance-plan.yaml'));
  assert.equal(planTemplate.campaign.bootstrap_operation, 'acceptance-browser-bootstrap');
  assert.deepEqual(validateDeliveryWorkflowTemplates({ root: repository, requireActiveWorkflows: false }), []);
});

test('copied Playwright packages discover planned tests and retain protected failure media', () => {
  const copiedRoot = temporary('factory-copied-playwright-package-');
  const packageRelative = 'doc/spec/1.0.0/COPIED';
  const packageRoot = path.join(copiedRoot, packageRelative);
  fs.mkdirSync(path.dirname(packageRoot), { recursive: true });
  fs.cpSync(fixtureRoot, packageRoot, { recursive: true });
  const planFile = path.join(packageRoot, 'acceptance-plan.yaml');
  const plan = readData(planFile);
  plan.spec_ref = `${packageRelative}/SPECIFICATION.md`;
  plan.campaign.config = `${packageRelative}/playwright.config.mjs`;
  plan.cases[0].test_ref.path = `${packageRelative}/tests/feature.spec.mjs`;
  writeData(planFile, plan);
  const discovery = resolvePlannedPlaywrightInputs({ root: copiedRoot, planFile, plan });
  assert.equal(discovery.testDir, fs.realpathSync(path.join(packageRoot, 'tests')));
  assert.deepEqual(discovery.tests, [fs.realpathSync(path.join(packageRoot, 'tests/feature.spec.mjs'))]);
  assert.match(fs.readFileSync(discovery.tests[0], 'utf8'), /test\('CASE-001 fixture behaviour'/);
  const config = fs.readFileSync(path.join(repository, '.github/templates/software-factory/acceptance/playwright.config.mjs'), 'utf8');
  assert.match(config, /screenshot: 'only-on-failure'/);
  assert.match(config, /trace: 'retain-on-failure'/);
  assert.match(config, /video: 'retain-on-failure'/);
  assert.match(fs.readFileSync(path.join(repository, 'scripts/factory-stage-evidence.mjs'), 'utf8'), /raw_replay_only/);
});

test('the installable acceptance lifecycle blocks before any candidate process without an isolated executor', () => {
  const scenario = buildAcceptanceLifecycleScenario();

  const passingSha = configureAcceptanceLifecycleScenario(scenario);
  const passing = runAcceptanceLifecycleScenario(scenario, 'passing', passingSha);
  assert.equal(passing.result.status, 2, passing.result.stderr || passing.result.stdout);
  expectCode(passing.payload.findings, 'acceptance-execution-boundary-unavailable');
  expectCode(passing.payload.findings, 'acceptance-egress-enforcement-unavailable');
  assert.deepEqual(passing.operationLog, []);
  assert.deepEqual(passing.environmentLog, []);
  assert.equal(passing.observation.status, 'blocked');
  assert.ok(passing.observation.operations.every((operation) => operation.outcome === 'planned' && operation.stdout === '' && operation.stderr === ''));
  assert.deepEqual(passing.lifecycle.lifecycle, []);
  assert.equal(passing.lifecycle.boundary.status, 'blocked');
  assert.equal(passing.results.overall_status, 'blocked');
  assert.ok(passing.results.cases.every((testCase) => testCase.outcome === 'blocked' && testCase.attempts === 0));
  assert.equal(JSON.stringify({ observation: passing.observation, lifecycle: passing.lifecycle, results: passing.results }).includes('synthetic-test-credential'), false);
  return;
  assert.equal(passing.result.status, 0, passing.result.stderr || passing.result.stdout);
  assert.equal(passing.payload.summary.status, 'passed');
  assert.deepEqual(passing.payload.findings, []);
  assert.deepEqual(passing.operationLog, [
    'build',
    'start',
    'health',
    'revision',
    'schema',
    'dataset',
    'credential',
    'acceptance',
    'reset',
    'stop',
  ]);
  assert.deepEqual(passing.environmentLog.map((entry) => [entry.role, entry.protected_credential]), [
    ['build', false],
    ['start', false],
    ['health', false],
    ['revision', false],
    ['schema', false],
    ['dataset', false],
    ['credential', false],
    ['acceptance', false],
    ['reset', false],
    ['stop', false],
  ]);
  assert.ok(passing.environmentLog.every((entry) => entry.raw_storage_json === false));
  assert.equal(passing.observation.status, 'ready');
  assert.equal(passing.observation.subject_sha, passingSha);
  assert.equal(passing.observation.deployed_revision, passingSha);
  assert.deepEqual(passing.observation.operations.map((operation) => operation.id), [
    'fixture-health',
    'fixture-revision',
    'fixture-schema',
    'fixture-dataset',
    'fixture-credential',
  ]);
  assert.deepEqual(passing.lifecycle.lifecycle.map((operation) => operation.role), ['build', 'start', 'reset', 'stop']);
  assert.equal(passing.lifecycle.adapter.adapter, 'command');
  assert.equal(passing.lifecycle.adapter.exit_code, 0);
  assert.equal(passing.results.overall_status, 'passed');
  assert.equal(passing.results.toolchain.adapter, 'command');
  assert.deepEqual(passing.results.cases[0].oracle_results, [{ id: 'fixture-oracle', outcome: 'pass', recorded: true }]);

  const adapterFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'acceptance' });
  const adapterFailure = runAcceptanceLifecycleScenario(scenario, 'adapter-failure', adapterFailureSha);
  assert.equal(adapterFailure.result.status, 2, adapterFailure.result.stderr || adapterFailure.result.stdout);
  expectCode(adapterFailure.payload.findings, 'acceptance-adapter-failed');
  assert.equal(adapterFailure.lifecycle.adapter.exit_code, 2);
  assert.equal(adapterFailure.results.overall_status, 'failed');
  assert.deepEqual(adapterFailure.operationLog, [
    'build',
    'start',
    'health',
    'revision',
    'schema',
    'dataset',
    'credential',
    'acceptance',
    'reset',
    'stop',
  ]);

  const healthFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'health' });
  const healthFailure = runAcceptanceLifecycleScenario(scenario, 'health-failure', healthFailureSha);
  assert.equal(healthFailure.result.status, 2, healthFailure.result.stderr || healthFailure.result.stdout);
  expectCode(healthFailure.payload.findings, 'acceptance-lifecycle-not-ready');
  assert.equal(healthFailure.lifecycle.adapter, null);
  assert.equal(healthFailure.results, null);
  assert.deepEqual(healthFailure.operationLog, [
    'build',
    'start',
    'health',
    'revision',
    'schema',
    'dataset',
    'credential',
    'reset',
    'stop',
  ]);

  const buildFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'build' });
  const buildFailure = runAcceptanceLifecycleScenario(scenario, 'build-failure', buildFailureSha);
  assert.equal(buildFailure.result.status, 2, buildFailure.result.stderr || buildFailure.result.stdout);
  expectCode(buildFailure.payload.findings, 'acceptance-lifecycle-not-ready');
  assert.deepEqual(buildFailure.operationLog, ['build', 'reset', 'stop']);

  const startFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'start' });
  const startFailure = runAcceptanceLifecycleScenario(scenario, 'start-failure', startFailureSha);
  assert.equal(startFailure.result.status, 2, startFailure.result.stderr || startFailure.result.stdout);
  expectCode(startFailure.payload.findings, 'acceptance-lifecycle-not-ready');
  assert.deepEqual(startFailure.operationLog, ['build', 'start', 'reset', 'stop']);

  const resetFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'reset' });
  const resetFailure = runAcceptanceLifecycleScenario(scenario, 'reset-failure', resetFailureSha);
  assert.equal(resetFailure.result.status, 2, resetFailure.result.stderr || resetFailure.result.stdout);
  expectCode(resetFailure.payload.findings, 'acceptance-reset-failed');
  assert.equal(resetFailure.operationLog.at(-2), 'reset');
  assert.equal(resetFailure.operationLog.at(-1), 'stop');

  const stopFailureSha = configureAcceptanceLifecycleScenario(scenario, { failingRole: 'stop' });
  const stopFailure = runAcceptanceLifecycleScenario(scenario, 'stop-failure', stopFailureSha);
  assert.equal(stopFailure.result.status, 2, stopFailure.result.stderr || stopFailure.result.stdout);
  expectCode(stopFailure.payload.findings, 'acceptance-stop-failed');
  assert.equal(stopFailure.operationLog.at(-1), 'stop');

  const resetExceptionSha = configureAcceptanceLifecycleScenario(scenario, { invalidCwdRole: 'reset' });
  const resetException = runAcceptanceLifecycleScenario(scenario, 'reset-exception', resetExceptionSha);
  assert.equal(resetException.result.status, 2, resetException.result.stderr || resetException.result.stdout);
  expectCode(resetException.payload.findings, 'acceptance-reset-failed');
  assert.equal(resetException.lifecycle.lifecycle.at(-2).role, 'reset');
  assert.equal(resetException.lifecycle.lifecycle.at(-2).outcome, 'fail');
  assert.equal(resetException.operationLog.at(-1), 'stop');
});

test('direct acceptance adapters fail closed before spawn and never forward declared secrets', () => {
  const commandSource = fs.readFileSync(path.join(repository, 'scripts/adapters/command/run.mjs'), 'utf8');
  const playwrightSource = fs.readFileSync(path.join(repository, 'scripts/adapters/playwright/run.mjs'), 'utf8');
  const commandBoundary = commandSource.indexOf("unavailableExecutionBoundaryFinding('direct command adapter execution')");
  const commandSpawn = commandSource.indexOf('const executed = executeOperation');
  const playwrightBoundary = playwrightSource.indexOf("unavailableExecutionBoundaryFinding('direct Playwright adapter execution')");
  const playwrightSpawn = playwrightSource.indexOf('const result = spawnSync');
  assert.ok(commandBoundary > 0 && commandBoundary < commandSpawn);
  assert.ok(playwrightBoundary > 0 && playwrightBoundary < playwrightSpawn);
  assert.equal(commandSource.includes('...asArray(profile?.auth?.secret_refs)'), false);
  assert.equal(playwrightSource.includes('...asArray(profile?.auth?.secret_refs)'), false);
});

test('the lifecycle rejects undeclared storage and never injects secrets into a local runner', () => {
  const scenario = buildAcceptanceLifecycleScenario();
  const environment = readData(scenario.environmentFile);
  const profile = environment.profiles.find((item) => item.id === 'fixture-local');
  profile.auth.mode = 'ephemeral_storage_state';
  profile.auth.secret_refs = ['FACTORY_FIXTURE_CREDENTIAL'];
  writeData(scenario.environmentFile, environment);
  git(scenario.repo, ['add', path.relative(scenario.repo, scenario.environmentFile)]);
  git(scenario.repo, ['commit', '--quiet', '-m', 'declare ephemeral browser authentication without its transport']);
  const storageBase = fs.realpathSync(temporary('factory-storage-lifecycle-'));
  const storageRoot = path.join(storageBase, 'private-browser-state');
  const rawStorageEnvironment = {
    FACTORY_EPHEMERAL_STORAGE_ROOT: storageRoot,
    FACTORY_EPHEMERAL_STORAGE_STATE_JSON: JSON.stringify({ cookies: [], origins: [] }),
  };
  const undeclared = runAcceptanceLifecycleScenario(scenario, 'ephemeral-storage-undeclared', git(scenario.repo, ['rev-parse', 'HEAD']), {
    env: rawStorageEnvironment,
  });
  assert.equal(undeclared.result.status, 2, undeclared.result.stderr || undeclared.result.stdout);
  expectCode(undeclared.payload.findings, 'environment-storage-state-reference-missing');
  assert.deepEqual(undeclared.operationLog, []);
  assert.equal(fs.existsSync(storageRoot), false);

  profile.auth.secret_refs.push('FACTORY_EPHEMERAL_STORAGE_STATE_JSON');
  writeData(scenario.environmentFile, environment);
  git(scenario.repo, ['add', path.relative(scenario.repo, scenario.environmentFile)]);
  git(scenario.repo, ['commit', '--quiet', '-m', 'declare the ephemeral browser state transport']);
  const candidateSha = git(scenario.repo, ['rev-parse', 'HEAD']);
  const run = runAcceptanceLifecycleScenario(scenario, 'ephemeral-storage-local-forbidden', candidateSha, {
    env: rawStorageEnvironment,
  });
  assert.equal(run.result.status, 2, run.result.stderr || run.result.stdout);
  expectCode(run.payload.findings, 'acceptance-secret-broker-unavailable');
  assert.deepEqual(run.operationLog, []);
  assert.equal(fs.existsSync(storageRoot), false);
  assert.equal(run.lifecycle.boundary.status, 'blocked');
});

test('ephemeral storage contracts explicitly support either JSON materialization or a confined state file', () => {
  const ci = fixture('ci.yaml');
  const environment = fixture('environment.yaml');
  const profile = environment.profiles.find((item) => item.id === 'fixture-local');
  profile.auth.mode = 'ephemeral_storage_state';
  profile.auth.secret_refs = ['FACTORY_EPHEMERAL_STORAGE_STATE_JSON'];
  assert.deepEqual(validateEnvironment(environment, ci), []);
  profile.auth.secret_refs = ['FACTORY_EPHEMERAL_STORAGE_STATE'];
  assert.deepEqual(validateEnvironment(environment, ci), []);
  profile.auth.secret_refs = ['FACTORY_FIXTURE_CREDENTIAL'];
  expectCode(validateEnvironment(environment, ci), 'environment-storage-state-reference-missing');
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

test('revision provenance rejects noisy output containing more than one SHA', () => {
  const observation = fixture('observation.json');
  const revision = observation.operations.find((operation) => operation.id === 'fixture-revision');
  revision.stdout = `cached ${subjectSha} CURRENT ${'b'.repeat(40)}\n`;
  const findings = validateEnvironmentObservation(observation, {
    environment: fixture('environment.yaml'),
    ci: fixture('ci.yaml'),
  });
  expectCode(findings, 'environment-revision-not-observed');
  expectCode(findings, 'environment-false-ready');
});

test('an automated profile cannot rely on interactive authentication', () => {
  const scenarios = fixture('scenarios.json');
  const ci = fixture('ci.yaml');
  const environment = fixture('environment.yaml');
  environment.profiles[0].auth.mode = 'interactive';
  environment.profiles[0].auth.automated_compatible = false;
  expectCode(validateEnvironment(environment, ci), scenarios.interactive_auth.expected_code);
});

test('CLI surfaces may be honestly not applicable while server surfaces stay mandatory', () => {
  const ci = fixture('ci.yaml');
  const environment = fixture('environment.yaml');
  assert.deepEqual(validateEnvironment(environment, ci), []);

  const server = clone(environment.profiles.find((profile) => profile.id === 'fixture-cli'));
  server.id = 'invalid-server';
  server.runtime_type = 'server';
  const findings = validateEnvironment({ version: 1, profiles: [server] }, ci);
  expectCode(findings, 'environment-endpoint-required');
  expectCode(findings, 'environment-auth-required');
  expectCode(findings, 'environment-data-required');
  expectCode(findings, 'environment-operation-required');
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

test('declared media and filename cannot turn text bytes into a screenshot', () => {
  const plan = fixture('acceptance-plan.yaml');
  plan.cases[0].evidence.required[0] = {
    id: 'fixture-state',
    type: 'screenshot',
    checkpoint: 'fixture-state',
    media_pii_policy: 'masked_or_synthetic',
    pii_attestation_ref: 'quality/redaction-checkpoint-001',
  };
  const results = fixture('results.json');
  results.plan_digest = sha256Object(plan);
  results.cases[0].evidence[0] = {
    id: 'CASE-001-fixture-state',
    requirement_id: 'fixture-state',
    type: 'screenshot',
    checkpoint: 'fixture-state',
    path: 'CASE-001.png',
    media_type: 'image/png',
    media_pii_policy: 'masked_or_synthetic',
  };
  const artifactsRoot = temporary('factory-fake-screenshot-');
  fs.writeFileSync(path.join(artifactsRoot, 'CASE-001.png'), 'plain text pretending to be an image\n', 'utf8');
  const assembled = assembleEvidence({
    plan,
    environment: fixture('environment.yaml'),
    ci: fixture('ci.yaml'),
    observation: fixture('observation.json'),
    results,
    artifactsRoot,
    repository,
    subjectSha,
    sourceDigest,
  });
  assert.equal(assembled.manifest.verdict, 'blocked');
  expectCode(assembled.findings, 'evidence-artifact-format-mismatch');

  const missingAttestation = clone(plan);
  delete missingAttestation.cases[0].evidence.required[0].pii_attestation_ref;
  expectCode(validateAcceptancePlan(missingAttestation, { root: repository, checkFiles: false }), 'acceptance-media-pii-attestation-missing');
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

test('user-visible errors and adapter substitution block otherwise passing results', () => {
  const resultsWithError = fixture('results.json');
  resultsWithError.cases[0].user_visible_error = true;
  const errorEvidence = buildEvidence({ results: resultsWithError });
  assert.equal(errorEvidence.manifest.verdict, 'blocked');
  assert.equal(errorEvidence.manifest.cases[0].user_visible_error, true);
  expectCode(errorEvidence.findings, 'acceptance-results-user-visible-error');

  const substituted = fixture('results.json');
  substituted.toolchain.adapter = 'command';
  const substitutedEvidence = buildEvidence({ results: substituted });
  assert.equal(substitutedEvidence.manifest.verdict, 'blocked');
  expectCode(substitutedEvidence.findings, 'acceptance-results-adapter-mismatch');
  expectCode(substitutedEvidence.findings, 'evidence-adapter-mismatch');
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

  const forgedCleanup = clone(golden);
  forgedCleanup.mutations[0].cleanup_execution.operation_digest = `sha256:${'f'.repeat(64)}`;
  expectCode(validateEvidence(forgedCleanup, fixture('acceptance-plan.yaml'), { ci: fixture('ci.yaml') }), 'acceptance-cleanup-operation-digest-mismatch');

  const unevidencedCleanup = fixture('results.json');
  delete unevidencedCleanup.mutations[0].cleanup_execution;
  const unevidenced = buildEvidence({ results: unevidencedCleanup });
  assert.equal(unevidenced.manifest.verdict, 'blocked');
  expectCode(unevidenced.findings, 'acceptance-cleanup-execution-missing');
});

test('mutation cleanup executes the exact declared operation and emits hashed-input evidence', () => {
  const root = fs.realpathSync(temporary('factory-cleanup-runner-'));
  const plan = { mutations: [{ id: 'fixture-record', cleanup_required: true, cleanup_operation: 'fixture-cleanup' }] };
  const baseResults = {
    cases: [{ id: 'CASE-001', evidence: [] }],
    mutations: [{ id: 'fixture-record', outcome: 'applied', cleanup: 'pending', cleanup_evidence_ids: [] }],
  };
  const run = (exitCode) => {
    const evidenceRoot = fs.realpathSync(temporary(`factory-cleanup-${exitCode}-`));
    writeData(path.join(evidenceRoot, 'results.json'), clone(baseResults));
    const ci = {
      operations: {
        'fixture-cleanup': {
          argv: [process.execPath, '-e', `process.exit(${exitCode})`],
          cwd: '.',
          timeout_seconds: 30,
          privilege: 'unprivileged',
          side_effect: 'cleanup',
        },
      },
    };
    const lifecycle = [];
    const ready = runMutationCleanups({ root, ci, plan, lifecycle, env: { PATH: process.env.PATH }, evidenceRoot });
    return { ready, lifecycle, results: readData(path.join(evidenceRoot, 'results.json')), evidenceRoot };
  };
  const passed = run(0);
  assert.equal(passed.ready, true);
  assert.equal(passed.lifecycle[0].role, 'mutation_cleanup');
  assert.equal(passed.results.mutations[0].cleanup, 'passed');
  assert.equal(passed.results.mutations[0].cleanup_execution.exit_code, 0);
  assert.match(passed.results.mutations[0].cleanup_execution.operation_digest, /^sha256:[0-9a-f]{64}$/);
  const cleanupEvidenceId = passed.results.mutations[0].cleanup_evidence_ids.at(-1);
  const cleanupEvidence = passed.results.cases[0].evidence.find((item) => item.id === cleanupEvidenceId);
  assert.ok(cleanupEvidence);
  assert.equal(readData(path.join(passed.evidenceRoot, cleanupEvidence.path)).operation_digest, passed.results.mutations[0].cleanup_execution.operation_digest);

  const failed = run(17);
  assert.equal(failed.ready, false);
  assert.equal(failed.results.mutations[0].cleanup, 'failed');
  assert.equal(failed.results.mutations[0].cleanup_execution.exit_code, 17);
  assert.equal(failed.results.mutations[0].cleanup_execution.outcome, 'fail');
});

test('cleanup still runs without reporter results and one exception does not suppress the next finalizer', () => {
  const root = fs.realpathSync(temporary('factory-cleanup-no-results-root-'));
  const evidenceRoot = fs.realpathSync(temporary('factory-cleanup-no-results-evidence-'));
  const marker = path.join(root, 'cleanup-ran.txt');
  const plan = {
    mutations: [
      { id: 'broken-cleanup', cleanup_required: true, cleanup_operation: 'cleanup-broken' },
      { id: 'required-cleanup', cleanup_required: true, cleanup_operation: 'cleanup-required' },
    ],
  };
  const ci = {
    operations: {
      'cleanup-broken': {
        argv: [process.execPath, '-e', 'process.exit(0)'],
        cwd: 'missing-cleanup-directory',
        timeout_seconds: 30,
        privilege: 'unprivileged',
        side_effect: 'cleanup',
      },
      'cleanup-required': {
        argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed\\n')`],
        cwd: '.',
        timeout_seconds: 30,
        privilege: 'unprivileged',
        side_effect: 'cleanup',
      },
    },
  };
  const lifecycle = [];
  const ready = runMutationCleanups({ root, ci, plan, lifecycle, env: { PATH: process.env.PATH }, evidenceRoot });
  assert.equal(ready, false);
  assert.equal(fs.existsSync(path.join(evidenceRoot, 'results.json')), false);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'executed\n');
  assert.deepEqual(lifecycle.map((entry) => [entry.mutation_id, entry.outcome]), [
    ['broken-cleanup', 'fail'],
    ['required-cleanup', 'pass'],
  ]);
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
    oracle: [{ id: 'fixture-oracle-2', type: 'file', assertion: 'executable', criteria: ['AC-002'] }],
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

test('minimized staging never publishes raw or unreferenced secret files and binds an exact inventory', () => {
  const stagingRepository = temporary('factory-staging-repository-');
  const stagingFixtureRoot = path.join(stagingRepository, 'scripts/fixtures/factory-delivery');
  fs.mkdirSync(path.dirname(stagingFixtureRoot), { recursive: true });
  fs.cpSync(fixtureRoot, stagingFixtureRoot, { recursive: true });
  fs.mkdirSync(path.join(stagingRepository, '.github/workflows'), { recursive: true });
  installAdoptedWorkflow(stagingRepository, 'factory-policy.yml');
  git(stagingRepository, ['init', '--quiet']);
  git(stagingRepository, ['config', 'user.email', 'fixture@example.invalid']);
  git(stagingRepository, ['config', 'user.name', 'Fixture']);
  git(stagingRepository, ['add', '.']);
  git(stagingRepository, ['commit', '--quiet', '-m', 'frozen staging fixture']);
  const stagingSubject = git(stagingRepository, ['rev-parse', 'HEAD']);
  const stagingPlanFile = path.join(stagingFixtureRoot, 'acceptance-plan.yaml');
  const stagingEnvironmentFile = path.join(stagingFixtureRoot, 'environment.yaml');
  const stagingCiFile = path.join(stagingFixtureRoot, 'ci.yaml');
  const raw = temporary('factory-raw-quarantine-');
  const staged = temporary('factory-minimized-stage-');
  const envelope = temporary('factory-stage-envelope-');
  const results = fixture('results.json');
  results.candidate_sha = stagingSubject;
  results.plan_digest = sha256File(stagingPlanFile);
  results.environment_digest = sha256File(stagingEnvironmentFile);
  results.raw_artifacts = [{ path: 'test-results/trace.zip', kind: 'trace', reason: 'retain-on-failure' }];
  writeData(path.join(raw, 'results.json'), results);
  const stagingObservation = fixture('observation.json');
  stagingObservation.subject_sha = stagingSubject;
  stagingObservation.deployed_revision = stagingSubject;
  stagingObservation.environment_contract_digest = sha256File(stagingEnvironmentFile);
  stagingObservation.ci_contract_digest = sha256File(stagingCiFile);
  const stagingRevision = stagingObservation.operations.find((operation) => operation.id === 'fixture-revision');
  stagingRevision.stdout = `${stagingSubject}\n`;
  writeData(path.join(raw, 'environment-observation.json'), stagingObservation);
  writeData(path.join(raw, 'factory-lifecycle.json'), { schema_version: 1, run_id: results.run_id, lifecycle: [], adapter: { exit_code: 2 } });
  fs.copyFileSync(path.join(fixtureRoot, 'evidence/CASE-001.txt'), path.join(raw, 'CASE-001.txt'));
  fs.writeFileSync(path.join(raw, 'junit.xml'), '<testsuite tests="1" failures="1"></testsuite>\n', 'utf8');
  fs.mkdirSync(path.join(raw, 'html-report'));
  fs.writeFileSync(path.join(raw, 'html-report/index.html'), '<!doctype html><title>raw replay only</title>\n', 'utf8');
  fs.mkdirSync(path.join(raw, 'test-results'));
  fs.writeFileSync(path.join(raw, 'test-results/trace.zip'), Buffer.from('504b0506000000000000000000000000000000000000', 'hex'));
  fs.writeFileSync(path.join(raw, 'unreferenced-secret.txt'), 'token=super-secret-value-never-publish\n', 'utf8');
  const stagingManifestFile = path.join(envelope, 'staging-manifest.json');
  const stagedResult = runNode('scripts/factory-stage-evidence.mjs', [
    '--raw-root', raw,
    '--out', staged,
    '--manifest-out', stagingManifestFile,
    '--plan', stagingPlanFile,
    '--json',
  ]);
  assert.equal(stagedResult.status, 2, stagedResult.stderr || stagedResult.stdout);
  const stagingManifest = readData(stagingManifestFile);
  assert.ok(stagingManifest.findings.some((item) => item.code === 'evidence-staging-unreferenced-file'));
  assert.equal(fs.existsSync(path.join(staged, 'unreferenced-secret.txt')), false);
  assert.equal(fs.existsSync(path.join(staged, 'test-results/trace.zip')), false);
  assert.equal(fs.existsSync(path.join(staged, 'html-report/index.html')), false);
  assert.deepEqual(stagingManifest.inventory.map((entry) => entry.path), [
    'CASE-001.txt',
    'environment-observation.json',
    'factory-lifecycle.json',
    'junit.xml',
    'results.json',
  ]);

  const blockedManifestFile = path.join(envelope, 'evidence-manifest.yaml');
  const assembled = runNode('scripts/factory-evidence.mjs', [
    '--root', stagingRepository,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--observation', path.join(staged, 'environment-observation.json'),
    '--results', path.join(staged, 'results.json'),
    '--artifacts-root', staged,
    '--subject-sha', stagingSubject,
    '--out', blockedManifestFile,
    '--ci-run-id', '12345',
    '--ci-artifact-id', '67890',
    '--ci-artifact-url', 'https://github.com/acme/repo/actions/runs/12345/artifacts/67890',
    '--staging-manifest', stagingManifestFile,
    '--json',
  ]);
  assert.equal(assembled.status, 2, assembled.stderr || assembled.stdout);
  const blockedManifest = readData(blockedManifestFile);
  assert.equal(blockedManifest.verdict, 'blocked');
  assert.ok(blockedManifest.generation_findings.some((item) => item.code === 'evidence-staging-unreferenced-file'));

  fs.writeFileSync(path.join(staged, 'unmanifested-extra.txt'), 'extra\n', 'utf8');
  const stale = runNode('scripts/factory-evidence.mjs', [
    '--root', stagingRepository,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--observation', path.join(staged, 'environment-observation.json'),
    '--results', path.join(staged, 'results.json'),
    '--artifacts-root', staged,
    '--subject-sha', stagingSubject,
    '--out', path.join(envelope, 'stale-evidence-manifest.yaml'),
    '--ci-run-id', '12345',
    '--ci-artifact-id', '67890',
    '--ci-artifact-url', 'https://github.com/acme/repo/actions/runs/12345/artifacts/67890',
    '--staging-manifest', stagingManifestFile,
    '--json',
  ]);
  assert.equal(stale.status, 1, stale.stderr || stale.stdout);
  assert.match(JSON.parse(stale.stdout).findings[0].message, /unmanifested extra/);
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

test('an evidence-only manifest never claims its own publication commit', () => {
  const manifest = buildEvidence().manifest;
  manifest.publication = { mode: 'evidence_only_commit' };
  assert.deepEqual(validateEvidence(manifest, fixture('acceptance-plan.yaml')), []);
  manifest.subject.evidence_commit_sha = subjectSha;
  expectCode(validateEvidence(manifest, fixture('acceptance-plan.yaml')), 'evidence-self-referential-sha');
});

test('an evidence-only release event must bind the exact delivered evidence commit', () => {
  const released = buildReleasedDeliveryScenario({ publicationMode: 'evidence_only_commit' });
  const args = [
    '--root', released.repo,
    '--contract', `${released.packageRelative}/pr-draft.yaml`,
    '--evidence', path.basename(released.manifestFile),
    '--plan', `${released.packageRelative}/acceptance-plan.yaml`,
    '--environment', `${released.packageRelative}/environment.yaml`,
    '--ci', `${released.packageRelative}/ci.yaml`,
    '--artifacts-root', released.artifactsRoot,
    '--factory-events', path.basename(released.eventsFile),
    '--factory-state', path.basename(released.stateFile),
    '--release-metadata', path.basename(released.releaseMetadataFile),
    '--release-run-id', '67890',
    '--release-controller-sha', 'f'.repeat(40),
    '--acceptance-run-id', '12345',
    '--evidence-commit-sha', released.evidenceCommitSha,
    '--head-ref', 'fixture/evidence-only',
    '--head-sha', released.evidenceCommitSha,
    '--json',
  ];
  const valid = runNode('scripts/factory-pr.mjs', args);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  const substituted = args.map((value, index, values) => (
    ['--evidence-commit-sha', '--head-sha'].includes(values[index - 1]) ? released.candidateSha : value
  ));
  const blocked = runNode('scripts/factory-pr.mjs', substituted);
  assert.equal(blocked.status, 2, blocked.stderr || blocked.stdout);
  expectCode(JSON.parse(blocked.stdout).findings, 'pr-release-evidence-commit-mismatch');
});

test('the PR contract keeps all delivery authority narrow', () => {
  const scenarios = fixture('scenarios.json');
  const contract = fixture('pr-draft.yaml');
  contract.forbidden_actions = contract.forbidden_actions.filter((action) => action !== 'merge');
  expectCode(validatePrDraft(contract, fixture('ci.yaml')), scenarios.unauthorized_pr_operation.expected_code);
});

test('draft authorization is signed externally and bound to the exact operation', () => {
  const contract = fixture('pr-draft.yaml');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const inputDigests = Object.fromEntries([
    'contract', 'factory_plan', 'factory_events', 'factory_state', 'release_metadata', 'evidence_manifest',
    'acceptance_plan', 'environment_contract', 'ci_contract', 'artifact_bundle', 'acceptance_artifact',
    'acceptance_envelope_artifact', 'release_artifact',
  ].map((key, index) => [key, `sha256:${String(index + 1).repeat(64).slice(0, 64)}`]));
  const payload = {
    version: 1,
    provider: 'github',
    repository: 'acme/repo',
    issuer_ref: contract.authorization.issuer_ref,
    gate_id: contract.authorization.gate_id,
    candidate_sha: subjectSha,
    head_sha: subjectSha,
    head_ref: 'fixture/delivery',
    base_ref: 'main',
    input_digests: inputDigests,
    approver_ref: 'operator/fixture',
    authorized_at: new Date().toISOString(),
    nonce: 'fixture-nonce-0001',
  };
  const receipt = { ...payload, signature: crypto.sign(null, Buffer.from(stableJson(payload)), privateKey).toString('base64') };
  assert.equal(verifyAuthorizationReceipt(receipt, contract, {
    candidateSha: subjectSha,
    prHeadSha: subjectSha,
    headRef: 'fixture/delivery',
    baseRef: 'main',
    inputDigests,
    publicKey,
    repository: 'acme/repo',
  }).gate_id, 'draft-pr');
  assert.throws(() => verifyAuthorizationReceipt({ ...receipt, base_ref: 'other' }, contract, {
    candidateSha: subjectSha,
    prHeadSha: subjectSha,
    headRef: 'fixture/delivery',
    baseRef: 'main',
    inputDigests,
    publicKey,
    repository: 'acme/repo',
  }), /not bound/);

  const tamperedInputDigests = { ...inputDigests, factory_state: `sha256:${'f'.repeat(64)}` };
  assert.throws(() => verifyAuthorizationReceipt(receipt, contract, {
    candidateSha: subjectSha,
    prHeadSha: subjectSha,
    headRef: 'fixture/delivery',
    baseRef: 'main',
    inputDigests: tamperedInputDigests,
    publicKey,
    repository: 'acme/repo',
  }), /factory_state does not match/);
  assert.throws(() => verifyAuthorizationReceipt(receipt, contract, {
    candidateSha: subjectSha,
    prHeadSha: subjectSha,
    headRef: 'fixture/delivery',
    baseRef: 'main',
    inputDigests,
    publicKey,
    repository: 'fork/repo',
  }), /provider or repository/);
});

test('protected release workflow derives the exact release-ready envelope before draft delivery', () => {
  const shallowFindings = mutateWorkflowTemplate('factory-release.workflow.yml', (text) => text.replace(
    '          fetch-depth: 0\n',
    '',
  ));
  expectCode(shallowFindings, 'delivery-workflow-checkout-boundary-invalid');
  const unboundWorkflowShaFindings = mutateWorkflowTemplate('factory-release.workflow.yml', (text) => text.replace(
    '          FACTORY_CONTROLLER_SHA: ${{ vars.FACTORY_CONTROLLER_SHA }}\n',
    '',
  ));
  expectCode(unboundWorkflowShaFindings, 'delivery-workflow-acceptance-attestation-invalid');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const basisModels = [
    { execution_id: 'reviewer-1', model: 'model-reviewer', model_family: 'implementation-review-family' },
    { execution_id: 'worker-1', model: 'model-standard', model_family: 'implementation-family' },
  ];
  const payload = {
    version: 1,
    factory_run_id: 'RUN-12345',
    candidate_sha: subjectSha,
    acceptance_run_id: '12345',
    evidence_manifest_sha256: '1'.repeat(64),
    plan_sha256: '2'.repeat(64),
    spec_sha256: '3'.repeat(64),
    reviewer_execution_id: 'release-reviewer-1',
    reviewer_model: 'model-reviewer',
    verdict: 'passed',
    fresh_context: true,
    reviewer_model_family: 'release-review-family',
    basis_models: [
      { execution_id: 'reviewer-1', model: 'model-reviewer', model_family: 'implementation-review-family' },
      { execution_id: 'worker-1', model: 'model-standard', model_family: 'implementation-family' },
    ],
    basis_model_families: ['implementation-family', 'implementation-review-family'],
    independence_exception: null,
    findings: [],
    reviewed_at: new Date().toISOString(),
    nonce: 'release-review-nonce-0001',
  };
  const sign = (value) => ({ ...value, signature: crypto.sign(null, Buffer.from(stableJson(value)), privateKey).toString('base64') });
  const options = {
    factoryRunId: payload.factory_run_id,
    candidateSha: payload.candidate_sha,
    acceptanceRunId: payload.acceptance_run_id,
    evidenceManifestSha256: payload.evidence_manifest_sha256,
    planSha256: payload.plan_sha256,
    specSha256: payload.spec_sha256,
    reviewerModel: payload.reviewer_model,
    reviewerModelFamily: payload.reviewer_model_family,
    basisModels,
    controllerExecutionId: 'factory-release-controller',
    publicKey,
  };
  assert.equal(verifyReleaseReviewReceipt(sign(payload), options).verdict, 'passed');
  const forgedBasisFamily = {
    ...payload,
    basis_models: payload.basis_models.map((entry) => entry.execution_id === 'worker-1'
      ? { ...entry, model_family: 'forged-independent-family' }
      : entry),
    basis_model_families: ['forged-independent-family', 'implementation-review-family'],
  };
  assert.throws(() => verifyReleaseReviewReceipt(sign(forgedBasisFamily), options), /differs from the event authors/);
  assert.throws(() => verifyReleaseReviewReceipt(sign({ ...payload, reviewer_model_family: 'forged-review-family' }), options), /resolved reviewer policy/);
  assert.throws(() => verifyReleaseReviewReceipt(sign({ ...payload, candidate_sha: 'b'.repeat(40) }), options), /exact release basis/);
  const sameFamily = {
    ...payload,
    reviewer_model_family: 'implementation-family',
    independence_exception: null,
  };
  assert.throws(() => verifyReleaseReviewReceipt(sign(sameFamily), { ...options, reviewerModelFamily: 'implementation-family' }), /independence exception/);
  const unknownFamily = {
    ...payload,
    reviewer_model_family: 'unknown',
    independence_exception: null,
  };
  assert.throws(() => verifyReleaseReviewReceipt(sign(unknownFamily), { ...options, reviewerModelFamily: 'unknown' }), /independence exception/);
  const missingBasis = { ...payload, basis_models: payload.basis_models.slice(1), basis_model_families: ['implementation-family'] };
  assert.throws(() => verifyReleaseReviewReceipt(sign(missingBasis), options), /every event author/);
  const releaseWorkflow = fs.readFileSync(path.join(repository, '.github/templates/software-factory/delivery/factory-release.workflow.yml'), 'utf8');
  const draftWorkflow = fs.readFileSync(path.join(repository, '.github/templates/software-factory/delivery/factory-draft-pr.workflow.yml'), 'utf8');
  assert.match(releaseWorkflow, /factory-evidence-bundle-\$\{\{ github\.event\.client_payload\.acceptance_run_id \}\}/);
  assert.match(releaseWorkflow, /factory-release-envelope-\$\{\{ github\.run_id \}\}/);
  assert.match(draftWorkflow, /factory-release-envelope-\$\{\{ github\.event\.client_payload\.release_run_id \}\}/);
  const releaseSource = fs.readFileSync(path.join(repository, 'scripts/factory-release.mjs'), 'utf8');
  assert.match(releaseSource, /review_receipt_sha256: canonicalHash\(verifiedReview\)/);
  assert.match(releaseSource, /resolveContainedRegularFile\(packageDir, path\.resolve\(packageDir, plan\.spec_path\)\)/);
});

test('release CLI produces one consumer-valid envelope and stale inputs produce none', () => {
  const scenario = buildReleasedDeliveryScenario();
  const fullEvents = readEventFile(scenario.eventsFile);
  const sourceEvents = fullEvents.slice(0, fullEvents.findIndex((event) => event.type === 'candidate_frozen'));
  assert.equal(sourceEvents.at(-1).type, 'corpus_closed');
  const factoryPlanFile = path.join(scenario.packageRoot, 'factory/plan.v3.json');
  const sourceEventsFile = path.join(scenario.packageRoot, 'factory/events.v3.jsonl');
  const sourceStateFile = path.join(scenario.packageRoot, 'factory/state.v3.json');
  const specFile = path.join(scenario.packageRoot, 'SPECIFICATION.md');
  const factoryPlan = readData(factoryPlanFile);
  const sourceCurrent = {
    plan_sha256: canonicalHash(factoryPlan),
    spec_exists: true,
    spec_sha256: normalizedFileHash(specFile),
    evidence_manifest_sha256: null,
    provenance_status: null,
  };
  const writeSource = (events) => {
    fs.writeFileSync(sourceEventsFile, serializeEventLog(events), 'utf8');
    writeData(sourceStateFile, reduceFactory({ plan: factoryPlan, events, current: sourceCurrent }));
  };
  writeSource(sourceEvents);

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const controller = temporary('factory-release-controller-');
  fs.writeFileSync(path.join(controller, 'review-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }), 'utf8');
  git(controller, ['init', '--quiet']);
  git(controller, ['config', 'user.email', 'controller@example.invalid']);
  git(controller, ['config', 'user.name', 'Controller']);
  git(controller, ['add', '.']);
  git(controller, ['commit', '--quiet', '-m', 'protected release controller']);
  const controllerSha = git(controller, ['rev-parse', 'HEAD']);
  const reviewedAt = new Date().toISOString();
  const reviewPayload = {
    version: 1,
    factory_run_id: 'RUN-12345',
    candidate_sha: scenario.candidateSha,
    acceptance_run_id: '12345',
    evidence_manifest_sha256: canonicalHash(scenario.manifest),
    plan_sha256: canonicalHash(factoryPlan),
    spec_sha256: normalizedFileHash(specFile),
    reviewer_execution_id: 'release-reviewer-1',
    reviewer_model: 'model-reviewer',
    verdict: 'passed',
    fresh_context: true,
    reviewer_model_family: 'review-family',
    basis_models: [
      { execution_id: 'convention-observer-1', model: 'model-standard', model_family: 'implementation-family' },
      { execution_id: 'reviewer-1', model: 'model-reviewer', model_family: 'review-family' },
      { execution_id: 'worker-1', model: 'model-standard', model_family: 'implementation-family' },
    ],
    basis_model_families: ['implementation-family', 'review-family'],
    independence_exception: {
      reason: 'Synthetic fixture reuses the configured reviewer family.',
      approved_by: 'quality-owner',
      approved_at: reviewedAt,
    },
    findings: [],
    reviewed_at: reviewedAt,
    nonce: 'release-review-nonce-0002',
  };
  const reviewReceipt = {
    ...reviewPayload,
    signature: crypto.sign(null, Buffer.from(stableJson(reviewPayload)), privateKey).toString('base64'),
  };
  const acceptanceAttestation = {
    schema_version: 2,
    provider: 'github_actions',
    repository: 'acme/repo',
    workflow_ref: '.github/workflows/factory-acceptance.yml',
    run_id: '12345',
    workflow_sha: controllerSha,
    subject_sha: scenario.candidateSha,
    conclusion: 'success',
    artifact: { id: '789', name: 'factory-evidence-envelope-12345', digest: `sha256:${'9'.repeat(64)}` },
    attestation_ref: githubArtifactAttestationRef({ repository: 'acme/repo', runId: '12345', artifactId: '789', digest: `sha256:${'9'.repeat(64)}` }),
  };
  const attestationObservationRoot = temporary('factory-release-attestation-');
  const runObservationFile = path.join(attestationObservationRoot, 'run.json');
  const artifactsObservationFile = path.join(attestationObservationRoot, 'artifacts.json');
  const jobsObservationFile = path.join(attestationObservationRoot, 'jobs.json');
  const attestationFile = path.join(attestationObservationRoot, 'acceptance-attestation.json');
  writeData(runObservationFile, {
    id: 12345,
    head_sha: controllerSha,
    status: 'completed',
    conclusion: 'success',
    event: 'repository_dispatch',
    path: '.github/workflows/factory-acceptance.yml',
  });
  writeData(artifactsObservationFile, { artifacts: [{
    id: 789,
    name: 'factory-evidence-envelope-12345',
    digest: `sha256:${'9'.repeat(64)}`,
    expired: false,
    workflow_run: { id: 12345 },
  }] });
  writeData(jobsObservationFile, { jobs: [{ name: 'release', status: 'completed', conclusion: 'success' }] });
  const observed = runNode('scripts/factory-actions-attestation.mjs', [
    '--repository', 'acme/repo',
    '--run-id', '12345',
    '--candidate-sha', scenario.candidateSha,
    '--workflow-sha', controllerSha,
    '--workflow-ref', '.github/workflows/factory-acceptance.yml',
    '--artifact-name', 'factory-evidence-envelope-12345',
    '--run-json', runObservationFile,
    '--jobs-json', jobsObservationFile,
    '--artifacts-json', artifactsObservationFile,
    '--out', attestationFile,
    '--json',
  ]);
  assert.equal(observed.status, 0, observed.stderr || observed.stdout);
  assert.deepEqual(readData(attestationFile), acceptanceAttestation);

  // The same run, with its jobs skipped instead of executed. GitHub still
  // reports conclusion: success, so the CLI must refuse on the jobs alone.
  const skippedJobsFile = path.join(attestationObservationRoot, 'jobs-skipped.json');
  writeData(skippedJobsFile, { jobs: [{ name: 'release', status: 'completed', conclusion: 'skipped' }] });
  const skipped = runNode('scripts/factory-actions-attestation.mjs', [
    '--repository', 'acme/repo',
    '--run-id', '12345',
    '--candidate-sha', scenario.candidateSha,
    '--workflow-sha', controllerSha,
    '--workflow-ref', '.github/workflows/factory-acceptance.yml',
    '--artifact-name', 'factory-evidence-envelope-12345',
    '--run-json', runObservationFile,
    '--jobs-json', skippedJobsFile,
    '--artifacts-json', artifactsObservationFile,
    '--out', path.join(attestationObservationRoot, 'skipped-attestation.json'),
    '--json',
  ]);
  assert.equal(skipped.status, 1, 'a run that executed nothing must not produce an attestation');
  assert.match(skipped.stdout + skipped.stderr, /without executing a single job/);
  assert.equal(fs.existsSync(path.join(attestationObservationRoot, 'skipped-attestation.json')), false);
  const releaseArgs = (out, attestation = attestationFile) => [
    '--root', scenario.repo,
    '--controller-root', controller,
    '--controller-sha', controllerSha,
    '--review-public-key', 'review-public.pem',
    '--package', scenario.packageRelative,
    '--acceptance-plan', `${scenario.packageRelative}/acceptance-plan.yaml`,
    '--environment', `${scenario.packageRelative}/environment.yaml`,
    '--ci', `${scenario.packageRelative}/ci.yaml`,
    '--artifacts-root', scenario.artifactsRoot,
    '--evidence', 'evidence-manifest.yaml',
    '--candidate-sha', scenario.candidateSha,
    '--acceptance-run-id', '12345',
    '--acceptance-attestation', attestation,
    '--repository', 'acme/repo',
    '--out', out,
    '--json',
  ];
  const releaseOut = temporary('factory-produced-release-envelope-');
  const produced = runNode('scripts/factory-release.mjs', releaseArgs(releaseOut), {
    env: { FACTORY_RELEASE_REVIEW_RECEIPT: JSON.stringify(reviewReceipt) },
  });
  assert.equal(produced.status, 0, produced.stderr || produced.stdout);
  const producedMetadata = readData(path.join(releaseOut, 'release-envelope.json'));
  assert.equal(producedMetadata.acceptance_attestation_sha256, canonicalHash(acceptanceAttestation));
  assert.equal(producedMetadata.acceptance_artifact_digest, acceptanceAttestation.artifact.digest);
  const consumed = validateReleaseEnvelope({
    planFile: factoryPlanFile,
    eventsFile: path.join(releaseOut, 'events.v3.jsonl'),
    stateFile: path.join(releaseOut, 'state.v3.json'),
    specFile,
    manifestFile: scenario.manifestFile,
    candidateSha: scenario.candidateSha,
    releaseMetadataFile: path.join(releaseOut, 'release-envelope.json'),
    acceptanceRunId: '12345',
    controllerSha,
  });
  assert.deepEqual(consumed.findings, []);

  const nonReadyEvents = sourceEvents.slice(0, -1);
  writeSource(nonReadyEvents);
  const nonReadyOut = temporary('factory-non-ready-release-envelope-');
  const nonReady = runNode('scripts/factory-release.mjs', releaseArgs(nonReadyOut), {
    env: { FACTORY_RELEASE_REVIEW_RECEIPT: JSON.stringify(reviewReceipt) },
  });
  assert.equal(nonReady.status, 2, nonReady.stderr || nonReady.stdout);
  assert.deepEqual(fs.readdirSync(nonReadyOut), []);

  writeSource(sourceEvents);
  const staleAttestation = { ...acceptanceAttestation, subject_sha: 'b'.repeat(40) };
  const staleAttestationFile = path.join(temporary('factory-stale-release-attestation-'), 'acceptance-attestation.json');
  writeData(staleAttestationFile, staleAttestation);
  const staleOut = temporary('factory-stale-release-envelope-');
  const stale = runNode('scripts/factory-release.mjs', releaseArgs(staleOut, staleAttestationFile), {
    env: { FACTORY_RELEASE_REVIEW_RECEIPT: JSON.stringify(reviewReceipt) },
  });
  assert.equal(stale.status, 2, stale.stderr || stale.stdout);
  assert.deepEqual(fs.readdirSync(staleOut), []);

  const legacyAttestationFile = path.join(temporary('factory-v1-release-attestation-'), 'acceptance-attestation.json');
  writeData(legacyAttestationFile, { ...acceptanceAttestation, schema_version: 1 });
  const legacyOut = temporary('factory-v1-release-envelope-');
  const legacy = runNode('scripts/factory-release.mjs', releaseArgs(legacyOut, legacyAttestationFile), {
    env: { FACTORY_RELEASE_REVIEW_RECEIPT: JSON.stringify(reviewReceipt) },
  });
  assert.equal(legacy.status, 2, legacy.stderr || legacy.stdout);
  assert.deepEqual(fs.readdirSync(legacyOut), []);

  const staleObservedOut = path.join(temporary('factory-stale-observed-attestation-'), 'attestation.json');
  const staleObserved = runNode('scripts/factory-actions-attestation.mjs', [
    '--repository', 'acme/repo',
    '--run-id', '12345',
    '--candidate-sha', scenario.candidateSha,
    '--workflow-sha', 'b'.repeat(40),
    '--workflow-ref', '.github/workflows/factory-acceptance.yml',
    '--artifact-name', 'factory-evidence-envelope-12345',
    '--run-json', runObservationFile,
    '--jobs-json', jobsObservationFile,
    '--artifacts-json', artifactsObservationFile,
    '--out', staleObservedOut,
    '--json',
  ]);
  assert.equal(staleObserved.status, 1, staleObserved.stderr || staleObserved.stdout);
  assert.equal(fs.existsSync(staleObservedOut), false);
});

test('draft PR execution verifies the remote head through GitHub API only', () => {
  const source = fs.readFileSync(path.join(repository, 'scripts/factory-pr.mjs'), 'utf8');
  assert.equal(source.includes("['ls-remote'"), false);
  assert.match(source, /git\/ref\/heads\/\$\{headRef\}/);
  assert.equal(source.includes('/check-runs'), false, 'draft creation must not treat spoofable pre-PR check names as protected attestations');
});

test('GitHub Actions attestation rejects stale runs, expired artifacts and false retention', () => {
  const contract = fixture('pr-draft.yaml');
  const manifest = buildEvidence().manifest;
  manifest.publication = {
    ...manifest.publication,
    ci_run_id: '12345',
    artifact_id: '456',
    artifact_url: 'https://github.com/acme/repo/actions/runs/12345/artifacts/456',
    retention_days: 30,
  };
  const workflowSha = 'c'.repeat(40);
  assert.notEqual(workflowSha, subjectSha, 'the protected workflow and tested candidate must be independently bound');
  const runRecord = {
    id: 12345,
    head_sha: workflowSha,
    status: 'completed',
    conclusion: 'success',
    event: 'repository_dispatch',
    path: '.github/workflows/factory-acceptance.yml',
  };
  const artifact = {
    id: 456,
    name: 'factory-evidence-bundle-12345',
    expired: false,
    digest: `sha256:${'6'.repeat(64)}`,
    workflow_run: { id: 12345 },
    created_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-08-31T00:00:00.000Z',
  };
  const envelopeArtifact = {
    id: 789,
    name: 'factory-evidence-envelope-12345',
    expired: false,
    digest: `sha256:${'9'.repeat(64)}`,
    workflow_run: { id: 12345 },
  };
  const manifestLocator = {
    kind: 'ci_artifact',
    provider: 'github_actions',
    artifact_id: '789',
    name: envelopeArtifact.name,
    run_id: '12345',
    path: 'evidence-manifest.yaml',
    digest_sha256: canonicalHash(manifest),
    bundle_digest: manifest.publication.bundle_digest,
    attestation_ref: githubArtifactAttestationRef({ repository: 'acme/repo', runId: '12345', artifactId: '789', digest: envelopeArtifact.digest }),
  };
  const observedEnvelopeAttestation = {
    schema_version: 2,
    provider: 'github_actions',
    repository: 'acme/repo',
    workflow_ref: '.github/workflows/factory-acceptance.yml',
    run_id: '12345',
    workflow_sha: workflowSha,
    subject_sha: subjectSha,
    conclusion: 'success',
    artifact: { id: '789', name: envelopeArtifact.name, digest: envelopeArtifact.digest },
    attestation_ref: manifestLocator.attestation_ref,
  };
  const releaseMetadata = {
    acceptance_attestation_sha256: canonicalHash(observedEnvelopeAttestation),
    acceptance_artifact_digest: envelopeArtifact.digest,
  };
  const jobsResponse = { jobs: [{ name: 'acceptance', status: 'completed', conclusion: 'success' }] };
  const input = { repository: 'acme/repo', runId: '12345', manifest, contract, testedSha: subjectSha, workflowSha, runRecord, jobsResponse, artifactResponse: { artifacts: [artifact, envelopeArtifact] } };
  assert.equal(verifyGitHubActionsAttestation(input).artifact.id, 456);
  assert.equal(verifyGitHubActionsAttestation({ ...input, manifestLocator, releaseMetadata }).manifestArtifact.id, 789);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, manifestLocator, releaseMetadata: { ...releaseMetadata, acceptance_artifact_digest: `sha256:${'8'.repeat(64)}` } }), /does not bind/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, manifestLocator: { ...manifestLocator, attestation_ref: `github-actions:acme/repo:12345:789:sha256:${'8'.repeat(64)}` } }), /does not match/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, runRecord: { ...runRecord, head_sha: subjectSha } }), /exact successful acceptance workflow/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, artifactResponse: { artifacts: [{ ...artifact, expired: true }, envelopeArtifact] } }), /unexpired minimized evidence bundle/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, artifactResponse: { artifacts: [{ ...artifact, expires_at: '2026-08-30T00:00:00.000Z' }, envelopeArtifact] } }), /retention/);

  // A run whose every job was skipped is reported conclusion: success, and a
  // skipped required check satisfies branch protection. Conclusion alone must
  // not be enough.
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, jobsResponse: { jobs: [{ name: 'acceptance', status: 'completed', conclusion: 'skipped' }] } }), /without executing a single job/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, jobsResponse: { jobs: [] } }), /lists no job/);
  assert.throws(() => verifyGitHubActionsAttestation({ ...input, jobsResponse: undefined }), /lists no job/);
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

  const cliExecute = runNode('scripts/factory-preflight.mjs', [
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--profile', 'fixture-cli',
    '--subject-sha', subjectSha,
    '--run-id', 'fixture-cli-run-001',
    '--build-or-image', 'fixture-cli-build',
    '--json',
    '--execute',
  ]);
  assert.equal(cliExecute.status, 0, cliExecute.stderr || cliExecute.stdout);
  const cliPayload = JSON.parse(cliExecute.stdout);
  assert.equal(cliPayload.observation.status, 'ready');
  assert.equal(cliPayload.observation.instance_id, 'not_applicable');
  assert.equal(cliPayload.observation.auth_actor_type, 'not_applicable');
  assert.equal(cliPayload.observation.dataset_id, 'not_applicable');
});

test('the Playwright reporter preserves retries and replay evidence references', async () => {
  const outputRoot = temporary('factory-reporter-');
  const previousRoot = process.env.FACTORY_EVIDENCE_ROOT;
  const previousResults = process.env.FACTORY_RESULTS_PATH;
  const previousPlan = process.env.FACTORY_ACCEPTANCE_PLAN;
  process.env.FACTORY_EVIDENCE_ROOT = outputRoot;
  process.env.FACTORY_RESULTS_PATH = path.join(outputRoot, 'results.json');
  process.env.FACTORY_ACCEPTANCE_PLAN = path.join(fixtureRoot, 'acceptance-plan.yaml');
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
    assert.deepEqual(payload.cases[0].oracle_results, [{ id: 'fixture-oracle', outcome: 'blocked', recorded: false }]);
    assert.equal(payload.overall_status, 'blocked');
  } finally {
    if (previousRoot === undefined) delete process.env.FACTORY_EVIDENCE_ROOT;
    else process.env.FACTORY_EVIDENCE_ROOT = previousRoot;
    if (previousResults === undefined) delete process.env.FACTORY_RESULTS_PATH;
    else process.env.FACTORY_RESULTS_PATH = previousResults;
    if (previousPlan === undefined) delete process.env.FACTORY_ACCEPTANCE_PLAN;
    else process.env.FACTORY_ACCEPTANCE_PLAN = previousPlan;
  }
});

test('ephemeral browser state is materialized privately and rejects absent, linked or broad inputs', () => {
  const base = fs.realpathSync(temporary('factory-storage-confinement-'));
  const privateRoot = path.join(base, 'private');
  fs.mkdirSync(privateRoot, { mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  const state = path.join(privateRoot, 'state.json');
  fs.writeFileSync(state, '{}\n', { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(state, 0o600);
  assert.deepEqual(resolveEphemeralStorage({ repository, storageRoot: privateRoot, storageState: state }), { root: privateRoot, state });

  const materializedRoot = path.join(base, 'materialized');
  const materialized = materializeEphemeralStorage({
    repository,
    storageRoot: materializedRoot,
    storageStateJson: JSON.stringify({ cookies: [], origins: [] }),
  });
  assert.equal(materialized.materialized, true);
  assert.equal(fs.statSync(materialized.root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(materialized.state).mode & 0o777, 0o600);
  assert.deepEqual(readData(materialized.state), { cookies: [], origins: [] });
  const materializedState = materialized.state;
  assert.equal(materialized.cleanup(), true);
  assert.equal(fs.existsSync(materializedState), false);
  assert.equal(fs.existsSync(materializedRoot), false);

  assert.throws(() => materializeEphemeralStorage({
    repository,
    storageRoot: path.join(base, 'absent-state'),
  }), /requires a state file or JSON secret/);

  const link = path.join(base, 'linked');
  fs.symlinkSync(base, link, 'dir');
  assert.throws(() => resolveEphemeralStorage({
    repository,
    storageRoot: path.join(link, 'private'),
    storageState: path.join(link, 'private/state.json'),
  }), /symbolic-link ancestor/);

  assert.throws(() => materializeEphemeralStorage({
    repository,
    storageRoot: path.join(link, 'new-private-root'),
    storageStateJson: '{}',
  }), /real directory|symbolic-link ancestor/);

  const broadRoot = path.join(base, 'broad-root');
  fs.mkdirSync(broadRoot, { mode: 0o755 });
  fs.chmodSync(broadRoot, 0o755);
  const broadRootState = path.join(broadRoot, 'state.json');
  fs.writeFileSync(broadRootState, '{}\n', { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(broadRootState, 0o600);
  assert.throws(() => resolveEphemeralStorage({ repository, storageRoot: broadRoot, storageState: broadRootState }), /root must not be group\/world accessible/);

  const broadStateRoot = path.join(base, 'broad-state-root');
  fs.mkdirSync(broadStateRoot, { mode: 0o700 });
  fs.chmodSync(broadStateRoot, 0o700);
  const broadState = path.join(broadStateRoot, 'state.json');
  fs.writeFileSync(broadState, '{}\n', { encoding: 'utf8', mode: 0o644 });
  fs.chmodSync(broadState, 0o644);
  assert.throws(() => resolveEphemeralStorage({ repository, storageRoot: broadStateRoot, storageState: broadState }), /state must not be group\/world accessible/);

  const linkedStateRoot = path.join(base, 'linked-state-root');
  fs.mkdirSync(linkedStateRoot, { mode: 0o700 });
  fs.chmodSync(linkedStateRoot, 0o700);
  const linkedStateTarget = path.join(base, 'linked-state-target.json');
  fs.writeFileSync(linkedStateTarget, '{}\n', { encoding: 'utf8', mode: 0o600 });
  const linkedState = path.join(linkedStateRoot, 'state.json');
  fs.symlinkSync(linkedStateTarget, linkedState);
  assert.throws(() => resolveEphemeralStorage({ repository, storageRoot: linkedStateRoot, storageState: linkedState }), /symbolic links are forbidden|symbolic-link ancestor/);

  assert.throws(() => resolveEphemeralStorage({
    repository,
    storageRoot: repository,
    storageState: path.join(repository, 'package.json'),
  }), /disjoint from the repository|group\/world accessible/);
});

test('evidence, report and draft-PR CLIs compose without push or merge capability', () => {
  const output = temporary('factory-cli-');
  const exactHead = git(repository, ['rev-parse', 'HEAD']);
  const exactObservation = fixture('observation.json');
  exactObservation.subject_sha = exactHead;
  exactObservation.deployed_revision = exactHead;
  exactObservation.environment_contract_digest = sha256File(path.join(fixtureRoot, 'environment.yaml'));
  exactObservation.ci_contract_digest = sha256File(path.join(fixtureRoot, 'ci.yaml'));
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

  const exactPrContractFile = path.join(output, 'pr-draft.yaml');
  fs.writeFileSync(exactPrContractFile, `${stringifyYaml(fixture('pr-draft.yaml'))}\n`, 'utf8');
  const escapedContract = runNode('scripts/factory-pr.mjs', [
    '--contract', exactPrContractFile,
    '--evidence', manifestFile,
    '--plan', 'scripts/fixtures/factory-delivery/acceptance-plan.yaml',
    '--environment', 'scripts/fixtures/factory-delivery/environment.yaml',
    '--ci', 'scripts/fixtures/factory-delivery/ci.yaml',
    '--artifacts-root', artifactRoot,
    '--factory-events', 'events.v3.jsonl',
    '--factory-state', 'state.v3.json',
    '--release-metadata', 'release-envelope.json',
    '--release-run-id', '67890',
    '--release-controller-sha', 'f'.repeat(40),
    '--json',
  ]);
  assert.equal(escapedContract.status, 1, escapedContract.stderr || escapedContract.stdout);
  assert.match(JSON.parse(escapedContract.stdout).findings[0].message, /contained regular repository file/);

  const released = buildReleasedDeliveryScenario();
  const draftArgs = [
    '--root', released.repo,
    '--contract', `${released.packageRelative}/pr-draft.yaml`,
    '--evidence', path.basename(released.manifestFile),
    '--plan', `${released.packageRelative}/acceptance-plan.yaml`,
    '--environment', `${released.packageRelative}/environment.yaml`,
    '--ci', `${released.packageRelative}/ci.yaml`,
    '--artifacts-root', released.artifactsRoot,
    '--factory-events', path.basename(released.eventsFile),
    '--factory-state', path.basename(released.stateFile),
    '--release-metadata', path.basename(released.releaseMetadataFile),
    '--release-run-id', '67890',
    '--release-controller-sha', 'f'.repeat(40),
    '--acceptance-run-id', '12345',
    '--head-ref', 'fixture/delivery',
    '--head-sha', released.candidateSha,
    '--json',
  ];
  const draft = runNode('scripts/factory-pr.mjs', draftArgs);
  assert.equal(draft.status, 0, draft.stderr || draft.stdout);
  const payload = JSON.parse(draft.stdout);
  assert.equal(payload.summary.mode, 'dry-run');
  assert.equal(payload.plan.operation, 'create-draft');
  assert.equal(payload.plan.argv.includes('--draft'), true);
  assert.equal(payload.plan.argv.includes('--merge'), false);
  assert.equal(payload.plan.argv.includes('--push'), false);

  const protectedBody = path.join(released.packageRoot, 'PR_DESCRIPTION.md');
  const protectedBodyBefore = fs.readFileSync(protectedBody, 'utf8');
  const bodyOutputAttempt = runNode('scripts/factory-pr.mjs', [
    ...draftArgs,
    '--body-out', `${released.packageRelative}/PR_DESCRIPTION.md`,
  ]);
  assert.equal(bodyOutputAttempt.status, 2, bodyOutputAttempt.stderr || bodyOutputAttempt.stdout);
  expectCode(JSON.parse(bodyOutputAttempt.stdout).findings, 'pr-local-output-forbidden');
  assert.equal(fs.readFileSync(protectedBody, 'utf8'), protectedBodyBefore);

  const arbitraryOutput = path.join(temporary('factory-pr-output-attempt-'), 'operation.json');
  const operationOutputAttempt = runNode('scripts/factory-pr.mjs', [...draftArgs, '--out', arbitraryOutput]);
  assert.equal(operationOutputAttempt.status, 2, operationOutputAttempt.stderr || operationOutputAttempt.stdout);
  expectCode(JSON.parse(operationOutputAttempt.stdout).findings, 'pr-local-output-forbidden');
  assert.equal(fs.existsSync(arbitraryOutput), false);

  const candidateTrustedExecution = runNode('scripts/factory-pr.mjs', [...draftArgs, '--execute']);
  assert.equal(candidateTrustedExecution.status, 2, candidateTrustedExecution.stderr || candidateTrustedExecution.stdout);
  expectCode(JSON.parse(candidateTrustedExecution.stdout).findings, 'pr-protected-trust-anchor-missing');

  const wrongRun = runNode('scripts/factory-pr.mjs', draftArgs.map((value, index, values) => values[index - 1] === '--acceptance-run-id' ? '99999' : value));
  assert.equal(wrongRun.status, 2, wrongRun.stderr || wrongRun.stdout);
  expectCode(JSON.parse(wrongRun.stdout).findings, 'pr-acceptance-run-mismatch');

  const staleState = clone(readData(released.stateFile));
  staleState.phase = 'acceptance';
  const staleStateFile = path.join(released.artifactsRoot, 'stale-state.v3.json');
  writeData(staleStateFile, staleState);
  const staleStateRun = runNode('scripts/factory-pr.mjs', draftArgs.map((value, index, values) => values[index - 1] === '--factory-state' ? path.basename(staleStateFile) : value));
  assert.equal(staleStateRun.status, 2, staleStateRun.stderr || staleStateRun.stdout);
  expectCode(JSON.parse(staleStateRun.stdout).findings, 'pr-factory-state-stale');

  fs.appendFileSync(path.join(released.artifactsRoot, 'CASE-001.txt'), 'tampered after assembly\n', 'utf8');
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
  const blockedDraft = runNode('scripts/factory-pr.mjs', draftArgs);
  assert.equal(blockedDraft.status, 2, blockedDraft.stderr || blockedDraft.stdout);
  expectCode(JSON.parse(blockedDraft.stdout).findings, 'evidence-artifact-hash-mismatch');
});

let failed = 0;
if (selectedLearningTests) {
  for (const name of selectedLearningTests) {
    if (!discoveredLearningTests.has(name)) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error('requested learning fixture test is not registered');
    }
  }
}
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
