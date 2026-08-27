#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendEventFile } from './lib/factory-v3/event-log.mjs';
import { canonicalHash, canonicalJsonPretty } from './lib/factory-v3/canonical-json.mjs';
import {
  loadFactoryPackage,
  validateCorpusCloseoutArtifact,
  validateEvidenceForState,
  validateFactoryPackageV3,
  validateGitReviewAttestations,
  validateLotResultArtifacts,
  validatePreimplementationConventionArtifacts,
  writeDerivedState,
} from './lib/factory-v3/package-io.mjs';
import { reduceFactory } from './lib/factory-v3/reducer.mjs';
import { nextWave } from './lib/factory-v3/scheduler.mjs';
import { changedPathsInsideForbidden, changedPathsOutsideClaims, claimsOverlap } from './lib/factory-v3/path-claims.mjs';
import { integrationVerificationDigest, lotResultDigest, normalizeChangeInventory, preimplementationConventionDigest } from './lib/factory-v3/proof-contracts.mjs';
import {
  captureWorkspaceSnapshot,
  controllerWorkspaceExclusions,
  createWorkspaceDeltaAttestation,
  createRetrospectiveBaseline,
} from './lib/factory-v3/workspace-attestation.mjs';
import { captureCorpusCloseout } from './lib/factory-v3/corpus-attestation.mjs';
import { defaultDiffBudget, exceededDiffBudget, observeChangeMetrics } from './lib/factory-v3/diff-budget.mjs';
import { buildCandidateBinding, captureGitCommitSnapshot, committedFileObservation } from './lib/factory-v3/git-review-attestation.mjs';
import { materializeVerificationReceipts } from './lib/factory-v3/verification-receipt.mjs';
import { repositoryFileObservation } from './lib/factory-v3/artifact-digest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const [command, packageArg] = process.argv.slice(2);
const jsonMode = process.argv.includes('--json');

if (['-h', '--help'].includes(command)) usage(0);
if (!command || !packageArg) usage(1);
const packageDir = path.resolve(repoRoot, packageArg);

try {
  if (command === 'status') {
    const loaded = loadValidPackage(packageDir);
    emit(loaded.derived);
  } else if (command === 'validate') {
    const findings = validateFactoryPackageV3(packageDir);
    emit({ valid: findings.length === 0, findings });
    process.exitCode = findings.length ? 2 : 0;
  } else if (command === 'next-wave') {
    const loaded = loadValidPackage(packageDir);
    emit({ ready: nextWave(loaded.plan, loaded.derived) });
  } else if (command === 'append') {
    let input = readEventInput();
    const expected = option('--expected-seq');
    if (expected !== null) input.expected_previous_seq = Number(expected);
    if (!input.controller_id) throw coded('factory-cli-controller-required', 'event input requires controller_id');
    const apply = process.argv.includes('--apply');
    const loaded = loadFactoryPackage(packageDir);
    if (!input.subject) input.subject = { package: loaded.packageRef, lot_id: null };
    const workspaceRoot = path.resolve(process.cwd(), option('--workspace-root') || loaded.repoRoot);
    const baseRevision = option('--base-revision');
    input = materializeControllerAttestations(input, loaded, workspaceRoot, baseRevision);

    // Validate the entire prospective history before taking the writer lock.
    const preview = appendEventFile({ repoRoot: loaded.repoRoot, packageDir, eventInput: input, apply: false });
    const previewState = reduceFactory({ plan: loaded.plan, events: preview.events, current: loaded.current });
    validateProspectiveArtifacts(preview.event, previewState, loaded, packageDir);
    if (!apply) {
      emit({ applied: false, event: preview.event, derived_state: previewState });
    } else {
      const result = appendEventFile({
        repoRoot: loaded.repoRoot,
        packageDir,
        eventInput: input,
        apply: true,
        validateEvent: (checkedEvent) => {
          const locked = loadFactoryPackage(packageDir);
          if (canonicalHash(locked.plan) !== canonicalHash(loaded.plan)) throw coded('factory-plan-concurrent-change', 'factory plan changed while append was waiting for the controller lock');
          assertControllerAttestationsCurrent(checkedEvent, locked, workspaceRoot, baseRevision);
          const lockedState = reduceFactory({ plan: locked.plan, events: [...locked.events, checkedEvent], current: locked.current });
          validateProspectiveArtifacts(checkedEvent, lockedState, locked, packageDir);
        },
      });
      const refreshed = loadFactoryPackage(packageDir);
      writeDerivedState(refreshed.paths.state, refreshed.derived, refreshed.repoRoot);
      emit({ applied: true, event: result.event, derived_state: refreshed.derived });
    }
  } else {
    usage(1, `unknown command: ${command}`);
  }
} catch (error) {
  emit({ error: { code: error.code || 'factory-cli-error', message: error.message, details: error.details || {} } });
  process.exitCode = 1;
}

