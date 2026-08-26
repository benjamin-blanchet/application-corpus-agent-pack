import fs from 'node:fs';
import path from 'node:path';

import { parseYaml } from '../factory-delivery/yaml.mjs';
import { canonicalHash, canonicalJson, canonicalJsonPretty, fileHash, normalizedFileHash } from './canonical-json.mjs';
import { readEventFile, validateEventChain } from './event-log.mjs';
import {
  classifyGitHeadChange,
  findGitRoot,
  observedGitHead,
  validateEvidenceManifest,
  validateReleaseProvenance,
} from './provenance.mjs';
import { reduceFactory, stateMatchesDerived } from './reducer.mjs';
import { validatePlan } from './contract.mjs';
import { changedPathsInsideForbidden, changedPathsOutsideClaims, normalizeRepoPath, pathAllowedByPatterns } from './path-claims.mjs';
import { captureCorpusTree, observeCorpusValidation, observeCorpusValidator } from './corpus-attestation.mjs';
import { changeInventoryDigest, normalizeChangeInventory } from './proof-contracts.mjs';
import {
  assertGitCommit,
  controllerWorkspaceExclusions,
  captureWorkspaceSnapshot,
  deriveWorkspaceDeltaFiles,
} from './workspace-attestation.mjs';
import { defaultDiffBudget, exceededDiffBudget, observeChangeMetrics } from './diff-budget.mjs';
import { repositoryArtifactDigest, repositoryFileObservation } from './artifact-digest.mjs';
import { appendConfinedFile, assertConfinedDirectory, assertConfinedRegularFile, readConfinedFile } from './safe-path.mjs';
import { buildCandidateBinding, captureGitCommitSnapshot, committedFileObservation } from './git-review-attestation.mjs';
import { validateVerificationReceiptBytes } from './verification-receipt.mjs';

export function factoryPaths(packageDir) {
  const factoryDir = path.join(packageDir, 'factory');
  return {
    factoryDir,
    plan: path.join(factoryDir, 'plan.v3.json'),
    events: path.join(factoryDir, 'events.v3.jsonl'),
    state: path.join(factoryDir, 'state.v3.json'),
    evidence: path.join(factoryDir, 'evidence-manifest.v3.json'),
  };
}

export function loadFactoryPackage(packageDir, { allowInvalidPlan = false } = {}) {
  const repoRoot = findGitRoot(packageDir);
  if (!repoRoot) throw codedError('factory-package-repository-missing', 'factory package must be contained in a Git repository');
  assertConfinedDirectory({ repoRoot, directory: packageDir, label: 'factory package' });
  const paths = factoryPaths(packageDir);
  const plan = readJson(paths.plan, repoRoot, 'factory plan');
  const events = readEventFile(paths.events, { repoRoot });
  const specPath = resolvePackageLocalReference(packageDir, plan.spec_path);
  const environmentPath = plan.environment_contract ? resolveRepositoryReference(repoRoot, plan.environment_contract) : null;
  const packageRef = repositoryPackageReference(repoRoot, packageDir);
  const baseCurrent = {
    plan_sha256: canonicalHash(plan),
    spec_exists: fs.existsSync(specPath),
    spec_sha256: fs.existsSync(specPath) ? normalizedFileHash(specPath) : null,
    git_head: observedGitHead(repoRoot),
  };
  const event = lastEvidenceEvent(events);
  const evidencePath = event ? resolveEvidenceManifestLocator({ repoRoot, packageDir, paths, locator: event.data.manifest_locator }) : paths.evidence;
  const evidence = confinedData(evidencePath, repoRoot, { allowMissing: true, label: 'factory evidence manifest' });
  // Derive the event state before interpreting a post-freeze HEAD. Otherwise
  // a legitimate evidence-only commit would be mistaken for application work
  // before its event-bound publication envelope can be inspected.
  const eventCurrent = { ...baseCurrent };
  delete eventCurrent.git_head;
  const preProvenance = reduceFactory({ plan, events, current: eventCurrent, allowInvalidPlan });
  const gitChangeClass = classifyGitHeadChange({ repoRoot, state: preProvenance, expectedPackageRef: packageRef });
  const checked = validateEvidenceForState({
    packageDir,
    plan,
    state: preProvenance,
    event,
    evidence,
    evidencePath,
    environmentPath,
    repoRoot,
    expectedPackageRef: packageRef,
  });
  const current = {
    ...baseCurrent,
    git_change_class: gitChangeClass,
    evidence_manifest_sha256: evidence ? canonicalHash(evidence) : null,
    provenance_status: checked.findings.length === 0 && event ? 'valid' : event ? 'invalid' : null,
    provenance_reason: checked.findings[0]?.message || null,
  };
  const derived = reduceFactory({ plan, events, current, allowInvalidPlan });
  const snapshot = readJson(paths.state, repoRoot, 'factory derived state', true);
  return {
    packageDir,
    paths,
    plan,
    events,
    current,
    derived,
    snapshot,
    evidence,
    evidencePath,
    evidenceEvent: event,
    specPath,
    environmentPath,
    repoRoot,
    packageRef,
    provenanceFindings: checked.findings,
  };
}

