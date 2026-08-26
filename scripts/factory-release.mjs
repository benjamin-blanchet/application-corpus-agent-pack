#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { SHA_PATTERN, asArray, canonicalizeCaseOutcome, isWithin, parseArgs, printResult, resolveContainedDirectory, resolveContainedRegularFile, sha256File } from './lib/factory-delivery/core.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';
import { githubArtifactAttestationRef, verifyReleaseReviewReceipt } from './lib/factory-delivery/authorization.mjs';
import { currentHead } from './lib/factory-delivery/provenance.mjs';
import { validateAcceptancePlan, validateEvidence, validateFactoryCi } from './lib/factory-delivery/validation.mjs';
import { canonicalHash, normalizedFileHash } from './lib/factory-v3/canonical-json.mjs';
import { buildEvent, eventLogHash, readEventFile, serializeEventLog, validateEventChain } from './lib/factory-v3/event-log.mjs';
import { validatePlan } from './lib/factory-v3/contract.mjs';
import { buildCandidateBinding } from './lib/factory-v3/git-review-attestation.mjs';
import { reduceFactory, stateMatchesDerived } from './lib/factory-v3/reducer.mjs';

const args = parseArgs(process.argv.slice(2));

function externalEmptyDirectory(repository, value) {
  const requested = path.resolve(value);
  if (isWithin(repository, requested)) throw new Error('--out must be outside the candidate checkout');
  if (fs.existsSync(requested)) {
    if (fs.lstatSync(requested).isSymbolicLink() || !fs.statSync(requested).isDirectory() || fs.readdirSync(requested).length) throw new Error('--out must be a real empty directory');
    return fs.realpathSync(requested);
  }
  const parent = fs.realpathSync(path.dirname(requested));
  fs.mkdirSync(path.join(parent, path.basename(requested)));
  return fs.realpathSync(path.join(parent, path.basename(requested)));
}

function eventActor(role, executionId, model, capabilities) {
  return { role, execution_id: executionId, capabilities, model };
}

function externalRegularFile(repository, value, label) {
  const requested = path.resolve(value);
  if (isWithin(repository, requested)) throw new Error(`${label} must be external to the candidate checkout`);
  if (!fs.existsSync(requested) || fs.lstatSync(requested).isSymbolicLink() || !fs.statSync(requested).isFile()) throw new Error(`${label} must be a real regular file`);
  const resolved = fs.realpathSync(requested);
  if (isWithin(repository, resolved)) throw new Error(`${label} resolves inside the candidate checkout`);
  return resolved;
}

