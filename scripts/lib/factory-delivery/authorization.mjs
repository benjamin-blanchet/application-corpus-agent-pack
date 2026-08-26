import crypto from 'node:crypto';

import { SHA_PATTERN, stableJson } from './core.mjs';

const RECEIPT_KEYS = [
  'version',
  'provider',
  'repository',
  'issuer_ref',
  'gate_id',
  'candidate_sha',
  'head_sha',
  'head_ref',
  'base_ref',
  'input_digests',
  'approver_ref',
  'authorized_at',
  'nonce',
  'signature',
];

const RELEASE_REVIEW_KEYS = [
  'version', 'factory_run_id', 'candidate_sha', 'acceptance_run_id',
  'evidence_manifest_sha256', 'plan_sha256', 'spec_sha256',
  'reviewer_execution_id', 'reviewer_model', 'verdict', 'fresh_context',
  'reviewer_model_family', 'basis_models', 'basis_model_families', 'independence_exception',
  'findings', 'reviewed_at', 'nonce', 'signature',
];

const ACCEPTANCE_CAPABILITY_KEYS = [
  'version', 'provider', 'repository', 'workflow_ref', 'provider_run_id',
  'factory_run_id', 'candidate_sha', 'plan_sha256', 'environment_sha256',
  'profile', 'grants', 'issued_at', 'expires_at', 'nonce', 'signature',
];

const NETWORK_GRANT_KEYS = [
  'capability', 'authorization_ref', 'target', 'run_id', 'runner_trust',
  'egress_allowlist', 'secret_refs', 'approved_by', 'approved_at',
];

const MUTATION_GRANT_KEYS = [
  'capability', 'authorization_ref', 'target', 'environment', 'side_effects',
  'approved_by', 'approved_at',
];

export const AUTHORIZED_INPUT_DIGEST_KEYS = [
  'contract',
  'factory_plan',
  'factory_events',
  'factory_state',
  'release_metadata',
  'evidence_manifest',
  'acceptance_plan',
  'environment_contract',
  'ci_contract',
  'artifact_bundle',
  'acceptance_artifact',
  'acceptance_envelope_artifact',
  'release_artifact',
];

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function canonicalStringSet(value) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.length > 0)
    && new Set(value).size === value.length
    ? [...value].sort()
    : null;
}