export function validateEvidenceForState({
  packageDir,
  plan,
  state,
  event,
  evidence = undefined,
  evidencePath = undefined,
  environmentPath = undefined,
  repoRoot = undefined,
  expectedPackageRef = undefined,
}) {
  const findings = [];
  if (!event) return { evidence: evidence ?? null, evidencePath: evidencePath ?? null, findings };

  const resolvedRepoRoot = repoRoot === undefined ? findGitRoot(packageDir) : repoRoot;
  const resolvedEvidencePath = evidencePath || resolveEvidenceManifestLocator({
    repoRoot: resolvedRepoRoot,
    packageDir,
    paths: factoryPaths(packageDir),
    locator: event.data.manifest_locator,
  });
  if (!fs.existsSync(resolvedEvidencePath)) {
    findings.push(finding('factory-evidence-manifest-missing', `evidence manifest materialization is missing for ${event.data.manifest_locator?.kind || 'unknown'} locator`));
    return { evidence: null, evidencePath: resolvedEvidencePath, findings };
  }

  let manifest = evidence;
  try {
    if (manifest === undefined) manifest = readData(resolvedEvidencePath);
  } catch (error) {
    findings.push(finding('factory-evidence-manifest-unreadable', `cannot parse evidence manifest: ${error.message}`));
    return { evidence: null, evidencePath: resolvedEvidencePath, findings };
  }

  const resolvedEnvironmentPath = environmentPath === undefined
    ? (plan.environment_contract ? resolveRepositoryReference(resolvedRepoRoot, plan.environment_contract) : null)
    : environmentPath;
  const acceptancePlanFile = manifest?.acceptance?.plan_path
    ? resolveRepositoryReference(resolvedRepoRoot, manifest.acceptance.plan_path)
    : null;
  const canonicalPackageRef = expectedPackageRef === undefined
    ? repositoryPackageReference(resolvedRepoRoot, packageDir)
    : expectedPackageRef;

  findings.push(...validateEvidenceManifest(manifest, {
    plan,
    manifestPath: resolvedEvidencePath,
    artifactsRoot: path.dirname(resolvedEvidencePath),
    requireFiles: manifest?.publication?.mode === 'evidence_only_commit',
    acceptancePlanFile,
    environmentContractFile: resolvedEnvironmentPath,
    expectedSpecPackage: canonicalPackageRef,
  }));
  if (canonicalHash(manifest) !== event.data.evidence_manifest_sha256) findings.push(finding('factory-evidence-manifest-stale', 'evidence manifest digest does not match the evidence_committed event'));
  if (manifest.run_id !== state.run_id) findings.push(finding('factory-evidence-run-mismatch', 'evidence manifest run_id differs from the event stream'));
  if (manifest?.subject?.head_sha !== state.provenance.candidate_sha) findings.push(finding('factory-evidence-candidate-mismatch', 'evidence manifest subject.head_sha differs from the frozen candidate'));
  if ((manifest?.subject?.tested_sha ?? null) !== state.provenance.tested_sha) findings.push(finding('factory-evidence-tested-mismatch', 'evidence manifest subject.tested_sha differs from acceptance provenance'));
  findings.push(...validateReleaseProvenance({
    repoRoot: resolvedRepoRoot,
    state,
    manifest,
    expectedPackageRef: canonicalPackageRef,
  }));
  return { evidence: manifest, evidencePath: resolvedEvidencePath, findings: deduplicate(findings) };
}