try {
  for (const required of ['root', 'controller-root', 'controller-sha', 'review-public-key', 'package', 'acceptance-plan', 'environment', 'ci', 'artifacts-root', 'evidence', 'candidate-sha', 'acceptance-run-id', 'acceptance-attestation', 'repository', 'out']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const root = fs.realpathSync(path.resolve(args.root));
  const controllerRoot = fs.realpathSync(path.resolve(args['controller-root']));
  const candidateSha = String(args['candidate-sha']).toLowerCase();
  const controllerSha = String(args['controller-sha']).toLowerCase();
  if (!SHA_PATTERN.test(candidateSha) || !SHA_PATTERN.test(controllerSha)) throw new Error('candidate and controller SHAs must be full 40-hex revisions');
  if (currentHead(root) !== candidateSha) throw new Error('candidate checkout HEAD differs from --candidate-sha');
  if (currentHead(controllerRoot) !== controllerSha) throw new Error('protected controller checkout HEAD differs from --controller-sha');
  if (isWithin(root, controllerRoot) || isWithin(controllerRoot, root)) throw new Error('controller and candidate checkouts must be disjoint');

  const packageDir = resolveContainedDirectory(root, path.resolve(root, args.package)).absolute;
  const packageRef = path.relative(root, packageDir).split(path.sep).join('/');
  const factoryDir = path.join(packageDir, 'factory');
  const planFile = resolveContainedRegularFile(root, path.join(factoryDir, 'plan.v3.json')).absolute;
  const eventsFile = resolveContainedRegularFile(root, path.join(factoryDir, 'events.v3.jsonl')).absolute;
  const stateFile = resolveContainedRegularFile(root, path.join(factoryDir, 'state.v3.json')).absolute;
  const acceptancePlanFile = resolveContainedRegularFile(root, path.resolve(root, args['acceptance-plan'])).absolute;
  const environmentFile = resolveContainedRegularFile(root, path.resolve(root, args.environment)).absolute;
  const ciFile = resolveContainedRegularFile(root, path.resolve(root, args.ci)).absolute;
  const artifactsRoot = resolveContainedDirectory(path.resolve(args['artifacts-root']), path.resolve(args['artifacts-root'])).absolute;
  const manifestFile = resolveContainedRegularFile(artifactsRoot, path.resolve(artifactsRoot, args.evidence)).absolute;
  const acceptanceAttestationFile = externalRegularFile(root, args['acceptance-attestation'], 'acceptance artifact attestation');
  const reviewPublicKeyFile = resolveContainedRegularFile(controllerRoot, path.resolve(controllerRoot, args['review-public-key'])).absolute;
  let reviewReceipt;
  try { reviewReceipt = JSON.parse(process.env.FACTORY_RELEASE_REVIEW_RECEIPT || ''); } catch { throw new Error('FACTORY_RELEASE_REVIEW_RECEIPT must contain one signed JSON receipt'); }
  const plan = readData(planFile);
  const events = readEventFile(eventsFile);
  const snapshot = readData(stateFile);
  const acceptancePlan = readData(acceptancePlanFile);
  const ci = readData(ciFile);
  const manifest = readData(manifestFile);
  const acceptanceAttestation = readData(acceptanceAttestationFile);
  const specFile = resolveContainedRegularFile(packageDir, path.resolve(packageDir, plan.spec_path)).absolute;
  const planDigest = canonicalHash(plan);
  const specDigest = normalizedFileHash(specFile);
  const manifestDigest = canonicalHash(manifest);
  const expectedAcceptanceArtifactName = `factory-evidence-envelope-${args['acceptance-run-id']}`;
  const expectedAttestationKeys = ['schema_version', 'provider', 'repository', 'workflow_ref', 'run_id', 'workflow_sha', 'subject_sha', 'conclusion', 'artifact', 'attestation_ref'];
  const findings = [
    ...validatePlan(plan),
    ...validateEventChain(events),
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validateAcceptancePlan(acceptancePlan, { file: args['acceptance-plan'], root, checkFiles: true }),
    ...validateEvidence(manifest, acceptancePlan, {
      file: args.evidence,
      artifactsRoot,
      verifyArtifacts: true,
      acceptancePlanFile,
      environmentContractFile: environmentFile,
      repositoryRoot: root,
      ci,
    }),
  ];
  const initial = reduceFactory({ plan, events, current: {
    plan_sha256: planDigest,
    spec_exists: true,
    spec_sha256: specDigest,
    evidence_manifest_sha256: null,
    provenance_status: null,
  } });
  if (!stateMatchesDerived(snapshot, initial)) findings.push({ severity: 'P0', code: 'release-source-state-stale', message: 'candidate state is not the exact projection of its event stream' });
  if (initial.phase !== 'corpus_closed' || initial.gates?.corpus_closeout?.status !== 'valid') findings.push({ severity: 'P0', code: 'release-source-not-corpus-closed', message: `release starts only from exact corpus_closed state, got ${initial.phase}` });
  if (manifest.verdict !== 'ready') findings.push({ severity: 'P0', code: 'release-evidence-not-ready', message: 'release requires a ready evidence manifest' });
  if (manifest.run_id !== initial.run_id) findings.push({ severity: 'P0', code: 'release-factory-run-mismatch', message: 'evidence run_id differs from the factory event stream' });
  if (manifest.subject?.tested_sha?.toLowerCase() !== candidateSha || manifest.subject?.head_sha?.toLowerCase() !== candidateSha) findings.push({ severity: 'P0', code: 'release-candidate-mismatch', message: 'evidence is not bound to the exact candidate SHA' });
  if (String(manifest.publication?.ci_run_id || '') !== String(args['acceptance-run-id'])) findings.push({ severity: 'P0', code: 'release-acceptance-run-mismatch', message: 'evidence publication differs from --acceptance-run-id' });
  if (manifest.publication?.retention_days !== ci?.artifacts?.retention_days) findings.push({ severity: 'P0', code: 'release-retention-mismatch', message: 'evidence retention differs from the selected CI contract' });
  if (!acceptanceAttestation || Object.keys(acceptanceAttestation).sort().join(',') !== expectedAttestationKeys.sort().join(',')
    || acceptanceAttestation.schema_version !== 2
    || acceptanceAttestation.provider !== 'github_actions'
    || acceptanceAttestation.repository !== args.repository
    || acceptanceAttestation.workflow_ref !== '.github/workflows/factory-acceptance.yml'
    || String(acceptanceAttestation.run_id) !== String(args['acceptance-run-id'])
    || acceptanceAttestation.workflow_sha !== controllerSha
    || acceptanceAttestation.subject_sha !== candidateSha
    || acceptanceAttestation.conclusion !== 'success'
    || String(acceptanceAttestation.artifact?.id || '').match(/^\d+$/) === null
    || acceptanceAttestation.artifact?.name !== expectedAcceptanceArtifactName
    || !/^sha256:[0-9a-f]{64}$/.test(acceptanceAttestation.artifact?.digest || '')
    || acceptanceAttestation.attestation_ref !== githubArtifactAttestationRef({
      repository: args.repository,
      runId: args['acceptance-run-id'],
      artifactId: acceptanceAttestation.artifact?.id,
      digest: acceptanceAttestation.artifact?.digest,
    })) findings.push({ severity: 'P0', code: 'release-acceptance-attestation-invalid', message: 'acceptance artifact attestation is not bound to the exact successful workflow, candidate and evidence envelope' });
  if (findings.length) {
    printResult({ title: 'Factory release envelope', summary: { findings: findings.length }, findings }, args.json === true);
    process.exit(2);
  }

  const now = new Date().toISOString();
  const models = initial.execution_policy.models;
  const controllerId = args['controller-id'] || 'factory-release-controller';
  const basisModels = events
    .filter((event) => ['implementer', 'reviewer', 'migration'].includes(event.actor?.role))
    .map((event) => ({
      execution_id: event.actor.execution_id,
      model: event.actor.model?.used || null,
      model_family: event.actor.model?.model_family || 'unknown',
    }))
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.execution_id === entry.execution_id) === index)
    .sort((left, right) => left.execution_id.localeCompare(right.execution_id));
  const verifiedReview = verifyReleaseReviewReceipt(reviewReceipt, {
    factoryRunId: initial.run_id,
    candidateSha,
    acceptanceRunId: args['acceptance-run-id'],
    evidenceManifestSha256: manifestDigest,
    planSha256: planDigest,
    specSha256: specDigest,
    reviewerModel: models.reviewer,
    reviewerModelFamily: initial.execution_policy.model_families.reviewer,
    basisModels,
    controllerExecutionId: controllerId,
    publicKey: fs.readFileSync(reviewPublicKeyFile, 'utf8'),
  });
  const controller = eventActor('controller', controllerId, { planned: null, requested: null, used: null, model_family: 'controller' }, ['read', 'write', 'execute']);
  const acceptance = eventActor('acceptance', `acceptance-${args['acceptance-run-id']}`, { planned: 'expert', requested: models.expert, used: models.expert, model_family: initial.execution_policy.model_families.expert }, ['read', 'execute']);
  const reviewer = eventActor('reviewer', verifiedReview.reviewer_execution_id, { planned: 'reviewer', requested: verifiedReview.reviewer_model, used: verifiedReview.reviewer_model, model_family: verifiedReview.reviewer_model_family }, ['read', 'execute']);
  const appended = [...events];
  const append = (type, data, actor = controller) => appended.push(buildEvent(appended, {
    run_id: initial.run_id,
    type,
    at: now,
    controller_id: controllerId,
    expected_previous_seq: appended.length,
    actor,
    subject: { package: packageRef, lot_id: null },
    basis: { spec_sha256: specDigest, plan_sha256: planDigest, candidate_sha: candidateSha, diff_sha256: null },
    data,
  }));
  const corpusEvent = [...events].reverse().find((event) => event.type === 'corpus_closed');
  const binding = buildCandidateBinding({
    repoRoot: root,
    packageRef,
    reviewedSnapshot: initial.provenance.consolidated_snapshot,
    candidateSha,
    corpusEvent,
  });
  append('candidate_frozen', { candidate_sha: candidateSha, binding });
  append('acceptance_started', {}, acceptance);
  const caseResults = asArray(manifest.cases).map((testCase) => ({
    id: testCase.id,
    outcome: canonicalizeCaseOutcome(testCase.outcome).outcome,
    user_visible_error: testCase.user_visible_error === true,
    oracle_results: asArray(testCase.oracle_results).map((oracle) => ({ id: oracle.id, outcome: canonicalizeCaseOutcome(oracle.outcome).outcome })),
  }));
  append('acceptance_completed', {
    status: 'passed',
    tested_sha: candidateSha,
    test_bundle_sha256: canonicalHash({ acceptance_run_id: String(args['acceptance-run-id']), manifest_sha256: manifestDigest, cases: caseResults }),
    case_results: caseResults,
  }, acceptance);
  append('evidence_committed', {
    manifest_locator: {
      kind: 'ci_artifact',
      provider: 'github_actions',
      artifact_id: String(acceptanceAttestation.artifact.id),
      name: acceptanceAttestation.artifact.name,
      run_id: String(args['acceptance-run-id']),
      path: 'evidence-manifest.yaml',
      digest_sha256: manifestDigest,
      bundle_digest: manifest.publication.bundle_digest,
      attestation_ref: acceptanceAttestation.attestation_ref,
    },
    evidence_manifest_sha256: manifestDigest,
    publication: {
      mode: 'ci_artifact',
      media_type: 'application/zip',
    },
  });
  const releaseReviewData = {
    verdict: verifiedReview.verdict,
    fresh_context: verifiedReview.fresh_context,
    findings: verifiedReview.findings,
    ...(verifiedReview.independence_exception ? {
      independence_exception: {
        ...verifiedReview.independence_exception,
        author_model_families: verifiedReview.basis_model_families,
        reviewer_model_family: verifiedReview.reviewer_model_family,
        plan_sha256: planDigest,
      },
    } : {}),
  };
  append('release_reviewed', releaseReviewData, reviewer);
  const derived = reduceFactory({ plan, events: appended, current: {
    plan_sha256: planDigest,
    spec_exists: true,
    spec_sha256: specDigest,
    git_head: candidateSha,
    git_change_class: 'none',
    evidence_manifest_sha256: manifestDigest,
    provenance_status: 'valid',
  } });
  if (derived.phase !== 'release_ready' || derived.gates?.release?.status !== 'valid') throw new Error(`derived release phase is ${derived.phase}, not release_ready`);
  const out = externalEmptyDirectory(root, args.out);
  const outEvents = path.join(out, 'events.v3.jsonl');
  const outState = path.join(out, 'state.v3.json');
  fs.writeFileSync(outEvents, serializeEventLog(appended), { encoding: 'utf8', flag: 'wx' });
  writeData(outState, derived);
  const metadata = {
    schema_version: 1,
    workflow_ref: '.github/workflows/factory-release.yml',
    controller_sha: controllerSha,
    candidate_sha: candidateSha,
    acceptance_run_id: String(args['acceptance-run-id']),
    factory_run_id: initial.run_id,
    evidence_manifest_sha256: manifestDigest,
    acceptance_attestation_sha256: canonicalHash(acceptanceAttestation),
    acceptance_artifact_digest: acceptanceAttestation.artifact.digest,
    review_receipt_sha256: canonicalHash(verifiedReview),
    events_sha256: eventLogHash(appended),
    state_sha256: sha256File(outState),
    generated_at: now,
  };
  writeData(path.join(out, 'release-envelope.json'), metadata);
  printResult({ title: 'Factory release envelope', summary: { phase: derived.phase, events: appended.length }, metadata, findings: [] }, args.json === true);
} catch (error) {
  printResult({ title: 'Factory release envelope', summary: { internal: 1 }, findings: [{ severity: 'P0', code: error.code || 'factory-release-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