export function verifyAcceptanceCapabilityReceipt(receipt, {
  provider,
  repository,
  workflowRef,
  providerRunId,
  factoryRunId,
  candidateSha,
  planSha256,
  environmentSha256,
  profile,
  expectedNetwork = null,
  expectedMutations = [],
  publicKey,
  now = Date.now(),
} = {}) {
  if (!exactKeys(receipt, ACCEPTANCE_CAPABILITY_KEYS)) throw new Error('acceptance capability receipt has missing or unsupported fields');
  if (receipt.version !== 1
    || receipt.provider !== provider
    || receipt.repository !== repository
    || receipt.workflow_ref !== workflowRef
    || String(receipt.provider_run_id) !== String(providerRunId)
    || receipt.factory_run_id !== factoryRunId
    || receipt.candidate_sha !== candidateSha
    || receipt.plan_sha256 !== planSha256
    || receipt.environment_sha256 !== environmentSha256
    || receipt.profile !== profile) throw new Error('acceptance capability receipt is not bound to the exact protected run and inputs');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/.test(receipt.nonce || '')) throw new Error('acceptance capability receipt nonce is invalid');
  const issuedAt = Date.parse(receipt.issued_at);
  const expiresAt = Date.parse(receipt.expires_at);
  if (Number.isNaN(issuedAt) || Number.isNaN(expiresAt) || issuedAt > now + 5 * 60 * 1000 || expiresAt <= now || expiresAt - issuedAt > 2 * 60 * 60 * 1000) throw new Error('acceptance capability receipt is expired, from the future or too long-lived');
  if (!Array.isArray(receipt.grants)) throw new Error('acceptance capability grants must be an array');
  const networkGrants = receipt.grants.filter((grant) => grant?.capability === 'network');
  const mutationGrants = receipt.grants.filter((grant) => grant?.capability === 'data_mutation');
  if (receipt.grants.length !== networkGrants.length + mutationGrants.length) throw new Error('acceptance capability receipt contains an unsupported grant');
  if (expectedNetwork) {
    if (networkGrants.length !== 1 || !exactKeys(networkGrants[0], NETWORK_GRANT_KEYS)) throw new Error('acceptance requires exactly one typed network grant');
    const grant = networkGrants[0];
    const actualEgress = canonicalStringSet(grant.egress_allowlist);
    const actualSecrets = canonicalStringSet(grant.secret_refs);
    if (!actualEgress || !actualSecrets
      || grant.target !== expectedNetwork.target
      || grant.run_id !== factoryRunId
      || grant.runner_trust !== 'protected'
      || actualEgress.join(',') !== [...expectedNetwork.egress_allowlist].sort().join(',')
      || actualSecrets.join(',') !== [...expectedNetwork.secret_refs].sort().join(',')) throw new Error('acceptance network grant differs from the exact environment contract');
  } else if (networkGrants.length !== 0) throw new Error('acceptance receipt contains an unnecessary network grant');
  const expectedMutationByTarget = new Map(expectedMutations.map((mutation) => [mutation.target, mutation]));
  if (mutationGrants.length !== expectedMutationByTarget.size) throw new Error('acceptance mutation grants do not cover the exact planned mutations');
  for (const grant of mutationGrants) {
    if (!exactKeys(grant, MUTATION_GRANT_KEYS)) throw new Error('acceptance mutation grant has an invalid shape');
    const expected = expectedMutationByTarget.get(grant.target);
    const actualSideEffects = canonicalStringSet(grant.side_effects);
    if (!expected || !actualSideEffects || grant.environment !== 'non_production'
      || actualSideEffects.join(',') !== [...expected.side_effects].sort().join(',')) throw new Error('acceptance mutation grant differs from the exact planned non-production mutation');
  }
  for (const grant of receipt.grants) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{2,255}$/.test(grant.authorization_ref || '')
      || !/^[A-Za-z][A-Za-z0-9._\/-]{0,127}$/.test(grant.approved_by || '')
      || Number.isNaN(Date.parse(grant.approved_at))
      || Date.parse(grant.approved_at) > issuedAt) throw new Error('acceptance capability grant approval is invalid');
  }
  const { signature, ...payload } = receipt;
  let decoded;
  try { decoded = Buffer.from(signature, 'base64'); } catch { throw new Error('acceptance capability signature is not base64'); }
  if (decoded.length < 32 || !crypto.verify(null, Buffer.from(stableJson(payload)), publicKey, decoded)) throw new Error('acceptance capability signature verification failed');
  return {
    receipt,
    receipt_sha256: crypto.createHash('sha256').update(stableJson(receipt)).digest('hex'),
    grants: receipt.grants,
  };
}