// executeCandidateValidator stays false by default: this entry point is what
// the policy workflow runs against a candidate checkout, and a candidate is
// data. The local controller opts in on its own tree.
export function validateFactoryPackageV3(packageDir, { executeCandidateValidator = false } = {}) {
  const findings = [];
  let loaded;
  try {
    loaded = loadFactoryPackage(packageDir);
  } catch (error) {
    return [{ severity: 'P0', code: error.code || 'factory-v3-load-failed', message: error.message, details: error.details || {} }];
  }
  findings.push(...validatePlan(loaded.plan));
  findings.push(...validateHandoffInputs(loaded));
  findings.push(...validateEventChain(loaded.events));
  for (const event of loaded.events.filter((candidate) => candidate.type === 'lot_conventions_observed')) {
    findings.push(...validatePreimplementationConventionArtifacts({ event, plan: loaded.plan, repoRoot: loaded.repoRoot }));
  }
  for (const event of latestLotResultEvents(loaded.events)) {
    findings.push(...validateLotWorkspaceAttestation({ event, events: loaded.events, plan: loaded.plan, repoRoot: loaded.repoRoot, packageRef: loaded.packageRef, runMode: loaded.derived.run_mode }));
    findings.push(...validateLotResultArtifacts({ event, plan: loaded.plan, repoRoot: loaded.repoRoot }));
  }
  findings.push(...validateGitReviewAttestations({ events: loaded.events, repoRoot: loaded.repoRoot, packageRef: loaded.packageRef }));
  for (const event of loaded.events.filter((candidate) => candidate.type === 'integration_verified')) {
    for (const receipt of event.data?.verifications || []) findings.push(...validateVerificationReceiptBytes({ repoRoot: loaded.repoRoot, receipt }));
  }
  const corpusEvent = [...loaded.events].reverse().find((event) => event.type === 'corpus_closed') || null;
  if (corpusEvent) findings.push(...validateCorpusCloseoutArtifact({ event: corpusEvent, repoRoot: loaded.repoRoot, executeCandidateValidator }));
  if (!fs.existsSync(loaded.specPath)) findings.push(finding('factory-specification-missing', `specification file is missing: ${loaded.plan.spec_path}`));
  if (loaded.environmentPath && !fs.existsSync(loaded.environmentPath)) findings.push(finding('factory-environment-contract-missing', `environment contract is missing: ${loaded.plan.environment_contract}`));
  if (!loaded.snapshot) findings.push(finding('factory-state-v3-missing', 'factory/state.v3.json is missing'));
  else if (!stateMatchesDerived(loaded.snapshot, loaded.derived)) findings.push(finding('factory-state-v3-stale', 'factory/state.v3.json does not exactly match the event-derived state'));
  if (loaded.derived.gates.evidence.status === 'valid' && !loaded.evidence) findings.push(finding('factory-evidence-manifest-missing', 'a valid evidence gate requires the event-bound evidence manifest'));
  findings.push(...loaded.provenanceFindings);
  return deduplicate(findings);
}

export function validatePreimplementationConventionArtifacts({ event, plan, repoRoot }) {
  if (!event || event.type !== 'lot_conventions_observed') return [];
  if (!repoRoot) return [finding('factory-preimplementation-contract-repository', 'preimplementation convention evidence requires a containing Git repository')];
  const lotId = event.subject?.lot_id;
  const lot = (plan?.lots || []).find((candidate) => candidate.id === lotId);
  if (!lot) return [finding('factory-event-lot', `convention contract refers to unknown lot ${String(lotId)}`)];
  const findings = [];
  for (const convention of event.data?.observed_conventions || []) {
    for (const example of convention?.examples || []) {
      if (!pathAllowedByPatterns(example?.path, lot.read_claims || [])) {
        findings.push(finding('factory-preimplementation-contract-read-claim', `${lotId}: convention example ${String(example?.path)} is outside declared read claims`));
        continue;
      }
      try {
        const observed = committedFileObservation({
          repoRoot,
          revision: event.data?.source_revision,
          repoPath: example?.path,
        });
        if (!observed.exists) findings.push(finding('factory-preimplementation-contract-file-missing', `${lotId}: convention example is absent from source revision: ${example?.path}`));
        else if (observed.kind !== 'file') findings.push(finding('factory-preimplementation-contract-file-kind', `${lotId}: convention example is not a regular committed file: ${example?.path}`));
        else if (observed.sha256 !== example?.sha256 || observed.bytes !== example?.bytes) findings.push(finding('factory-preimplementation-contract-bytes-mismatch', `${lotId}: convention example bytes differ from source revision: ${example?.path}`));
      } catch (error) {
        findings.push(finding(error.code || 'factory-preimplementation-contract-unreadable', `${lotId}: cannot verify convention example ${String(example?.path)}: ${error.message}`));
      }
    }
  }
  return findings;
}