function materializeControllerAttestations(input, loaded, workspaceRoot, baseRevisionOption = null) {
  const value = structuredClone(input);
  if (value.type === 'lot_conventions_observed') {
    const lotId = value.subject?.lot_id;
    const lot = loaded.plan.lots.find((candidate) => candidate.id === lotId);
    if (!lot) throw coded('factory-event-lot', `unknown lot ${String(lotId)}`);
    const sourceRevision = captureGitCommitSnapshot({ repoRoot: loaded.repoRoot, revision: loaded.current.git_head }).commit_sha;
    const observedConventions = materializePreimplementationConventionEvidence(value.data?.observed_conventions, loaded.repoRoot, sourceRevision);
    value.data = {
      algorithm: 'sha256-canonical-json-v1',
      source_revision: sourceRevision,
      observed_conventions: observedConventions,
      contract_sha256: null,
    };
    value.data.contract_sha256 = preimplementationConventionDigest(value.data);
    return value;
  }
  if (value.type === 'wave_reserved') {
    assertReservationConventionContractsCurrent(value, loaded);
    return value;
  }
  if (value.type === 'corpus_closed') {
    value.data = captureCorpusCloseout({ repoRoot: loaded.repoRoot, packageRef: loaded.packageRef });
    return value;
  }
  if (value.type === 'integration_verified') {
    const reviewedSnapshot = captureCleanReviewedSnapshot({ loaded, workspaceRoot });
    const verifications = materializeVerificationReceipts({
      repoRoot: loaded.repoRoot,
      controllerId: value.controller_id,
      receipts: value.data?.verifications,
    });
    value.data = { ...value.data, reviewed_snapshot: reviewedSnapshot, verifications, verification_sha256: null };
    value.data.verification_sha256 = integrationVerificationDigest(value.data);
    return value;
  }
  if (value.type === 'consolidated_reviewed') {
    value.data = { ...value.data, reviewed_snapshot: captureCleanReviewedSnapshot({ loaded, workspaceRoot }) };
    return value;
  }
  if (value.type === 'candidate_frozen') {
    const currentHead = captureGitCommitSnapshot({ repoRoot: loaded.repoRoot, revision: loaded.current.git_head });
    if (value.data?.candidate_sha !== currentHead.commit_sha) throw coded('factory-candidate-not-current-head', 'candidate_frozen must target the current Git HEAD');
    const corpusEvent = [...loaded.events].reverse().find((event) => event.type === 'corpus_closed');
    const reviewedSnapshot = loaded.derived.provenance?.consolidated_snapshot;
    value.data = {
      candidate_sha: currentHead.commit_sha,
      binding: buildCandidateBinding({
        repoRoot: loaded.repoRoot,
        packageRef: loaded.packageRef,
        reviewedSnapshot,
        candidateSha: currentHead.commit_sha,
        corpusEvent,
      }),
    };
    return value;
  }
  if (!['lot_started', 'lot_result_reported'].includes(value.type)) return value;
  const lotId = value.subject?.lot_id;
  const lot = loaded.plan.lots.find((candidate) => candidate.id === lotId);
  if (!lot) throw coded('factory-event-lot', `unknown lot ${String(lotId)}`);
  const exclusions = controllerWorkspaceExclusions(loaded.packageRef);
  assertExclusionsOutsideLot(exclusions, lot);
  if (value.type === 'lot_started') {
    const retrospective = loaded.derived.run_mode === 'retrospective_attestation';
    if (retrospective && !baseRevisionOption) throw coded('factory-retrospective-base-required', 'retrospective lot_started requires controller option --base-revision <full-git-sha>');
    const snapshot = retrospective
      ? createRetrospectiveBaseline({ workspaceRoot, repositoryRoot: loaded.repoRoot, baseRevision: baseRevisionOption, exclusions })
      : captureWorkspaceSnapshot({ workspaceRoot, repositoryRoot: loaded.repoRoot, baseRevision: baseRevisionOption, exclusions });
    assertBaselineClean(snapshot, lot);
    value.data = { ...value.data, workspace_snapshot: snapshot };
    return value;
  }

  const startSnapshot = loaded.derived.lots?.[lotId]?.workspace_snapshot;
  if (!startSnapshot) throw coded('factory-workspace-baseline-missing', `${lotId}: no controller workspace snapshot exists for the active attempt`);
  if (JSON.stringify(startSnapshot.exclusions) !== JSON.stringify(exclusions)) throw coded('factory-workspace-exclusions-drift', `${lotId}: persisted workspace exclusions differ from controller policy`);
  const current = captureWorkspaceSnapshot({
    workspaceRoot,
    repositoryRoot: loaded.repoRoot,
    baseRevision: startSnapshot.base_revision,
    exclusions,
    allowHeadDivergence: startSnapshot.attestation_mode === 'retrospective_attestation',
    attestationMode: startSnapshot.attestation_mode,
  });
  const metrics = observeChangeMetrics({ workspaceRoot, baseRevision: startSnapshot.base_revision, files: createWorkspaceDeltaAttestation({ fromSnapshot: startSnapshot, toSnapshot: current, workspaceRoot }).files });
  const override = loaded.derived.lots?.[lotId]?.diff_budget_override;
  const limits = override || defaultDiffBudget(lot);
  const budget = {
    source: override ? 'operator_override' : 'policy_default',
    max_files: limits.max_files,
    max_added_lines: limits.max_added_lines,
    max_deleted_lines: limits.max_deleted_lines,
    max_binary_files: limits.max_binary_files,
    override_event_id: override?.event_id || null,
  };
  const observed = createWorkspaceDeltaAttestation({ fromSnapshot: startSnapshot, toSnapshot: current, workspaceRoot, metrics, budget });
  if (!observed.files.length) throw coded('factory-workspace-delta-empty', `${lotId}: no workspace change was observed after lot_started`);
  const exceeded = exceededDiffBudget(metrics, budget);
  if (exceeded.length) {
    const error = coded('factory-diff-budget-exceeded', `${lotId}: observed Git delta exceeds its diff budget`);
    error.details = { exceeded, metrics, budget };
    throw error;
  }
  const declared = normalizeChangeInventory(value.data?.result?.files || []);
  const expected = normalizeChangeInventory(observed.files);
  if (JSON.stringify(declared) !== JSON.stringify(expected)) {
    throw coded('factory-workspace-delta-declaration-mismatch', `${lotId}: reported files do not exactly match the controller-observed Git workspace delta`);
  }
  const declaredPaths = value.data?.result?.changed_paths || [];
  if (JSON.stringify(declaredPaths) !== JSON.stringify(expected.map((entry) => entry.path))) {
    throw coded('factory-workspace-delta-coverage', `${lotId}: changed_paths omit or add paths relative to the controller-observed Git workspace delta`);
  }
  const verification = materializeVerificationReceipts({
    repoRoot: loaded.repoRoot,
    controllerId: value.controller_id,
    receipts: value.data?.result?.verification,
  });
  const observedConventions = materializeConventionEvidence(value.data?.result?.observed_conventions, loaded.repoRoot);
  const refactorAssessment = materializeRefactorEvidence(value.data?.result?.refactor_assessment, loaded.repoRoot);
  const result = {
    ...value.data.result,
    base_revision: startSnapshot.base_revision,
    changed_paths: expected.map((entry) => entry.path),
    files: expected,
    workspace_delta: observed.delta,
    verification,
    observed_conventions: observedConventions,
    refactor_assessment: refactorAssessment,
    diff_sha256: null,
  };
  result.diff_sha256 = lotResultDigest(result);
  value.data = { result };
  value.basis = { ...(value.basis || {}), diff_sha256: result.diff_sha256 };
  return value;
}