export function verifyGitHubActionsAttestation({
  repository,
  runId,
  manifest,
  contract,
  testedSha,
  workflowSha,
  runRecord,
  artifactResponse,
  manifestLocator = null,
  releaseMetadata = null,
} = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('GitHub repository identity is invalid');
  if (!/^\d+$/.test(String(runId || '')) || !SHA_PATTERN.test(workflowSha || '')) throw new Error('acceptance run id and protected workflow SHA are required');
  if (String(manifest?.publication?.ci_run_id) !== String(runId)) throw new Error('acceptance run id differs from the evidence publication');
  if (String(runRecord?.id) !== String(runId)
    || String(runRecord?.head_sha || '').toLowerCase() !== workflowSha
    || runRecord?.status !== 'completed'
    || runRecord?.conclusion !== 'success'
    || runRecord?.event !== contract?.ci_attestation?.event
    || runRecord?.path !== contract?.ci_attestation?.workflow_ref) throw new Error('GitHub Actions run does not attest the exact successful acceptance workflow and candidate');
  const artifactId = String(manifest?.publication?.artifact_id || '');
  if (!/^\d+$/.test(artifactId)) throw new Error('evidence artifact id must be a numeric GitHub Actions artifact id');
  const artifactMatches = (artifactResponse?.artifacts || []).filter((item) => String(item.id) === artifactId
    && item.name === `${contract?.ci_attestation?.artifact_name_prefix}${runId}`);
  if (artifactMatches.length !== 1) throw new Error('GitHub Actions run does not contain exactly one expected minimized evidence bundle');
  const artifact = artifactMatches[0];
  if (!artifact
    || artifact.expired !== false
    || String(artifact.workflow_run?.id) !== String(runId)
    || !/^sha256:[0-9a-f]{64}$/i.test(artifact.digest || '')) throw new Error('GitHub Actions artifact does not attest the expected unexpired minimized evidence bundle');
  const createdAt = Date.parse(artifact.created_at);
  const expiresAt = Date.parse(artifact.expires_at);
  const expectedRetention = Number(manifest.publication.retention_days) * 24 * 60 * 60 * 1000;
  if (Number.isNaN(createdAt) || Number.isNaN(expiresAt) || Math.abs((expiresAt - createdAt) - expectedRetention) > 5 * 60 * 1000) throw new Error('GitHub artifact retention does not match the evidence contract');
  const url = new URL(manifest.publication.artifact_url);
  const expectedPath = `/${repository}/actions/runs/${runId}/artifacts/${artifactId}`;
  if (url.hostname !== 'github.com' || url.pathname.replace(/\/$/, '') !== expectedPath) throw new Error('evidence artifact URL is not bound to the attested repository, run and artifact');
  let manifestArtifact = null;
  if (manifestLocator) {
    if (manifestLocator.kind !== 'ci_artifact'
      || manifestLocator.provider !== 'github_actions'
      || String(manifestLocator.run_id) !== String(runId)
      || manifestLocator.name !== `factory-evidence-envelope-${runId}`
      || manifestLocator.path !== 'evidence-manifest.yaml'
      || manifestLocator.digest_sha256 !== crypto.createHash('sha256').update(stableJson(manifest)).digest('hex')
      || manifestLocator.bundle_digest !== manifest?.publication?.bundle_digest) throw new Error('release manifest locator is not bound to the exact acceptance evidence');
    const matches = (artifactResponse?.artifacts || []).filter((item) => String(item.id) === String(manifestLocator.artifact_id)
      && item.name === manifestLocator.name);
    if (matches.length !== 1) throw new Error('acceptance run does not contain exactly one located evidence envelope');
    manifestArtifact = matches[0];
    if (manifestArtifact.expired !== false
      || String(manifestArtifact.workflow_run?.id) !== String(runId)
      || !/^sha256:[0-9a-f]{64}$/i.test(manifestArtifact.digest || '')
      || manifestLocator.attestation_ref !== githubArtifactAttestationRef({
        repository,
        runId,
        artifactId: manifestArtifact.id,
        digest: manifestArtifact.digest,
      })) throw new Error('evidence manifest artifact attestation does not match the observed GitHub artifact');
  }
  const manifestAttestation = manifestArtifact ? {
    schema_version: 2,
    provider: 'github_actions',
    repository,
    workflow_ref: contract.ci_attestation.workflow_ref,
    run_id: String(runId),
    workflow_sha: workflowSha,
    subject_sha: testedSha,
    conclusion: 'success',
    artifact: {
      id: String(manifestArtifact.id),
      name: manifestArtifact.name,
      digest: String(manifestArtifact.digest).toLowerCase(),
    },
    attestation_ref: githubArtifactAttestationRef({
      repository,
      runId,
      artifactId: manifestArtifact.id,
      digest: manifestArtifact.digest,
    }),
  } : null;
  if (releaseMetadata) {
    const attestationHash = manifestAttestation
      ? crypto.createHash('sha256').update(stableJson(manifestAttestation)).digest('hex')
      : null;
    if (!manifestAttestation
      || releaseMetadata.acceptance_attestation_sha256 !== attestationHash
      || releaseMetadata.acceptance_artifact_digest !== manifestAttestation.artifact.digest) {
      throw new Error('release metadata does not bind the exact observed acceptance envelope attestation');
    }
  }
  return { run: runRecord, artifact, manifestArtifact, manifestAttestation };
}