// executeCandidateValidator is false everywhere the subject may be untrusted.
// Without it the validator's declared bytes are still compared to the bytes on
// disk; only result_sha256 — which cannot be known without running the subject
// — goes unverified. Both sides of that comparison were supplied by the
// subject anyway, so re-running it proved nothing it could not also forge.
export function validateCorpusCloseoutArtifact({ event, repoRoot, executeCandidateValidator = false }) {
  const findings = [];
  if (!event || event.type !== 'corpus_closed') return findings;
  if (!repoRoot) return [finding('factory-corpus-repository-missing', 'corpus closeout requires a containing Git repository')];
  try {
    const packageRef = event.subject?.package;
    const observedTree = captureCorpusTree({ repoRoot, packageRef });
    const claimedTree = {
      root_path: event.data.root_path,
      algorithm: event.data.algorithm,
      exclusions: event.data.exclusions,
      files: event.data.files,
      corpus_tree_sha256: event.data.corpus_tree_sha256,
    };
    if (canonicalJson(observedTree) !== canonicalJson(claimedTree)) {
      findings.push(finding('factory-corpus-tree-digest-mismatch', 'recursive doc/ bytes, inventory or controller exclusions differ from corpus_closed'));
    }
    const claimedValidation = event.data.validation;
    if (executeCandidateValidator) {
      const observedValidation = observeCorpusValidation({ repoRoot });
      if (canonicalJson(observedValidation) !== canonicalJson(claimedValidation)) {
        findings.push(finding('factory-corpus-validation-proof-mismatch', 'corpus validation proof differs from the current validator bytes or result'));
      }
    } else {
      const observedValidator = observeCorpusValidator({ repoRoot });
      const claimedValidator = { ...claimedValidation };
      delete claimedValidator.result_sha256;
      if (canonicalJson(observedValidator) !== canonicalJson(claimedValidator)) {
        findings.push(finding('factory-corpus-validation-proof-mismatch', 'corpus validation proof differs from the current validator bytes'));
      }
    }
  } catch (error) {
    findings.push(finding(error.code || 'factory-corpus-tree-unreadable', `cannot verify corpus closeout: ${error.message}`));
  }
  return findings;
}

export function validateLotResultArtifacts({ event, plan, repoRoot }) {
  if (!event || event.type !== 'lot_result_reported') return [];
  if (!repoRoot) return [finding('factory-artifact-repository-missing', 'lot result artifact verification requires a containing Git repository')];
  const lotId = event.subject?.lot_id;
  const lot = (plan?.lots || []).find((candidate) => candidate.id === lotId);
  if (!lot) return [finding('factory-event-lot', `lot result refers to unknown lot ${String(lotId)}`)];
  const findings = [];
  const result = event.data?.result;

  for (const entry of Array.isArray(result?.files) ? result.files : []) {
    if (!entry || typeof entry.path !== 'string' || !['present', 'deleted'].includes(entry.status)) continue;
    const label = `${lotId}.files.${entry.path}`;
    let observed;
    try {
      observed = repositoryFileObservation({ repoRoot, repoPath: entry.path });
    } catch (error) {
      findings.push(finding(error.code || 'factory-artifact-unreadable', `${label}: ${error.message}`));
      continue;
    }
    if (entry.status === 'present') {
      if (!observed.exists) findings.push(finding('factory-lot-file-missing', `${label}: a present changed file is missing`));
      else if (observed.kind !== 'file') findings.push(finding('factory-lot-file-not-regular', `${label}: a present changed path must be a regular file`));
      else if (observed.sha256 !== entry.sha256) findings.push(finding('factory-lot-file-digest-mismatch', `${label}: current file bytes differ from the result digest`));
    } else if (observed.exists) {
      findings.push(finding('factory-lot-deletion-not-observed', `${label}: a deleted path still exists`));
    }
  }

  for (const output of Array.isArray(result?.outputs) ? result.outputs : []) {
    if (!output || typeof output.path !== 'string' || !/^[0-9a-f]{64}$/.test(output.sha256 || '')) continue;
    const label = `${lotId}.outputs.${output.id || '<unknown>'}`;
    try {
      const observed = repositoryArtifactDigest({ repoRoot, repoPath: output.path });
      if (observed.kind !== output.kind) findings.push(finding('factory-lot-output-kind-mismatch', `${label}: current artifact kind differs from the result proof`));
      if (observed.algorithm !== output.algorithm) findings.push(finding('factory-lot-output-algorithm-mismatch', `${label}: current artifact algorithm differs from the result proof`));
      if (observed.sha256 !== output.sha256) findings.push(finding('factory-lot-output-digest-mismatch', `${label}: current artifact bytes differ from the result digest`));
    } catch (error) {
      findings.push(finding(error.code || 'factory-artifact-unreadable', `${label}: ${error.message}`));
    }
  }
  for (const receipt of Array.isArray(result?.verification) ? result.verification : []) {
    findings.push(...validateVerificationReceiptBytes({ repoRoot, receipt }));
  }
  for (const convention of Array.isArray(result?.observed_conventions) ? result.observed_conventions : []) {
    for (const example of convention?.examples || []) findings.push(...validateByteReferenceArtifact({ repoRoot, reference: example, scope: `observed convention ${convention?.id || '<unknown>'}` }));
  }
  const assessment = result?.refactor_assessment;
  if (assessment?.status === 'approved') {
    for (const evidence of assessment.evidence || []) findings.push(...validateByteReferenceArtifact({ repoRoot, reference: evidence, scope: 'approved refactor evidence' }));
  }
  return findings;
}