function assertControllerAttestationsCurrent(event, loaded, workspaceRoot, baseRevisionOption) {
  if (!['lot_conventions_observed', 'wave_reserved', 'lot_started', 'lot_result_reported', 'integration_verified', 'consolidated_reviewed', 'corpus_closed', 'candidate_frozen'].includes(event.type)) return;
  const recomputed = materializeControllerAttestations({
    ...event,
    expected_previous_seq: loaded.events.length,
  }, loaded, workspaceRoot, baseRevisionOption);
  if (canonicalHash(recomputed.data) !== canonicalHash(event.data) || canonicalHash(recomputed.basis) !== canonicalHash(event.basis)) {
    throw coded('factory-workspace-changed-during-append', 'workspace attestation changed while waiting for the controller lock');
  }
}

function materializePreimplementationConventionEvidence(conventions, repoRoot, sourceRevision) {
  return materializeConventionEvidence(conventions, repoRoot).map((convention) => ({
    ...convention,
    examples: convention.examples.map((example) => {
      const committed = committedFileObservation({ repoRoot, revision: sourceRevision, repoPath: example.path });
      if (!committed.exists || committed.kind !== 'file') throw coded('factory-preimplementation-contract-file', `convention evidence must be a committed regular file: ${example.path}`);
      if (committed.sha256 !== example.sha256 || committed.bytes !== example.bytes) {
        throw coded('factory-preimplementation-contract-dirty', `convention evidence differs from committed source revision: ${example.path}`);
      }
      return example;
    }),
  }));
}

