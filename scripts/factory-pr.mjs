#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { SHA_PATTERN, isWithin, parseArgs, printResult, resolveContainedDirectory, resolveContainedRegularFile, sha256File } from './lib/factory-delivery/core.mjs';
import { verifyAuthorizationReceipt, verifyGitHubActionsAttestation, verifyReleaseGitHubActionsAttestation } from './lib/factory-delivery/authorization.mjs';
import { readData } from './lib/factory-delivery/files.mjs';
import { scanEvidenceFile, scanEvidenceText } from './lib/factory-delivery/minimize.mjs';
import { sourceTreeDigest, verifyEvidenceOnlyCommit, verifyFileAtRevision } from './lib/factory-delivery/provenance.mjs';
import { validateReleaseEnvelope } from './lib/factory-delivery/release.mjs';
import { validateEvidence, validateFactoryCi, validatePrDraft } from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = fs.realpathSync(path.resolve(args.root || process.cwd()));

function safeRef(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value || '') || value.includes('..') || value.endsWith('/')) {
    throw new Error(`${label} is not a safe Git ref`);
  }
  return value;
}

function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    timeout: 120_000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
  });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result;
}

function remoteHeadSha(repository, headRef) {
  const response = JSON.parse(run('gh', ['api', `repos/${repository}/git/ref/heads/${headRef}`]).stdout || '{}');
  return String(response?.object?.sha || '').toLowerCase();
}

function bodyWithEvidence(body, manifest, contract, evidenceCommitSha = null) {
  const marker = '<!-- factory-evidence -->';
  const generated = [
    marker,
    '',
    '## Factory evidence',
    '',
    `- Verdict: **${manifest.verdict}**`,
    `- Subject SHA: \`${manifest.subject.tested_sha}\``,
    `- Run: \`${manifest.run_id}\``,
    `- Evidence: ${manifest.publication?.artifact_url || 'evidence-only commit'}`,
    `- Evidence bundle: \`${manifest.publication?.bundle_digest || evidenceCommitSha}\``,
    `- Source digest: \`${manifest.subject.source_tree_digest}\``,
    `- Specification: \`${contract.spec_ref}\``,
    `- Factory plan: \`${contract.factory_plan_ref}\``,
    `- Acceptance matrix: \`${contract.acceptance_matrix_ref}\``,
    `- Required checks: ${contract.required_checks.join(', ')}`,
    `- Replay: \`${contract.replay_command}\``,
    `- Results: passed=${manifest.summary.passed}, failed=${manifest.summary.failed}, blocked=${manifest.summary.blocked}, skipped=${manifest.summary.skipped}, waived=${manifest.summary.waived}`,
    '',
  ].join('\n');
  const index = body.indexOf(marker);
  return index === -1 ? `${body.trim()}\n\n${generated}` : `${body.slice(0, index).trim()}\n\n${generated}`;
}

function validateAuthorizationReceipt(file, contract, { candidateSha, prHeadSha, headRef, baseRef, inputDigests, publicKeyFile, repository }) {
  const absolute = path.resolve(file);
  if (isWithin(root, absolute)) throw new Error('authorization receipt must come from an external gate, not the repository');
  if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink() || !fs.statSync(absolute).isFile()) throw new Error('authorization receipt must be a real external file');
  const realRepository = fs.realpathSync(root);
  const realReceipt = fs.realpathSync(absolute);
  if (isWithin(realRepository, realReceipt)) throw new Error('authorization receipt resolves inside the repository');
  const receiptScan = scanEvidenceFile(realReceipt, path.basename(realReceipt));
  if (receiptScan.length) throw new Error(`authorization receipt failed minimization: ${receiptScan.map((item) => item.code).join(', ')}`);
  const receipt = readData(absolute);
  return verifyAuthorizationReceipt(receipt, contract, {
    candidateSha,
    prHeadSha,
    headRef,
    baseRef,
    inputDigests,
    publicKey: fs.readFileSync(publicKeyFile, 'utf8'),
    repository,
  });
}

function protectedTrustAnchor(trustRootValue, keyValue) {
  if (!trustRootValue || !keyValue) throw new Error('--trust-root and --authorization-public-key must be supplied together');
  const requestedTrustRoot = path.resolve(trustRootValue);
  const trustRoot = resolveContainedDirectory(requestedTrustRoot, requestedTrustRoot).absolute;
  if (requestedTrustRoot !== trustRoot) throw new Error('delivery trust root contains a symbolic-link ancestor');
  if (isWithin(root, trustRoot) || isWithin(trustRoot, root)) throw new Error('delivery trust root must be a disjoint protected checkout');
  return resolveContainedRegularFile(trustRoot, path.resolve(trustRoot, keyValue)).absolute;
}