export function verifyReleaseReviewReceipt(receipt, {
  factoryRunId,
  candidateSha,
  acceptanceRunId,
  evidenceManifestSha256,
  planSha256,
  specSha256,
  reviewerModel,
  reviewerModelFamily,
  basisModels = [],
  controllerExecutionId,
  publicKey,
  now = Date.now(),
} = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('release review receipt must be a mapping');
  if (Object.keys(receipt).sort().join(',') !== [...RELEASE_REVIEW_KEYS].sort().join(',')) throw new Error('release review receipt has missing or unsupported fields');
  if (receipt.version !== 1
    || receipt.factory_run_id !== factoryRunId
    || receipt.candidate_sha !== candidateSha
    || String(receipt.acceptance_run_id) !== String(acceptanceRunId)
    || receipt.evidence_manifest_sha256 !== evidenceManifestSha256
    || receipt.plan_sha256 !== planSha256
    || receipt.spec_sha256 !== specSha256) throw new Error('release review receipt is not bound to the exact release basis');
  if (receipt.verdict !== 'passed' || receipt.fresh_context !== true || !Array.isArray(receipt.findings) || receipt.findings.length !== 0) throw new Error('release review receipt must be an independent passing review with no findings');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(receipt.reviewer_execution_id || '') || receipt.reviewer_execution_id === controllerExecutionId) throw new Error('release review identity is missing or not independent from the controller');
  if (receipt.reviewer_model !== reviewerModel) throw new Error('release review model differs from the resolved reviewer profile');
  const familyPattern = /^(?:unknown|[a-z0-9][a-z0-9._-]{0,63})$/;
  if (!familyPattern.test(receipt.reviewer_model_family || '') || receipt.reviewer_model_family !== reviewerModelFamily) throw new Error('release review model family differs from the resolved reviewer policy');
  if (!Array.isArray(receipt.basis_models) || receipt.basis_models.length !== basisModels.length) throw new Error('release review model provenance does not cover every event author');
  const expectedByExecution = new Map(basisModels.map((entry) => [entry.execution_id, {
    model: entry.model ?? null,
    model_family: entry.model_family ?? 'unknown',
  }]));
  const seenExecutions = new Set();
  for (const entry of receipt.basis_models) {
    if (!entry || Object.keys(entry).sort().join(',') !== ['execution_id', 'model', 'model_family'].join(',')) throw new Error('release review basis model provenance has an invalid shape');
    const expected = expectedByExecution.get(entry.execution_id);
    if (seenExecutions.has(entry.execution_id) || !expected || entry.model !== expected.model || entry.model_family !== expected.model_family) throw new Error('release review basis model provenance differs from the event authors');
    if (!familyPattern.test(entry.model_family || '') || (entry.model === null && entry.model_family !== 'unknown')) throw new Error('release review basis model family must be explicit and canonical');
    seenExecutions.add(entry.execution_id);
  }
  const expectedFamilies = [...new Set(receipt.basis_models.map((entry) => entry.model_family))].sort();
  if (!Array.isArray(receipt.basis_model_families)
    || receipt.basis_model_families.some((family) => !familyPattern.test(family))
    || [...new Set(receipt.basis_model_families)].sort().join(',') !== expectedFamilies.join(',')) throw new Error('release review model-family summary differs from its explicit provenance');
  const independenceUnknown = receipt.reviewer_model_family === 'unknown' || expectedFamilies.includes('unknown');
  const sameFamily = expectedFamilies.includes(receipt.reviewer_model_family);
  if (sameFamily || independenceUnknown) {
    const exception = receipt.independence_exception;
    if (!exception || Object.keys(exception).sort().join(',') !== ['approved_at', 'approved_by', 'reason'].join(',') || String(exception.reason || '').trim().length < 8 || !/^[A-Za-z][A-Za-z0-9._\/-]{0,127}$/.test(exception.approved_by || '') || Number.isNaN(Date.parse(exception.approved_at)) || Date.parse(exception.approved_at) > Date.parse(receipt.reviewed_at)) throw new Error('same-family or unknown-family release review requires a typed approved independence exception');
  } else if (receipt.independence_exception !== null) throw new Error('release review must not carry an unnecessary independence exception');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/.test(receipt.nonce || '')) throw new Error('release review nonce is invalid');
  const reviewedAt = Date.parse(receipt.reviewed_at);
  if (Number.isNaN(reviewedAt) || reviewedAt > now + 5 * 60 * 1000 || now - reviewedAt > 2 * 60 * 60 * 1000) throw new Error('release review receipt is expired or from the future');
  const { signature, ...payload } = receipt;
  let decoded;
  try { decoded = Buffer.from(signature, 'base64'); } catch { throw new Error('release review signature is not base64'); }
  if (decoded.length < 32 || !crypto.verify(null, Buffer.from(stableJson(payload)), publicKey, decoded)) throw new Error('release review signature verification failed');
  return receipt;
}

export function verifyReleaseGitHubActionsAttestation({
  repository,
  runId,
  controllerSha,
  candidateSha,
  acceptanceRunId,
  metadata,
  runRecord,
  artifactResponse,
} = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^\d+$/.test(String(runId || ''))) throw new Error('release repository or run identity is invalid');
  if (String(runRecord?.id) !== String(runId)
    || String(runRecord?.head_sha || '').toLowerCase() !== controllerSha
    || runRecord?.status !== 'completed'
    || runRecord?.conclusion !== 'success'
    || runRecord?.event !== 'repository_dispatch'
    || runRecord?.path !== '.github/workflows/factory-release.yml') throw new Error('GitHub Actions run does not attest the exact protected release workflow and controller');
  if (metadata?.controller_sha !== controllerSha || metadata?.candidate_sha !== candidateSha || String(metadata?.acceptance_run_id) !== String(acceptanceRunId)) throw new Error('release metadata is not bound to the controller, candidate and acceptance run');
  const artifacts = (artifactResponse?.artifacts || []).filter((item) => item.name === `factory-release-envelope-${runId}`);
  if (artifacts.length !== 1) throw new Error('release run must publish exactly one expected release envelope');
  const artifact = artifacts[0];
  if (artifact.expired !== false || String(artifact.workflow_run?.id) !== String(runId) || !/^sha256:[0-9a-f]{64}$/i.test(artifact.digest || '')) throw new Error('release artifact identity, lifetime or digest is invalid');
  return { run: runRecord, artifact };
}