export function validateGitReviewAttestations({ events, repoRoot, packageRef }) {
  const findings = [];
  let integrationSnapshot = null;
  let consolidatedSnapshot = null;
  let corpusEvent = null;
  for (const event of events || []) {
    try {
      if (event.type === 'integration_verified') {
        const observed = captureGitCommitSnapshot({ repoRoot, revision: event.data?.reviewed_snapshot?.commit_sha });
        if (canonicalJson(observed) !== canonicalJson(event.data?.reviewed_snapshot)) findings.push(finding('factory-integration-reviewed-snapshot-drift', 'integration reviewed_snapshot differs from Git commit bytes'));
        integrationSnapshot = event.data?.reviewed_snapshot;
        consolidatedSnapshot = null;
      } else if (event.type === 'consolidated_reviewed' && event.data?.verdict === 'passed') {
        const observed = captureGitCommitSnapshot({ repoRoot, revision: event.data?.reviewed_snapshot?.commit_sha });
        if (canonicalJson(observed) !== canonicalJson(event.data?.reviewed_snapshot)) findings.push(finding('factory-consolidated-reviewed-snapshot-drift', 'consolidated reviewed_snapshot differs from Git commit bytes'));
        if (event.data?.reviewed_snapshot?.snapshot_sha256 !== integrationSnapshot?.snapshot_sha256) findings.push(finding('factory-consolidated-review-snapshot-mismatch', 'consolidated review did not review the exact integration snapshot'));
        consolidatedSnapshot = event.data?.reviewed_snapshot;
      } else if (event.type === 'corpus_closed') {
        corpusEvent = event;
      } else if (event.type === 'candidate_frozen') {
        const observed = buildCandidateBinding({
          repoRoot,
          packageRef,
          reviewedSnapshot: consolidatedSnapshot,
          candidateSha: event.data?.candidate_sha,
          corpusEvent,
        });
        if (canonicalJson(observed) !== canonicalJson(event.data?.binding)) findings.push(finding('factory-candidate-binding-drift', 'candidate binding differs from the reviewed Git and corpus state'));
      }
    } catch (error) {
      findings.push(finding(error.code || 'factory-git-review-attestation-invalid', error.message));
    }
  }
  return findings;
}

function validateByteReferenceArtifact({ repoRoot, reference, scope }) {
  try {
    const observed = repositoryFileObservation({ repoRoot, repoPath: reference?.path });
    if (!observed.exists || observed.kind !== 'file') return [finding('factory-convention-evidence-missing', `${scope}: evidence must be a regular file` )];
    if (observed.sha256 !== reference?.sha256 || observed.bytes !== reference?.bytes) return [finding('factory-convention-evidence-drift', `${scope}: evidence bytes differ from the result` )];
    return [];
  } catch (error) {
    return [finding(error.code || 'factory-convention-evidence-unreadable', `${scope}: ${error.message}`)];
  }
}