function assertReservationConventionContractsCurrent(event, loaded) {
  const currentHead = captureGitCommitSnapshot({ repoRoot: loaded.repoRoot, revision: loaded.current.git_head }).commit_sha;
  for (const reservation of event.data?.reservations || []) {
    const contract = loaded.derived.lots?.[reservation.lot_id]?.preimplementation_contract;
    if (!contract) throw coded('factory-preimplementation-contract-required', `${reservation.lot_id}: convention contract is required before reservation`);
    if (contract.source_revision !== currentHead) throw coded('factory-preimplementation-contract-stale', `${reservation.lot_id}: convention contract was observed on a different Git revision`);
    for (const convention of contract.observed_conventions || []) {
      for (const example of convention.examples || []) {
        const current = repositoryFileObservation({ repoRoot: loaded.repoRoot, repoPath: example.path });
        if (!current.exists || current.kind !== 'file' || current.sha256 !== example.sha256 || current.bytes !== example.bytes) {
          throw coded('factory-preimplementation-contract-stale', `${reservation.lot_id}: convention evidence changed before reservation: ${example.path}`);
        }
      }
    }
    const findings = validatePreimplementationConventionArtifacts({
      event: {
        type: 'lot_conventions_observed',
        subject: { lot_id: reservation.lot_id },
        data: contract,
      },
      plan: loaded.plan,
      repoRoot: loaded.repoRoot,
    });
    if (findings.length) {
      const error = coded(findings[0].code, findings[0].message);
      error.details = { findings };
      throw error;
    }
  }
}

function captureCleanReviewedSnapshot({ loaded, workspaceRoot }) {
  const exclusions = controllerWorkspaceExclusions(loaded.packageRef);
  const workspace = captureWorkspaceSnapshot({
    workspaceRoot,
    repositoryRoot: loaded.repoRoot,
    exclusions,
  });
  if (workspace.entries.length) throw coded('factory-review-workspace-dirty', `review snapshot requires a clean worktree outside controller exclusions: ${workspace.entries.map((entry) => entry.path).join(', ')}`);
  return captureGitCommitSnapshot({ repoRoot: loaded.repoRoot, revision: workspace.base_revision });
}

function materializeConventionEvidence(conventions, repoRoot) {
  return (conventions || []).map((convention) => ({
    ...convention,
    examples: (convention.examples || []).map((example) => materializeByteReference(example, repoRoot)),
  }));
}

function materializeRefactorEvidence(assessment, repoRoot) {
  if (!assessment || assessment.status !== 'approved') return assessment;
  return { ...assessment, evidence: (assessment.evidence || []).map((entry) => materializeByteReference(entry, repoRoot)) };
}

function materializeByteReference(reference, repoRoot) {
  const observed = repositoryFileObservation({ repoRoot, repoPath: reference?.path });
  if (!observed.exists || observed.kind !== 'file') throw coded('factory-controller-evidence-file', `controller evidence must be a regular file: ${String(reference?.path)}`);
  return { path: reference.path, sha256: observed.sha256, bytes: observed.bytes };
}

