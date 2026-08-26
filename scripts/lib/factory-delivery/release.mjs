import { readData } from './files.mjs';
import { sha256File } from './core.mjs';
import { canonicalHash, normalizedFileHash } from '../factory-v3/canonical-json.mjs';
import { validatePlan } from '../factory-v3/contract.mjs';
import { eventLogHash, readEventFile, validateEventChain } from '../factory-v3/event-log.mjs';
import { reduceFactory, stateMatchesDerived } from '../factory-v3/reducer.mjs';

function finding(code, message) {
  return { severity: 'P0', code, message };
}

export function validateReleaseEnvelope({
  planFile,
  eventsFile,
  stateFile,
  specFile,
  manifestFile,
  manifest = null,
  candidateSha,
  evidenceCommitSha = null,
  releaseMetadataFile = null,
  acceptanceRunId = null,
  controllerSha = null,
} = {}) {
  const findings = [];
  let plan;
  let events;
  let state;
  let evidence;
  let metadata = null;
  let derived = null;
  try {
    plan = readData(planFile);
    events = readEventFile(eventsFile);
    state = readData(stateFile);
    evidence = manifest || readData(manifestFile);
    if (releaseMetadataFile) metadata = readData(releaseMetadataFile);
  } catch (error) {
    return { findings: [finding(error.code || 'pr-release-envelope-unreadable', error.message)], derived: null, inputDigests: null };
  }
  findings.push(...validatePlan(plan));
  findings.push(...validateEventChain(events));
  try {
    derived = reduceFactory({
      plan,
      events,
      current: {
        plan_sha256: canonicalHash(plan),
        spec_exists: true,
        spec_sha256: normalizedFileHash(specFile),
        git_head: candidateSha,
        git_change_class: 'none',
        evidence_manifest_sha256: canonicalHash(evidence),
        provenance_status: 'valid',
      },
    });
  } catch (error) {
    findings.push(finding(error.code || 'pr-release-replay-failed', error.message));
  }
  if (derived) {
    if (!stateMatchesDerived(state, derived)) findings.push(finding('pr-factory-state-stale', 'factory state is not the exact projection of the supplied event stream and current inputs'));
    if (derived.phase !== 'release_ready' || derived.gates?.release?.status !== 'valid') findings.push(finding('pr-release-not-ready', `event replay derived ${derived.phase || 'unknown'}, not release_ready`));
    if (derived.provenance?.candidate_sha !== candidateSha || derived.provenance?.tested_sha !== candidateSha) findings.push(finding('pr-release-candidate-mismatch', 'release state is not bound to the exact tested candidate'));
    if (derived.run_id !== evidence?.run_id) findings.push(finding('pr-release-run-mismatch', 'factory event run_id differs from the evidence run_id'));
    if (derived.digests?.evidence_manifest_sha256 !== canonicalHash(evidence)) findings.push(finding('pr-release-evidence-digest-mismatch', 'release state evidence digest differs from the supplied manifest'));
    const publication = derived.provenance?.publication;
    if (publication?.mode !== evidence?.publication?.mode) findings.push(finding('pr-release-publication-mismatch', 'release state publication mode differs from the evidence manifest'));
    if (publication?.mode === 'ci_artifact') {
      const locator = publication.manifest_locator;
      if (locator?.kind !== 'ci_artifact'
        || locator.provider !== 'github_actions'
        || String(locator.run_id) !== String(acceptanceRunId)
        || locator.name !== `factory-evidence-envelope-${acceptanceRunId}`
        || locator.path !== 'evidence-manifest.yaml'
        || locator.digest_sha256 !== canonicalHash(evidence)
        || locator.bundle_digest !== evidence?.publication?.bundle_digest
        || typeof locator.attestation_ref !== 'string'
        || !locator.attestation_ref) findings.push(finding('pr-release-publication-mismatch', 'release event CI locator does not bind the exact acceptance envelope, manifest and minimized evidence bundle'));
      if (publication.media_type !== 'application/zip') findings.push(finding('pr-release-publication-media-invalid', 'CI artifact release event must attest application/zip'));
    } else if (publication?.mode === 'evidence_only_commit') {
      if (derived.provenance?.evidence_sha !== evidenceCommitSha) findings.push(finding('pr-release-evidence-commit-mismatch', 'release event evidence_sha differs from the evidence-only commit delivered as the PR head'));
      if (publication.manifest_locator?.kind !== 'repo_file'
        || publication.manifest_locator?.digest_sha256 !== canonicalHash(evidence)) findings.push(finding('pr-release-publication-mismatch', 'evidence-only release locator does not bind the exact manifest file'));
    }
  }
  if (!metadata) findings.push(finding('pr-release-metadata-missing', 'release envelope metadata is required'));
  else {
    const expectedKeys = ['schema_version', 'workflow_ref', 'controller_sha', 'candidate_sha', 'acceptance_run_id', 'factory_run_id', 'evidence_manifest_sha256', 'acceptance_attestation_sha256', 'acceptance_artifact_digest', 'review_receipt_sha256', 'events_sha256', 'state_sha256', 'generated_at'].sort();
    if (Object.keys(metadata).sort().join(',') !== expectedKeys.join(',')) findings.push(finding('pr-release-metadata-shape', 'release metadata has missing or unsupported fields'));
    if (metadata.schema_version !== 1 || metadata.workflow_ref !== '.github/workflows/factory-release.yml') findings.push(finding('pr-release-workflow-mismatch', 'release metadata does not name the protected release workflow'));
    if (metadata.controller_sha !== controllerSha || metadata.candidate_sha !== candidateSha) findings.push(finding('pr-release-metadata-revision-mismatch', 'release metadata controller or candidate SHA differs from delivery inputs'));
    if (String(metadata.acceptance_run_id) !== String(acceptanceRunId) || metadata.factory_run_id !== evidence?.run_id) findings.push(finding('pr-release-metadata-run-mismatch', 'release metadata is not bound to the exact acceptance and factory runs'));
    if (metadata.evidence_manifest_sha256 !== canonicalHash(evidence) || metadata.events_sha256 !== eventLogHash(events) || metadata.state_sha256 !== sha256File(stateFile)) findings.push(finding('pr-release-metadata-digest-mismatch', 'release metadata does not match the exact evidence, events and state bytes'));
    if (!/^[0-9a-f]{64}$/.test(metadata.acceptance_attestation_sha256 || '') || !/^sha256:[0-9a-f]{64}$/.test(metadata.acceptance_artifact_digest || '')) findings.push(finding('pr-release-acceptance-attestation-digest', 'release metadata must bind the protected acceptance artifact attestation and observed artifact digest'));
    if (!/^[0-9a-f]{64}$/.test(metadata.review_receipt_sha256 || '')) findings.push(finding('pr-release-review-receipt-digest', 'release metadata must bind the signed review receipt digest'));
    if (Number.isNaN(Date.parse(metadata.generated_at))) findings.push(finding('pr-release-metadata-time-invalid', 'release metadata generated_at is invalid'));
  }
  return {
    findings,
    derived,
    inputDigests: {
      factory_plan: sha256File(planFile),
      factory_events: sha256File(eventsFile),
      factory_state: sha256File(stateFile),
      evidence_manifest: sha256File(manifestFile),
      ...(releaseMetadataFile ? { release_metadata: sha256File(releaseMetadataFile) } : {}),
    },
  };
}