export function validateLotWorkspaceAttestation({ event, events, plan, repoRoot, packageRef, runMode }) {
  if (!event || event.type !== 'lot_result_reported') return [];
  const lotId = event.subject?.lot_id;
  const resultIndex = (events || []).findIndex((candidate) => candidate.event_id === event.event_id);
  const started = [...(events || []).slice(0, resultIndex < 0 ? undefined : resultIndex)].reverse()
    .find((candidate) => candidate.type === 'lot_started' && candidate.subject?.lot_id === lotId);
  if (!started) return [finding('factory-workspace-baseline-missing', `${lotId}: lot result has no preceding lot_started workspace snapshot`)];
  const findings = [];
  const fromSnapshot = started.data?.workspace_snapshot;
  const delta = event.data?.result?.workspace_delta;
  try {
    assertGitCommit(repoRoot, fromSnapshot.base_revision);
  } catch (error) {
    findings.push(finding(error.code || 'factory-workspace-base-unresolvable', `${lotId}: base_revision is not a resolvable Git commit`));
    return findings;
  }
  const expectedExclusions = controllerWorkspaceExclusions(packageRef);
  if (canonicalJson(fromSnapshot.exclusions) !== canonicalJson(expectedExclusions)
    || canonicalJson(delta?.to_snapshot?.exclusions) !== canonicalJson(expectedExclusions)) {
    findings.push(finding('factory-workspace-exclusions-drift', `${lotId}: workspace exclusions are not the closed controller policy`));
  }
  if (delta?.from_snapshot_sha256 !== fromSnapshot.snapshot_sha256) findings.push(finding('factory-workspace-delta-from-mismatch', `${lotId}: workspace delta does not bind lot_started`));
  const expectedMode = runMode === 'retrospective_attestation' ? 'retrospective_attestation' : 'live';
  if (fromSnapshot.attestation_mode !== expectedMode || delta?.to_snapshot?.attestation_mode !== expectedMode) {
    findings.push(finding('factory-workspace-attestation-mode', `${lotId}: workspace attestation mode differs from package run_mode`));
  }
  if ((fromSnapshot.entries || []).length !== 0) findings.push(finding('factory-workspace-dirty-baseline', `${lotId}: lot_started baseline must be clean`));
  if (expectedMode === 'retrospective_attestation') {
    try {
      const current = captureWorkspaceSnapshot({
        workspaceRoot: repoRoot,
        repositoryRoot: repoRoot,
        baseRevision: fromSnapshot.base_revision,
        exclusions: expectedExclusions,
        allowHeadDivergence: true,
        attestationMode: 'retrospective_attestation',
      });
      if (canonicalJson(current) !== canonicalJson(delta?.to_snapshot)) findings.push(finding('factory-retrospective-workspace-drift', `${lotId}: current base-to-final Git delta differs from the retrospective attestation`));
    } catch (error) {
      findings.push(finding(error.code || 'factory-retrospective-workspace-invalid', `${lotId}: cannot recompute retrospective workspace delta: ${error.message}`));
    }
  }
  try {
    const observedFiles = normalizeChangeInventory(deriveWorkspaceDeltaFiles({
      fromSnapshot,
      toSnapshot: delta.to_snapshot,
      gitRoot: repoRoot,
    }));
    const claimedFiles = normalizeChangeInventory(event.data.result.files);
    if (canonicalJson(observedFiles) !== canonicalJson(claimedFiles)) findings.push(finding('factory-workspace-delta-declaration-mismatch', `${lotId}: persisted snapshots do not derive the claimed files`));
    if (changeInventoryDigest(observedFiles) !== delta.files_sha256) findings.push(finding('factory-workspace-delta-files-mismatch', `${lotId}: workspace delta files digest is invalid`));
  } catch (error) {
    findings.push(finding(error.code || 'factory-workspace-attestation-invalid', `${lotId}: cannot replay workspace attestation: ${error.message}`));
  }
  const lot = (plan?.lots || []).find((candidate) => candidate.id === lotId);
  if (lot) {
    const outside = changedPathsOutsideClaims(event.data.result.changed_paths || [], lot.write_claims || []);
    if (outside.length) findings.push(finding('factory-lot-outside-reservation', `${lotId}: attested delta escapes write claims: ${outside.join(', ')}`));
    const forbidden = changedPathsInsideForbidden(event.data.result.changed_paths || [], lot.forbidden_paths || []);
    if (forbidden.length) findings.push(finding('factory-lot-forbidden-path', `${lotId}: attested delta touches forbidden paths: ${forbidden.join(', ')}`));
    const budget = delta?.budget;
    if (budget?.source === 'policy_default' && canonicalJson({ max_files: budget.max_files, max_added_lines: budget.max_added_lines, max_deleted_lines: budget.max_deleted_lines, max_binary_files: budget.max_binary_files }) !== canonicalJson(defaultDiffBudget(lot))) {
      findings.push(finding('factory-diff-budget-policy-drift', `${lotId}: persisted default diff budget differs from controller policy`));
    }
    if (budget?.source === 'operator_override') {
      const approval = (events || []).find((candidate) => candidate.event_id === budget.override_event_id && candidate.type === 'diff_budget_overridden' && candidate.subject?.lot_id === lotId);
      if (!approval || canonicalJson(approval.data.limits) !== canonicalJson({ max_files: budget.max_files, max_added_lines: budget.max_added_lines, max_deleted_lines: budget.max_deleted_lines, max_binary_files: budget.max_binary_files })) findings.push(finding('factory-diff-budget-override-missing', `${lotId}: diff budget proof is not backed by its operator override event`));
    }
    const exceeded = exceededDiffBudget(delta?.metrics || {}, budget || {});
    if (exceeded.length) findings.push(finding('factory-diff-budget-exceeded', `${lotId}: persisted result exceeds its attested diff budget`));
    if (expectedMode === 'retrospective_attestation') {
      try {
        const recomputedMetrics = observeChangeMetrics({ workspaceRoot: repoRoot, baseRevision: fromSnapshot.base_revision, files: event.data.result.files });
        if (canonicalJson(recomputedMetrics) !== canonicalJson(delta.metrics)) findings.push(finding('factory-diff-budget-metrics-mismatch', `${lotId}: retrospective change metrics differ from current base-to-final bytes`));
      } catch (error) {
        findings.push(finding(error.code || 'factory-diff-budget-metrics-invalid', `${lotId}: cannot recompute change metrics: ${error.message}`));
      }
    }
  }
  return findings;
}