function assertExclusionsOutsideLot(exclusions, lot) {
  for (const excluded of exclusions) {
    const exact = { kind: 'exact', path: excluded };
    const prefix = { kind: 'prefix', path: excluded };
    if ((lot.write_claims || []).some((claim) => claimsOverlap(claim, exact) || claimsOverlap(claim, prefix))) {
      throw coded('factory-workspace-exclusion-claim-overlap', `${lot.id}: controller exclusion ${excluded} intersects a write claim`);
    }
    if ((lot.forbidden_paths || []).some((forbidden) => claimsOverlap({ kind: 'prefix', path: forbidden }, exact))) {
      throw coded('factory-workspace-exclusion-forbidden-overlap', `${lot.id}: controller exclusion ${excluded} intersects a forbidden path`);
    }
  }
}

function assertBaselineClean(snapshot, lot) {
  if (snapshot.entries.length !== 0) {
    throw coded('factory-workspace-dirty-baseline', `${lot.id}: live lot baseline must be clean outside closed controller exclusions`);
  }
}

function readEventInput() {
  const file = option('--event-file');
  const inline = option('--event-json');
  if (Boolean(file) === Boolean(inline)) throw coded('factory-cli-event-input', 'provide exactly one of --event-file or --event-json');
  return JSON.parse(file ? fs.readFileSync(path.resolve(process.cwd(), file), 'utf8') : inline);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function emit(value) {
  if (jsonMode || typeof value !== 'string') process.stdout.write(canonicalJsonPretty(value));
  else process.stdout.write(`${value}\n`);
}

function coded(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadValidPackage(directory) {
  const findings = validateFactoryPackageV3(directory);
  if (findings.length) {
    const error = coded('factory-package-invalid', `factory package is invalid: ${findings[0].code}`);
    error.details = { findings };
    throw error;
  }
  return loadFactoryPackage(directory);
}

function validateProspectiveArtifacts(event, state, loaded, packageDir) {
  if (event.type === 'lot_conventions_observed') {
    const findings = validatePreimplementationConventionArtifacts({ event, plan: loaded.plan, repoRoot: loaded.repoRoot });
    if (findings.length) {
      const error = coded(findings[0].code, findings[0].message);
      error.details = { findings };
      throw error;
    }
  }
  if (event.type === 'lot_result_reported') {
    const findings = validateLotResultArtifacts({ event, plan: loaded.plan, repoRoot: loaded.repoRoot });
    if (findings.length) {
      const error = coded(findings[0].code, findings[0].message);
      error.details = { findings };
      throw error;
    }
  }
  if (event.type === 'corpus_closed') {
    // The local controller owns the tree it is closing out, so running its
    // own validator is running its own code.
    const findings = validateCorpusCloseoutArtifact({ event, repoRoot: loaded.repoRoot, executeCandidateValidator: true });
    if (findings.length) {
      const error = coded(findings[0].code, findings[0].message);
      error.details = { findings };
      throw error;
    }
  }
  if (['integration_verified', 'consolidated_reviewed', 'candidate_frozen'].includes(event.type)) {
    const findings = validateGitReviewAttestations({ events: [...loaded.events, event], repoRoot: loaded.repoRoot, packageRef: loaded.packageRef });
    if (findings.length) {
      const error = coded(findings[0].code, findings[0].message);
      error.details = { findings };
      throw error;
    }
  }
  if (event.type !== 'evidence_committed') return;
  const { findings } = validateEvidenceForState({
    packageDir,
    plan: loaded.plan,
    state,
    event,
    environmentPath: loaded.environmentPath,
    repoRoot: loaded.repoRoot,
  });
  if (findings.length) {
    const error = coded(findings[0].code, findings[0].message);
    error.details = { findings };
    throw error;
  }
}

function usage(exitCode, message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write('Usage: node scripts/factory-control.mjs <status|validate|next-wave|append> <package-dir> [--json]\n');
  process.stderr.write('Append is dry-run by default; mutation requires --apply and --event-file/--event-json. Lot events accept --workspace-root <git-worktree>; retrospective lot_started also requires --base-revision <full-git-sha>.\n');
  process.exit(exitCode);
}