export function githubArtifactAttestationRef({ repository, runId, artifactId, digest } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')
    || !/^\d+$/.test(String(runId || ''))
    || !/^\d+$/.test(String(artifactId || ''))
    || !/^sha256:[0-9a-f]{64}$/i.test(digest || '')) throw new Error('GitHub artifact attestation identity is invalid');
  return `github-actions:${repository}:${runId}:${artifactId}:${String(digest).toLowerCase()}`;
}

export function verifyAuthorizationReceipt(receipt, contract, {
  candidateSha,
  prHeadSha,
  headRef,
  baseRef,
  inputDigests,
  publicKey,
  repository,
  now = Date.now(),
} = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('authorization receipt must be a mapping');
  const keys = Object.keys(receipt).sort();
  if (keys.length !== RECEIPT_KEYS.length || RECEIPT_KEYS.some((key) => !Object.hasOwn(receipt, key))) throw new Error('authorization receipt has missing or unsupported fields');
  if (receipt.version !== 1) throw new Error('authorization receipt version must be 1');
  if (receipt.provider !== contract?.provider || receipt.provider !== 'github' || receipt.repository !== contract?.repository || receipt.repository !== repository) throw new Error('authorization receipt provider or repository does not match the observed delivery target');
  if (receipt.issuer_ref !== contract?.authorization?.issuer_ref || receipt.gate_id !== contract?.authorization?.gate_id) throw new Error('authorization receipt issuer or gate does not match the contract');
  if (!SHA_PATTERN.test(receipt.candidate_sha || '') || !SHA_PATTERN.test(receipt.head_sha || '')) throw new Error('authorization receipt revisions must be full SHAs');
  if (receipt.candidate_sha.toLowerCase() !== candidateSha || receipt.head_sha.toLowerCase() !== prHeadSha || receipt.head_ref !== headRef || receipt.base_ref !== baseRef) throw new Error('authorization receipt is not bound to this exact draft operation');
  const digestKeys = receipt.input_digests && typeof receipt.input_digests === 'object' && !Array.isArray(receipt.input_digests)
    ? Object.keys(receipt.input_digests).sort()
    : [];
  if (digestKeys.length !== AUTHORIZED_INPUT_DIGEST_KEYS.length || AUTHORIZED_INPUT_DIGEST_KEYS.some((key) => !Object.hasOwn(receipt.input_digests || {}, key))) throw new Error('authorization receipt input_digests are incomplete or unsupported');
  for (const key of AUTHORIZED_INPUT_DIGEST_KEYS) {
    if (!/^sha256:[0-9a-f]{64}$/i.test(receipt.input_digests[key] || '')) throw new Error(`authorization receipt input digest ${key} is invalid`);
    if (!inputDigests || receipt.input_digests[key] !== inputDigests[key]) throw new Error(`authorization receipt input digest ${key} does not match the frozen delivery input`);
  }
  if (!/^[A-Za-z][A-Za-z0-9._/-]{0,127}$/.test(receipt.approver_ref || '') || !/^[A-Za-z0-9][A-Za-z0-9._-]{15,127}$/.test(receipt.nonce || '')) throw new Error('authorization receipt approver or nonce is invalid');
  const authorizedAt = Date.parse(receipt.authorized_at);
  const maxAgeMs = Number(contract?.authorization?.max_age_minutes) * 60 * 1000;
  if (Number.isNaN(authorizedAt) || !Number.isFinite(maxAgeMs) || maxAgeMs < 60_000 || now - authorizedAt > maxAgeMs || authorizedAt > now + 5 * 60 * 1000) throw new Error('authorization receipt is expired or invalid');
  let signature;
  try {
    signature = Buffer.from(receipt.signature, 'base64');
  } catch {
    throw new Error('authorization receipt signature is not base64');
  }
  if (signature.length < 32) throw new Error('authorization receipt signature is invalid');
  const { signature: ignored, ...payload } = receipt;
  if (!crypto.verify(null, Buffer.from(stableJson(payload)), publicKey, signature)) throw new Error('authorization receipt signature verification failed');
  return receipt;
}