export function writeDerivedState(stateFile, derived, repoRoot = findGitRoot(path.dirname(stateFile))) {
  if (!repoRoot) throw codedError('factory-state-repository-missing', 'derived state must be written inside a Git repository');
  assertConfinedDirectory({ repoRoot, directory: path.dirname(stateFile), label: 'factory control directory' });
  const existing = assertConfinedRegularFile({ repoRoot, file: stateFile, allowMissing: true, label: 'factory derived state' });
  const temporary = `${stateFile}.tmp-${process.pid}`;
  assertConfinedRegularFile({ repoRoot, file: temporary, allowMissing: true, label: 'factory state temporary file' });
  fs.writeFileSync(temporary, canonicalJsonPretty(derived), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try {
    const temp = assertConfinedRegularFile({ repoRoot, file: temporary, label: 'factory state temporary file' });
    if (!temp.stat.isFile()) throw codedError('factory-state-temporary-invalid', 'state temporary path is not a regular file');
    if (existing.exists) {
      const now = assertConfinedRegularFile({ repoRoot, file: stateFile, label: 'factory derived state' });
      if (now.stat.dev !== existing.stat.dev || now.stat.ino !== existing.stat.ino) throw codedError('factory-state-raced', 'derived state changed before replacement');
    }
    fs.renameSync(temporary, stateFile);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function readJson(file, repoRoot, label, allowMissing = false) {
  const text = readConfinedFile({ repoRoot, file, encoding: 'utf8', allowMissing, label });
  if (text === null) return null;
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

function confinedData(file, repoRoot, { allowMissing = false, label = 'data file' } = {}) {
  const text = readConfinedFile({ repoRoot, file, encoding: 'utf8', allowMissing, label });
  if (text === null) return null;
  if (path.extname(file).toLowerCase() === '.json') return JSON.parse(text.replace(/^\uFEFF/, ''));
  return parseYaml(text, { source: file });
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function resolvePackageLocalReference(packageDir, reference) {
  const normalized = normalizeRepoPath(reference);
  const root = path.resolve(packageDir);
  const target = path.resolve(root, ...normalized.split('/'));
  if (!target.startsWith(`${root}${path.sep}`)) throw codedError('factory-package-reference-escape', 'package-relative reference escapes the package');
  return target;
}

export function resolveRepositoryReference(repoRoot, reference) {
  if (!repoRoot) throw codedError('factory-repository-reference-root', 'repository-relative reference requires a Git root');
  const normalized = normalizeRepoPath(reference);
  return path.resolve(repoRoot, ...normalized.split('/'));
}

export function resolveEvidenceManifestLocator({ repoRoot, packageDir, paths = factoryPaths(packageDir), locator }) {
  if (locator?.kind === 'repo_file') return resolveRepositoryReference(repoRoot, locator.path);
  if (locator?.kind === 'ci_artifact') {
    // External CI artifacts are not treated as repository files. The fixed
    // package cache is an offline verifier input whose digest is bound to the
    // external locator; it is never presented as the artifact's global state.
    return paths.evidence;
  }
  throw codedError('factory-evidence-locator-kind', `unsupported evidence manifest locator ${String(locator?.kind)}`);
}

function lastEvidenceEvent(events) {
  return [...events].reverse().find((event) => event.type === 'evidence_committed') || null;
}

function latestLotResultEvents(events) {
  const latest = new Map();
  for (const event of events || []) {
    if (event?.type === 'lot_result_reported' && typeof event.subject?.lot_id === 'string') latest.set(event.subject.lot_id, event);
  }
  return [...latest.values()];
}

function deduplicate(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finding(code, message) {
  return { severity: 'P0', code, message };
}

function repositoryPackageReference(repoRoot, packageDir) {
  if (!repoRoot || !fs.existsSync(repoRoot) || !fs.existsSync(packageDir)) return null;
  try {
    const root = fs.realpathSync(repoRoot);
    const target = fs.realpathSync(packageDir);
    const relative = path.relative(root, target).replace(/\\/g, '/');
    if (!relative || relative === '..' || relative.startsWith('../')) return null;
    return normalizeRepositoryPath(relative);
  } catch {
    return null;
  }
}

function validateHandoffInputs(loaded) {
  const findings = [];
  if (!loaded.repoRoot) return [finding('factory-handoff-repository-missing', 'handoff inputs require a containing Git repository')];
  let realRoot;
  const lexicalRoot = path.resolve(loaded.repoRoot);
  try {
    realRoot = fs.realpathSync(loaded.repoRoot);
  } catch (error) {
    return [finding('factory-handoff-repository-unreadable', `cannot resolve repository root: ${error.message}`)];
  }

  for (const lot of loaded.plan.lots || []) {
    for (const input of lot?.handoff?.inputs || []) {
      if (!input || typeof input.path !== 'string') continue;
      const label = `${lot.id}.${input.id || '<unknown>'}`;
      const file = resolveRepositoryReference(loaded.repoRoot, input.path);
      const relative = path.relative(lexicalRoot, path.resolve(file));
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        findings.push(finding('factory-handoff-input-outside-repository', `${label}: handoff input is outside the repository`));
        continue;
      }
      if (!fs.existsSync(file)) {
        findings.push(finding('factory-handoff-input-missing', `${label}: handoff input is missing: ${input.path}`));
        continue;
      }
      try {
        if (pathHasSymlink(lexicalRoot, relative)) {
          findings.push(finding('factory-handoff-input-symlink', `${label}: symbolic links are forbidden in handoff input paths`));
          continue;
        }
      } catch (error) {
        findings.push(finding('factory-handoff-input-unreadable', `${label}: cannot inspect handoff input path: ${error.message}`));
        continue;
      }
      let realFile;
      try {
        fs.accessSync(file, fs.constants.R_OK);
        realFile = fs.realpathSync(file);
      } catch (error) {
        findings.push(finding('factory-handoff-input-unreadable', `${label}: handoff input is not readable: ${error.message}`));
        continue;
      }
      if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) {
        findings.push(finding('factory-handoff-input-outside-repository', `${label}: canonical handoff input escapes the repository`));
        continue;
      }
      try {
        if (!fs.statSync(realFile).isFile()) {
          findings.push(finding('factory-handoff-input-not-file', `${label}: handoff input must be a regular file`));
          continue;
        }
        if (fileHash(realFile) !== input.sha256) {
          findings.push(finding('factory-handoff-input-digest-mismatch', `${label}: handoff input digest differs from the plan`));
        }
      } catch (error) {
        findings.push(finding('factory-handoff-input-unreadable', `${label}: cannot hash handoff input: ${error.message}`));
      }
    }
  }
  return findings;
}

function pathHasSymlink(root, relative) {
  let cursor = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) return true;
  }
  return false;
}

function normalizeRepositoryPath(value) {
  const normalized = String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) throw new Error('path is outside repository');
  return normalized;
}