function containedRepositoryFile(value, label) {
  try {
    return resolveContainedRegularFile(root, path.resolve(root, value)).absolute;
  } catch (error) {
    throw new Error(`${label} must be a contained regular repository file: ${error.message}`);
  }
}

function sameFile(actual, expected, label) {
  if (fs.realpathSync(actual) !== fs.realpathSync(expected)) throw new Error(`${label} does not match the path frozen by the PR contract`);
}

function artifactFile(artifactRoot, value, label) {
  const candidate = path.isAbsolute(value) ? value : path.join(artifactRoot, value);
  try {
    return resolveContainedRegularFile(artifactRoot, candidate).absolute;
  } catch (error) {
    throw new Error(`${label} must be a contained regular evidence-bundle file: ${error.message}`);
  }
}

function verifyFrozen(file, revision, label, findings) {
  try {
    const checked = verifyFileAtRevision(root, file, revision);
    if (!checked.ok) findings.push({ severity: 'P0', code: 'pr-input-not-frozen', message: `${label} (${checked.relative}) differs from the tested revision` });
  } catch (error) {
    findings.push({ severity: 'P0', code: 'pr-input-not-frozen', message: `${label}: ${error.message}` });
  }
}

function verifyActionsAttestation(repository, runId, manifest, contract, testedSha, workflowSha, manifestLocator, releaseMetadata) {
  const runRecord = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}`]).stdout || '{}');
  const jobsResponse = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]).stdout || '{}');
  const artifactResponse = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]).stdout || '{}');
  return verifyGitHubActionsAttestation({ repository, runId, manifest, contract, testedSha, workflowSha, runRecord, jobsResponse, artifactResponse, manifestLocator, releaseMetadata });
}

function verifyReleaseActionsAttestation(repository, runId, { controllerSha, candidateSha, acceptanceRunId, metadata }) {
  const runRecord = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}`]).stdout || '{}');
  const jobsResponse = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`]).stdout || '{}');
  const artifactResponse = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]).stdout || '{}');
  return verifyReleaseGitHubActionsAttestation({ repository, runId, controllerSha, candidateSha, acceptanceRunId, metadata, runRecord, jobsResponse, artifactResponse });
}

try {
  for (const required of ['contract', 'evidence', 'plan', 'environment', 'ci', 'artifacts-root', 'factory-events', 'factory-state', 'release-metadata', 'release-run-id', 'release-controller-sha']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const contractFile = containedRepositoryFile(args.contract, 'PR contract');
  const contract = readData(contractFile);
  const expectedPlanFile = containedRepositoryFile(contract.acceptance_matrix_ref, 'contract acceptance matrix');
  const expectedEnvironmentFile = containedRepositoryFile(contract.environment_contract_ref, 'contract environment');
  const expectedCiFile = containedRepositoryFile(contract.ci_contract_ref, 'contract CI');
  const planFile = containedRepositoryFile(args.plan, 'acceptance plan');
  const environmentFile = containedRepositoryFile(args.environment, 'environment contract');
  const ciFile = containedRepositoryFile(args.ci, 'CI contract');
  sameFile(planFile, expectedPlanFile, 'acceptance plan');
  sameFile(environmentFile, expectedEnvironmentFile, 'environment contract');
  sameFile(ciFile, expectedCiFile, 'CI contract');
  const artifactRoot = resolveContainedDirectory(path.resolve(args['artifacts-root']), path.resolve(args['artifacts-root'])).absolute;
  const manifestFile = artifactFile(artifactRoot, args.evidence, 'evidence manifest');
  const eventsFile = artifactFile(artifactRoot, args['factory-events'], 'factory events');
  const stateFile = artifactFile(artifactRoot, args['factory-state'], 'factory state');
  const releaseMetadataFile = artifactFile(artifactRoot, args['release-metadata'], 'release metadata');
  const releaseMetadata = readData(releaseMetadataFile);
  const releaseControllerSha = String(args['release-controller-sha']).toLowerCase();
  if (!SHA_PATTERN.test(releaseControllerSha)) throw new Error('--release-controller-sha must be a full Git SHA');
  if (!/^\d+$/.test(String(args['release-run-id']))) throw new Error('--release-run-id must be a numeric GitHub Actions run id');
  const manifest = readData(manifestFile);
  const ci = readData(ciFile);
  const planContract = readData(planFile);
  const specFile = containedRepositoryFile(contract.spec_ref, 'specification');
  const factoryPlanFile = containedRepositoryFile(contract.factory_plan_ref, 'factory plan');
  const bodyFile = containedRepositoryFile(contract.body_path, 'PR body');
  const candidateAuthorizationKeyFile = containedRepositoryFile(contract.authorization.public_key_ref, 'authorization public key declaration');
  const authorizationKeyFile = args['trust-root'] || args['authorization-public-key']
    ? protectedTrustAnchor(args['trust-root'], args['authorization-public-key'])
    : candidateAuthorizationKeyFile;
  const findings = [
    ...validateFactoryCi(ci, { file: args.ci, root, checkPipelineFile: true }),
    ...validatePrDraft(contract, ci, { file: args.contract }),
    ...validateEvidence(manifest, planContract, {
      file: args.evidence,
      artifactsRoot: artifactRoot,
      verifyArtifacts: true,
      acceptancePlanFile: planFile,
      environmentContractFile: environmentFile,
      repositoryRoot: root,
      ci,
    }),
  ];
  if (args['body-out'] || args.out) findings.push({
    severity: 'P0',
    code: 'pr-local-output-forbidden',
    message: 'factory-pr does not write repository or arbitrary local output files; capture its JSON stdout instead',
  });
  if (args.execute === true && authorizationKeyFile === candidateAuthorizationKeyFile) findings.push({ severity: 'P0', code: 'pr-protected-trust-anchor-missing', message: 'execution requires an authorization public key from a disjoint protected trust root' });
  if (manifest.publication?.mode === 'ci_artifact' && manifest.publication?.retention_days !== ci?.artifacts?.retention_days) findings.push({ severity: 'P0', code: 'pr-evidence-retention-mismatch', message: 'evidence retention differs from the CI contract' });
  if (manifest.publication?.mode === 'ci_artifact' && String(args['acceptance-run-id'] || '') !== String(manifest.publication?.ci_run_id || '')) findings.push({ severity: 'P0', code: 'pr-acceptance-run-mismatch', message: '--acceptance-run-id must equal the CI run bound by the evidence manifest' });
  if (manifest.verdict !== 'ready') findings.push({ severity: 'P0', code: 'pr-evidence-not-ready', message: 'a draft PR cannot be created from blocked evidence' });
  const testedSha = String(manifest.subject?.tested_sha || '').toLowerCase();
  if (!String(contract.replay_command || '').includes('$FACTORY_SUBJECT_SHA') || !String(contract.replay_command || '').includes('$FACTORY_RUN_ID')) findings.push({ severity: 'P0', code: 'pr-replay-command-stale', message: 'replay_command must consume FACTORY_SUBJECT_SHA and FACTORY_RUN_ID instead of embedding stale values' });
  const evidenceCommitSha = String(args['evidence-commit-sha'] || '').toLowerCase();
  if (manifest.publication?.mode === 'evidence_only_commit' && !SHA_PATTERN.test(evidenceCommitSha)) findings.push({ severity: 'P0', code: 'pr-evidence-commit-sha-missing', message: 'evidence_only_commit delivery requires --evidence-commit-sha from the V3 publication event' });
  if (manifest.publication?.mode !== 'evidence_only_commit' && evidenceCommitSha) findings.push({ severity: 'P0', code: 'pr-evidence-commit-sha-conflict', message: '--evidence-commit-sha is valid only for evidence_only_commit publication' });
  const expectedHeadSha = manifest.publication?.mode === 'evidence_only_commit'
    ? evidenceCommitSha
    : testedSha;
  const headSha = String(args['head-sha'] || expectedHeadSha).toLowerCase();
  if (!SHA_PATTERN.test(headSha) || headSha !== expectedHeadSha) findings.push({ severity: 'P0', code: 'pr-subject-sha-mismatch', message: 'head SHA must equal the publication-mode revision bound by the evidence manifest' });
  if (SHA_PATTERN.test(testedSha)) {
    try {
      const digest = sourceTreeDigest(root, testedSha, { excludedPrefixes: [`${manifest.spec_package}/acceptance/runs`] });
      if (digest !== manifest.subject?.source_tree_digest) findings.push({ severity: 'P0', code: 'pr-source-digest-mismatch', message: 'tested source tree does not match the evidence manifest digest' });
      if (manifest.publication?.mode === 'evidence_only_commit' && SHA_PATTERN.test(expectedHeadSha)) {
        const evidenceOnly = verifyEvidenceOnlyCommit(root, testedSha, expectedHeadSha, [`${manifest.spec_package}/acceptance/runs`]);
        if (!evidenceOnly.ok) findings.push({ severity: 'P0', code: evidenceOnly.code, message: `evidence commit changes non-evidence files: ${(evidenceOnly.forbidden || []).join(', ')}` });
      }
    } catch (error) {
      findings.push({ severity: 'P0', code: 'pr-source-provenance-unverifiable', message: error.message });
    }
  }
  const headRef = safeRef(args['head-ref'] || process.env[contract.head_ref_from], 'head ref');
  const baseRef = safeRef(args['base-ref'] || contract.base_ref, 'base ref');
  const bodyPath = bodyFile;
  for (const key of ['spec_ref', 'factory_plan_ref', 'acceptance_matrix_ref', 'environment_contract_ref', 'ci_contract_ref']) {
    try {
      resolveContainedRegularFile(root, path.resolve(root, contract[key]));
    } catch (error) {
      findings.push({ severity: 'P0', code: 'pr-reference-path-invalid', message: `${key}: ${error.message}` });
    }
  }
  try {
    const factoryPlan = readData(factoryPlanFile);
    const factoryPackageRoot = path.dirname(path.dirname(factoryPlanFile));
    const plannedSpec = resolveContainedRegularFile(factoryPackageRoot, path.resolve(factoryPackageRoot, factoryPlan?.spec_path || '<missing>')).absolute;
    if (factoryPlan?.v !== 3 || fs.realpathSync(plannedSpec) !== fs.realpathSync(specFile) || !Array.isArray(factoryPlan?.lots) || factoryPlan.lots.length === 0) {
      findings.push({ severity: 'P0', code: 'pr-factory-plan-invalid', message: 'factory_plan_ref must be a V3 plan bound to spec_ref with at least one lot' });
    }
  } catch (error) {
    findings.push({ severity: 'P0', code: 'pr-factory-plan-invalid', message: error.message });
  }
  const release = validateReleaseEnvelope({
    planFile: factoryPlanFile,
    eventsFile,
    stateFile,
    specFile,
    manifestFile,
    manifest,
    candidateSha: testedSha,
    evidenceCommitSha: manifest.publication?.mode === 'evidence_only_commit' ? evidenceCommitSha : null,
    releaseMetadataFile,
    acceptanceRunId: args['acceptance-run-id'],
    controllerSha: releaseControllerSha,
  });
  findings.push(...release.findings);
  for (const [label, file] of [
    ['PR contract', contractFile],
    ['specification', specFile],
    ['factory plan', factoryPlanFile],
    ['acceptance plan', planFile],
    ['environment contract', environmentFile],
    ['CI contract', ciFile],
    ['PR body', bodyFile],
    ['authorization public key declaration', candidateAuthorizationKeyFile],
  ]) verifyFrozen(file, testedSha, label, findings);
  const frozenInputDigests = {
    contract: sha256File(contractFile),
    factory_plan: sha256File(factoryPlanFile),
    factory_events: sha256File(eventsFile),
    factory_state: sha256File(stateFile),
    release_metadata: sha256File(releaseMetadataFile),
    evidence_manifest: sha256File(manifestFile),
    acceptance_plan: sha256File(planFile),
    environment_contract: sha256File(environmentFile),
    ci_contract: sha256File(ciFile),
    artifact_bundle: manifest.publication?.bundle_digest || sha256File(manifestFile),
  };
  let body = '';
  try {
    const resolvedBody = resolveContainedRegularFile(root, bodyPath);
    for (const issue of scanEvidenceFile(resolvedBody.absolute, resolvedBody.relative)) findings.push({ severity: 'P0', ...issue, file: resolvedBody.relative });
    body = bodyWithEvidence(fs.readFileSync(resolvedBody.absolute, 'utf8'), manifest, contract, evidenceCommitSha || null);
    for (const issue of scanEvidenceText(body, 'generated PR body')) findings.push({ severity: 'P0', ...issue, file: resolvedBody.relative });
  } catch (error) {
    findings.push({ severity: 'P0', code: 'pr-body-path-invalid', message: error.message });
  }

  const plan = {
    mode: args.execute === true ? 'execute' : 'dry-run',
    provider: 'github',
    operation: 'create-draft',
    title: contract.title,
    base_ref: baseRef,
    head_ref: headRef,
    head_sha: headSha,
    tested_sha: testedSha,
    argv: ['gh', 'pr', 'create', '--draft', '--base', baseRef, '--head', headRef, '--title', contract.title, '--body', '<generated-body>'],
  };
  if (findings.length) {
    printResult({ title: 'Factory draft PR', summary: { mode: plan.mode, findings: findings.length }, plan, findings }, args.json === true);
    process.exit(2);
  }
  if (args.execute !== true) {
    printResult({ title: 'Factory draft PR', summary: { mode: 'dry-run', findings: 0 }, plan, findings: [], message: 'No external action performed. Pass --execute with an external authorization receipt to create or update the draft.' }, args.json === true);
    process.exit(0);
  }
  if (!args['authorization-receipt']) throw new Error('--authorization-receipt is required for execution');
  run('gh', ['auth', 'status']);
  const repositoryInfo = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner']).stdout);
  if (repositoryInfo.nameWithOwner !== contract.repository) throw new Error(`observed repository ${repositoryInfo.nameWithOwner || '<missing>'} differs from frozen target ${contract.repository}`);
  const remoteSha = remoteHeadSha(repositoryInfo.nameWithOwner, headRef);
  if (remoteSha !== headSha) throw new Error(`remote head ${remoteSha || '<missing>'} does not equal tested SHA ${headSha}`);
  const acceptanceAttestation = manifest.publication?.mode === 'ci_artifact'
    ? verifyActionsAttestation(
      repositoryInfo.nameWithOwner,
      args['acceptance-run-id'],
      manifest,
      contract,
      testedSha,
      releaseControllerSha,
      release.derived?.provenance?.publication?.manifest_locator,
      releaseMetadata,
    )
    : null;
  const releaseAttestation = verifyReleaseActionsAttestation(repositoryInfo.nameWithOwner, args['release-run-id'], {
    controllerSha: releaseControllerSha,
    candidateSha: testedSha,
    acceptanceRunId: args['acceptance-run-id'],
    metadata: releaseMetadata,
  });
  const inputDigests = {
    ...frozenInputDigests,
    acceptance_artifact: acceptanceAttestation?.artifact?.digest || sha256File(manifestFile),
    acceptance_envelope_artifact: acceptanceAttestation?.manifestArtifact?.digest || sha256File(manifestFile),
    release_artifact: releaseAttestation.artifact.digest,
  };
  const authorization = validateAuthorizationReceipt(args['authorization-receipt'], contract, {
    candidateSha: testedSha,
    prHeadSha: headSha,
    headRef,
    baseRef,
    inputDigests,
    publicKeyFile: authorizationKeyFile,
    repository: repositoryInfo.nameWithOwner,
  });
  const existing = run('gh', ['pr', 'list', '--head', headRef, '--state', 'open', '--json', 'number,url,isDraft,headRefOid,baseRefName,title,body'], { allowFailure: false });
  const rows = JSON.parse(existing.stdout || '[]');
  if (rows.length > 1) throw new Error('multiple open PRs exist for the same head branch; refusing an ambiguous update');
  let operation;
  if (rows.length) {
    const current = rows[0];
    if (current.headRefOid?.toLowerCase() !== headSha) throw new Error('existing draft PR points at a different head SHA');
    if (current.isDraft !== true) throw new Error('an open non-draft PR already exists for this branch');
    if (current.baseRefName !== baseRef || current.title !== contract.title || current.body !== body) {
      run('gh', ['pr', 'edit', String(current.number), '--base', baseRef, '--title', contract.title, '--body', body]);
      operation = { outcome: 'updated', number: current.number, url: current.url, head_sha: headSha };
    } else operation = { outcome: 'existing', number: current.number, url: current.url, head_sha: headSha };
  } else {
    const created = run('gh', ['pr', 'create', '--draft', '--base', baseRef, '--head', headRef, '--title', contract.title, '--body', body]);
    operation = { outcome: 'created', url: created.stdout.trim(), head_sha: headSha };
  }
  operation.authorization = { gate_id: authorization.gate_id, approver_ref: authorization.approver_ref, authorized_at: authorization.authorized_at };
  printResult({ title: 'Factory draft PR', summary: { mode: 'execute', outcome: operation.outcome }, plan, operation, findings: [] }, args.json === true);
  process.exit(0);
} catch (error) {
  printResult({ title: 'Factory draft PR', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-pr-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
