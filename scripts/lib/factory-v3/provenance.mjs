import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalHash, fileHash, sha256 } from './canonical-json.mjs';
import { normalizeRepoPath, pathAllowedByPatterns } from './path-claims.mjs';

const OUTCOMES = new Set(['passed', 'failed', 'blocked', 'skipped', 'waived']);
const SUMMARY_KEYS = ['passed', 'failed', 'blocked', 'skipped', 'waived'];
const SHA256 = /^[0-9a-f]{64}$/;
const TYPED_SHA256 = /^sha256:[0-9a-f]{64}$/;

export function validateEvidenceSha(value) {
  return typeof value === 'string' && /^([0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

export function validateAcceptanceProvenance({ candidate_sha, tested_sha, waived = false, reason, approved_by, approved_at }) {
  const findings = [];
  if (!validateEvidenceSha(candidate_sha)) findings.push(finding('factory-candidate-sha-required', 'a full candidate_sha is mandatory for every release'));
  if (waived) {
    if (tested_sha !== null && tested_sha !== undefined) findings.push(finding('factory-waiver-with-tested-sha', 'a waived acceptance must not pretend a tested SHA exists'));
    if (!reason || !String(reason).trim()) findings.push(finding('factory-waiver-reason', 'acceptance waiver requires a reason'));
    if (!approved_by || !String(approved_by).trim()) findings.push(finding('factory-waiver-approver', 'acceptance waiver requires an approver'));
    if (!approved_at || Number.isNaN(Date.parse(approved_at))) findings.push(finding('factory-waiver-timestamp', 'acceptance waiver requires an ISO approval timestamp'));
  } else {
    if (!validateEvidenceSha(tested_sha)) findings.push(finding('factory-tested-sha-required', 'applicable acceptance requires a full tested_sha'));
    else if (candidate_sha !== tested_sha) findings.push(finding('factory-tested-sha-mismatch', 'tested_sha must equal candidate_sha'));
  }
  return findings;
}

export function validateEvidenceManifest(manifest, {
  plan = null,
  manifestPath = null,
  artifactsRoot = null,
  requireFiles = false,
  acceptancePlanFile = null,
  environmentContractFile = null,
} = {}) {
  const findings = [];
  if (!isObject(manifest)) return [finding('factory-evidence-manifest-shape', 'Delivery evidence manifest must be an object')];
  requireKeys(manifest, ['schema_version', 'run_id', 'generated_at', 'spec_package', 'subject', 'environment', 'toolchain', 'acceptance', 'publication', 'criteria_waivers', 'cases', 'mutations', 'artifacts', 'summary', 'verdict', 'generation_findings'], 'evidence', findings);
  if (manifest.schema_version !== 1) findings.push(finding('factory-evidence-manifest-version', 'Delivery evidence schema_version must be 1'));
  if (typeof manifest.run_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(manifest.run_id)) findings.push(finding('factory-evidence-run-id', 'evidence manifest requires a valid run_id'));
  if (!manifest.generated_at || Number.isNaN(Date.parse(manifest.generated_at))) findings.push(finding('factory-evidence-generated-at', 'generated_at must be an ISO timestamp'));
  safePath(manifest.spec_package, 'spec_package', findings);

  const subject = isObject(manifest.subject) ? manifest.subject : {};
  requireKeys(subject, ['head_sha', 'tested_sha', 'source_tree_digest'], 'evidence.subject', findings);
  if (!validateEvidenceSha(subject.head_sha)) findings.push(finding('factory-evidence-head-sha', 'subject.head_sha must be a full Git SHA'));
  if (!TYPED_SHA256.test(subject.source_tree_digest || '')) findings.push(finding('factory-evidence-source-tree-digest', 'subject.source_tree_digest must be sha256:<64 hex>'));
  if (subject.base_sha && !validateEvidenceSha(subject.base_sha)) findings.push(finding('factory-evidence-base-sha', 'subject.base_sha must be a full Git SHA'));

  const waived = subject.tested_sha === null;
  findings.push(...validateAcceptanceProvenance({
    candidate_sha: subject.head_sha,
    tested_sha: subject.tested_sha,
    waived,
    reason: manifest.waiver?.reason,
    approved_by: manifest.waiver?.approved_by,
    approved_at: manifest.waiver?.approved_at,
  }));
  if (!waived && manifest.waiver !== undefined) findings.push(finding('factory-evidence-unexpected-waiver', 'tested evidence must not carry a waiver'));
  if (waived && manifest.verdict !== 'waived') findings.push(finding('factory-evidence-waiver-verdict', 'waived evidence must use verdict waived'));

  const environment = isObject(manifest.environment) ? manifest.environment : {};
  requireKeys(environment, ['profile', 'contract_digest', 'instance_id', 'deployed_revision', 'build_or_image', 'schema_version', 'dataset_id', 'dataset_version', 'auth_actor_type'], 'evidence.environment', findings);
  for (const key of ['profile', 'instance_id', 'build_or_image', 'schema_version', 'dataset_id', 'dataset_version', 'auth_actor_type']) {
    if (isPlaceholder(environment[key])) findings.push(finding('factory-evidence-environment-field', `environment.${key} must be observed and non-placeholder`));
  }
  if (!TYPED_SHA256.test(environment.contract_digest || '')) findings.push(finding('factory-evidence-environment-digest', 'environment.contract_digest must be sha256:<64 hex>'));
  if (!waived && environment.deployed_revision !== subject.tested_sha) findings.push(finding('factory-evidence-deployed-revision', 'environment.deployed_revision must equal subject.tested_sha'));
  if (waived && environment.deployed_revision !== null) findings.push(finding('factory-evidence-waiver-deployed-revision', 'waived evidence must not claim a deployed tested revision'));

  const toolchain = isObject(manifest.toolchain) ? manifest.toolchain : {};
  requireKeys(toolchain, ['adapter', 'adapter_version', 'browser', 'browser_version'], 'evidence.toolchain', findings);
  for (const key of ['adapter', 'adapter_version', 'browser', 'browser_version']) {
    if (isPlaceholder(toolchain[key]) || toolchain[key] === 'not_applicable') findings.push(finding('factory-evidence-toolchain-field', `toolchain.${key} must be observed and non-placeholder`));
  }

  const acceptance = isObject(manifest.acceptance) ? manifest.acceptance : {};
  requireKeys(acceptance, ['plan_path', 'plan_digest'], 'evidence.acceptance', findings);
  safePath(acceptance.plan_path, 'acceptance.plan_path', findings);
  if (!TYPED_SHA256.test(acceptance.plan_digest || '')) findings.push(finding('factory-evidence-acceptance-digest', 'acceptance.plan_digest must be sha256:<64 hex>'));
  if (acceptancePlanFile) verifyReferencedDigest(acceptancePlanFile, acceptance.plan_digest, 'factory-evidence-acceptance-plan', findings);
  if (environmentContractFile) verifyReferencedDigest(environmentContractFile, environment.contract_digest, 'factory-evidence-environment-contract', findings);

  const publication = isObject(manifest.publication) ? manifest.publication : {};
  requireKeys(publication, ['mode'], 'evidence.publication', findings);
  if (!['ci_artifact', 'evidence_only_commit'].includes(publication.mode)) findings.push(finding('factory-evidence-publication-mode', `unsupported publication mode ${String(publication.mode)}`));
  if (publication.mode === 'evidence_only_commit') {
    if (!validateEvidenceSha(subject.evidence_commit_sha)) findings.push(finding('factory-evidence-sha-required', 'evidence_only_commit requires subject.evidence_commit_sha'));
    for (const key of ['ci_run_id', 'artifact_id', 'artifact_url', 'retention_days', 'bundle_digest']) {
      if (Object.hasOwn(publication, key)) findings.push(finding('factory-evidence-publication-conflict', `evidence_only_commit must not carry CI field ${key}`));
    }
  } else if (subject.evidence_commit_sha !== undefined) {
    findings.push(finding('factory-ci-artifact-false-sha', 'ci_artifact evidence must not claim evidence_commit_sha'));
  }
  if (publication.mode === 'ci_artifact') validateCiPublication(publication, manifest.artifacts, findings);

  const criterionWaivers = Array.isArray(manifest.criteria_waivers) ? manifest.criteria_waivers : [];
  if (!Array.isArray(manifest.criteria_waivers)) findings.push(finding('factory-evidence-criterion-waivers-shape', 'criteria_waivers must be an array'));
  const criterionWaiverIds = new Set();
  for (const waiver of criterionWaivers) {
    if (!isObject(waiver) || typeof waiver.criterion_id !== 'string' || !waiver.criterion_id) {
      findings.push(finding('factory-evidence-criterion-waiver-shape', 'each criterion waiver requires criterion_id'));
      continue;
    }
    if (criterionWaiverIds.has(waiver.criterion_id)) findings.push(finding('factory-evidence-criterion-waiver-duplicate', `duplicate criterion waiver ${waiver.criterion_id}`));
    criterionWaiverIds.add(waiver.criterion_id);
    validateDeliveryWaiver(waiver, `criterion ${waiver.criterion_id}`, findings);
  }

  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
  if (!Array.isArray(manifest.cases) || (!waived && cases.length === 0 && criterionWaivers.length === 0)) findings.push(finding('factory-evidence-cases-empty', 'tested evidence requires at least one case or approved criterion waiver'));
  const caseIds = new Set();
  const recomputed = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, 0]));
  for (const testCase of cases) validateCase(testCase, caseIds, recomputed, findings);
  if (plan) {
    for (const criterion of plan.acceptance_criteria || []) {
      if (criterionWaiverIds.has(criterion.id)) continue;
      for (const proof of criterion.proved_by || []) if (!caseIds.has(proof)) findings.push(finding('factory-evidence-case-missing', `${criterion.id}: evidence is missing planned case ${proof}`));
    }
    const plannedCriteria = new Set((plan.acceptance_criteria || []).map((criterion) => criterion.id));
    for (const criterionId of criterionWaiverIds) if (!plannedCriteria.has(criterionId)) findings.push(finding('factory-evidence-criterion-waiver-unplanned', `waiver references unplanned criterion ${criterionId}`));
  }

  const mutations = Array.isArray(manifest.mutations) ? manifest.mutations : [];
  if (!Array.isArray(manifest.mutations)) findings.push(finding('factory-evidence-mutations-shape', 'mutations must be an array'));
  for (const mutation of mutations) {
    if (!isObject(mutation) || typeof mutation.id !== 'string') findings.push(finding('factory-evidence-mutation-shape', 'each mutation requires an id'));
    if (!['applied', 'not_applied', 'failed'].includes(mutation?.outcome)) findings.push(finding('factory-evidence-mutation-outcome', `${mutation?.id || '<unknown>'}: invalid mutation outcome`));
    if (!['passed', 'failed', 'pending', 'not_required'].includes(mutation?.cleanup)) findings.push(finding('factory-evidence-cleanup-outcome', `${mutation?.id || '<unknown>'}: invalid cleanup outcome`));
    if (['failed', 'pending'].includes(mutation?.cleanup)) findings.push(finding('factory-evidence-cleanup-pending', `${mutation.id}: cleanup is ${mutation.cleanup}`));
  }

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  if (!Array.isArray(manifest.artifacts)) findings.push(finding('factory-evidence-artifacts-shape', 'artifacts must be an array'));
  const artifactIds = new Set();
  for (const artifact of artifacts) validateArtifact(artifact, artifactIds, { manifestPath, artifactsRoot, requireFiles }, findings);
  for (const testCase of cases) for (const evidenceId of testCase?.evidence_ids || []) if (!artifactIds.has(evidenceId)) findings.push(finding('factory-evidence-artifact-missing', `${testCase.id}: missing artifact ${evidenceId}`));

  const summary = isObject(manifest.summary) ? manifest.summary : {};
  requireKeys(summary, SUMMARY_KEYS, 'evidence.summary', findings);
  for (const key of SUMMARY_KEYS) if (summary[key] !== recomputed[key]) findings.push(finding('factory-evidence-summary-mismatch', `summary.${key} is ${String(summary[key])}; expected ${recomputed[key]}`));
  if (!Array.isArray(manifest.generation_findings)) findings.push(finding('factory-evidence-generation-findings', 'generation_findings must be an array'));
  else if (manifest.generation_findings.length) findings.push(finding('factory-evidence-generation-blocked', 'generation_findings must be empty before evidence can close the gate'));

  if (!['ready', 'blocked', 'waived'].includes(manifest.verdict)) findings.push(finding('factory-evidence-verdict', `unsupported evidence verdict ${String(manifest.verdict)}`));
  if (!waived) {
    if (manifest.verdict !== 'ready') findings.push(finding('factory-evidence-not-ready', `tested evidence verdict is ${String(manifest.verdict)}`));
    for (const testCase of cases) if (!['passed', 'waived'].includes(testCase?.outcome)) findings.push(finding('factory-evidence-case-not-pass', `${testCase?.id || '<unknown>'}: outcome ${String(testCase?.outcome)} blocks readiness`));
  }
  return findings;
}

export function validateReleaseProvenance({ repoRoot, state, manifest }) {
  const findings = [];
  if (!repoRoot) return [finding('factory-git-repository-missing', 'release provenance requires a Git repository')];
  const candidate = state?.provenance?.candidate_sha;
  const tested = state?.provenance?.tested_sha;
  const publication = state?.provenance?.publication;
  const waived = state?.gates?.acceptance?.status === 'waived';
  findings.push(...validateAcceptanceProvenance({
    candidate_sha: candidate,
    tested_sha: tested,
    waived,
    reason: manifest?.waiver?.reason,
    approved_by: manifest?.waiver?.approved_by,
    approved_at: manifest?.waiver?.approved_at,
  }));
  const resolvedCandidate = resolveCommit(repoRoot, candidate, findings, 'candidate');
  const resolvedTested = tested ? resolveCommit(repoRoot, tested, findings, 'tested') : null;
  if (resolvedCandidate && manifest?.subject?.head_sha !== resolvedCandidate) findings.push(finding('factory-evidence-candidate-mismatch', 'manifest subject.head_sha differs from the frozen candidate'));
  if ((manifest?.subject?.tested_sha ?? null) !== resolvedTested) findings.push(finding('factory-evidence-tested-mismatch', 'manifest subject.tested_sha differs from acceptance provenance'));
  if (resolvedCandidate && resolvedTested && resolvedCandidate !== resolvedTested) findings.push(finding('factory-tested-sha-mismatch', 'tested SHA differs from candidate SHA'));

  if (resolvedCandidate) {
    const excluded = safeNormalizedPath(manifest?.spec_package, 'factory-evidence-spec-package', findings);
    const expectedTree = sourceTreeDigest(repoRoot, resolvedCandidate, excluded ? [`${excluded}/acceptance/runs`] : [], findings);
    if (expectedTree && manifest?.subject?.source_tree_digest !== expectedTree) findings.push(finding('factory-evidence-source-tree-mismatch', `manifest source tree digest differs from ${expectedTree}`));
  }
  if (!publication || publication.mode !== manifest?.publication?.mode) findings.push(finding('factory-evidence-publication-mismatch', 'event publication mode differs from the manifest'));

  let expectedHead = resolvedCandidate;
  if (publication?.mode === 'ci_artifact') {
    if (state.provenance.evidence_sha !== null || manifest?.subject?.evidence_commit_sha !== undefined) findings.push(finding('factory-ci-artifact-false-sha', 'ci_artifact mode must not carry an evidence Git SHA'));
    if (!publication.artifact_locator || !TYPED_SHA256.test(publication.artifact_digest || '') || !publication.media_type) findings.push(finding('factory-ci-artifact-envelope', 'ci_artifact requires locator, digest and media type'));
    if (publication.artifact_locator && publication.artifact_locator !== manifest?.publication?.artifact_url) findings.push(finding('factory-ci-artifact-locator-mismatch', 'event artifact locator differs from manifest publication.artifact_url'));
    if (publication.artifact_digest && publication.artifact_digest !== manifest?.publication?.bundle_digest) findings.push(finding('factory-ci-artifact-digest-mismatch', 'event artifact digest differs from manifest publication.bundle_digest'));
  } else if (publication?.mode === 'evidence_only_commit') {
    const evidenceSha = resolveCommit(repoRoot, state.provenance.evidence_sha, findings, 'evidence');
    if (evidenceSha && manifest?.subject?.evidence_commit_sha !== evidenceSha) findings.push(finding('factory-evidence-sha-mismatch', 'manifest evidence_commit_sha differs from the event'));
    if (resolvedCandidate && evidenceSha) {
      expectedHead = evidenceSha;
      if (!gitOk(repoRoot, ['merge-base', '--is-ancestor', resolvedCandidate, evidenceSha])) findings.push(finding('factory-evidence-not-descendant', 'evidence commit must descend from candidate'));
      const manifestPath = publication.manifest_path;
      const specPackage = safeNormalizedPath(manifest?.spec_package, 'factory-evidence-spec-package', findings);
      const normalizedManifestPath = safeNormalizedPath(manifestPath, 'factory-evidence-manifest-path', findings);
      if (specPackage && normalizedManifestPath) {
        const allowed = [
          { kind: 'prefix', path: `${specPackage}/acceptance/runs` },
          { kind: 'exact', path: normalizedManifestPath },
        ];
        findings.push(...validateEvidenceDeltaPaths(gitLines(repoRoot, ['diff', '--name-only', `${resolvedCandidate}..${evidenceSha}`]), allowed));
      }
    }
  }
  const head = currentGitHead(repoRoot, findings);
  if (expectedHead && head && head !== expectedHead) findings.push(finding('factory-candidate-head-moved', `current HEAD ${head} differs from release provenance ${expectedHead}`));
  return findings;
}

export function evidenceManifestHash(manifest) {
  return canonicalHash(manifest);
}

export function validateEvidenceDeltaPaths(paths, allowedClaims) {
  return (paths || []).filter((candidate) => !pathAllowedByPatterns(candidate, allowedClaims)).map((candidate) => finding('factory-evidence-protected-path', `evidence commit changes protected path ${candidate}`));
}

export function verifyGitProvenance({ repoRoot, candidateSha, testedSha, evidenceSha, finalizationSha, evidenceClaims, controlClaims, waiver = {} }) {
  const findings = validateAcceptanceProvenance({ candidate_sha: candidateSha, tested_sha: testedSha, waived: testedSha === null, ...waiver });
  if (!validateEvidenceSha(evidenceSha)) findings.push(finding('factory-evidence-sha-required', 'a full evidence SHA is required'));
  if (!validateEvidenceSha(finalizationSha)) findings.push(finding('factory-finalization-sha-required', 'a full finalization SHA is required'));
  for (const [kind, gitSha] of [['candidate', candidateSha], ['evidence', evidenceSha], ['finalization', finalizationSha]]) resolveCommit(repoRoot, gitSha, findings, kind);
  if (findings.length) return findings;
  if (!gitOk(repoRoot, ['merge-base', '--is-ancestor', candidateSha, evidenceSha])) findings.push(finding('factory-evidence-not-descendant', 'evidence_sha must descend from candidate_sha'));
  if (!gitOk(repoRoot, ['merge-base', '--is-ancestor', evidenceSha, finalizationSha])) findings.push(finding('factory-finalization-not-descendant', 'finalization SHA must descend from evidence_sha'));
  findings.push(...validateEvidenceDeltaPaths(gitLines(repoRoot, ['diff', '--name-only', `${candidateSha}..${evidenceSha}`]), evidenceClaims));
  findings.push(...validateEvidenceDeltaPaths(gitLines(repoRoot, ['diff', '--name-only', `${evidenceSha}..${finalizationSha}`]), controlClaims));
  return findings;
}

export function findGitRoot(start) {
  let cursor = path.resolve(start);
  while (path.dirname(cursor) !== cursor) {
    if (fs.existsSync(path.join(cursor, '.git'))) return cursor;
    cursor = path.dirname(cursor);
  }
  return null;
}

export function observedGitHead(repoRoot) {
  if (!repoRoot) return null;
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
  const value = result.status === 0 ? result.stdout.trim().toLowerCase() : null;
  return validateEvidenceSha(value) ? value : null;
}

export function observedSourceTreeDigest(repoRoot, revision, excludedPrefixes = []) {
  const findings = [];
  const digest = sourceTreeDigest(repoRoot, revision, excludedPrefixes, findings);
  return { digest, findings };
}

function validateCase(testCase, ids, recomputed, findings) {
  if (!isObject(testCase) || typeof testCase.id !== 'string' || !testCase.id) {
    findings.push(finding('factory-evidence-case-shape', 'each case requires an id'));
    return;
  }
  if (ids.has(testCase.id)) findings.push(finding('factory-evidence-case-duplicate', `duplicate case ${testCase.id}`));
  ids.add(testCase.id);
  if (!Array.isArray(testCase.criteria) || testCase.criteria.length === 0) findings.push(finding('factory-evidence-case-criteria', `${testCase.id}: criteria must not be empty`));
  if (!OUTCOMES.has(testCase.outcome)) findings.push(finding('factory-evidence-case-outcome', `${testCase.id}: invalid outcome ${String(testCase.outcome)}`));
  else recomputed[testCase.outcome] += 1;
  if (!Number.isInteger(testCase.attempts) || testCase.attempts < 1) findings.push(finding('factory-evidence-case-attempts', `${testCase.id}: attempts must be positive`));
  if (testCase.outcome === 'waived') validateDeliveryWaiver(testCase.waiver, `case ${testCase.id}`, findings);
  if (testCase.outcome === 'passed' && testCase.attempts > 1) findings.push(finding('factory-evidence-flaky-pass', `${testCase.id}: retry-only success cannot pass`));
  if (!Array.isArray(testCase.oracle_results) || (testCase.outcome === 'passed' && testCase.oracle_results.length === 0)) findings.push(finding('factory-evidence-oracles', `${testCase.id}: passing case requires oracle results`));
  for (const oracle of testCase.oracle_results || []) if (!isObject(oracle) || typeof oracle.id !== 'string' || !OUTCOMES.has(oracle.outcome) || (testCase.outcome === 'passed' && oracle.outcome !== 'passed')) findings.push(finding('factory-evidence-oracle-outcome', `${testCase.id}.${oracle?.id || '<unknown>'}: invalid or non-passing oracle`));
  if (!Array.isArray(testCase.evidence_ids)) findings.push(finding('factory-evidence-case-artifacts', `${testCase.id}: evidence_ids must be an array`));
  if (!Array.isArray(testCase.evidence_bindings)) findings.push(finding('factory-evidence-case-bindings', `${testCase.id}: evidence_bindings must be an array`));
  if (testCase.outcome === 'passed' && (testCase.user_visible_error === true || testCase.reason)) findings.push(finding('factory-evidence-false-pass', `${testCase.id}: a visible error or blocking reason cannot pass`));
}

function validateArtifact(artifact, ids, { manifestPath, artifactsRoot, requireFiles }, findings) {
  if (!isObject(artifact) || typeof artifact.id !== 'string' || !artifact.id) {
    findings.push(finding('factory-evidence-artifact-shape', 'each artifact requires an id'));
    return;
  }
  if (ids.has(artifact.id)) findings.push(finding('factory-evidence-artifact-duplicate', `duplicate artifact ${artifact.id}`));
  ids.add(artifact.id);
  safePath(artifact.path, `${artifact.id}.path`, findings);
  if (!TYPED_SHA256.test(artifact.sha256 || '')) findings.push(finding('factory-evidence-artifact-hash', `${artifact.id}: sha256 must be typed`));
  if (!Number.isInteger(artifact.bytes) || artifact.bytes < 0) findings.push(finding('factory-evidence-artifact-size', `${artifact.id}: bytes must be a non-negative integer`));
  if (typeof artifact.media_type !== 'string' || !artifact.media_type) findings.push(finding('factory-evidence-artifact-media-type', `${artifact.id}: media_type is required`));
  if (!requireFiles || !artifact.path) return;
  const root = path.resolve(artifactsRoot || (manifestPath ? path.dirname(manifestPath) : '.'));
  const absolute = path.resolve(root, artifact.path);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) findings.push(finding('factory-evidence-path-escape', `${artifact.id}: artifact escapes its root`));
  else if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) findings.push(finding('factory-evidence-file-missing', `${artifact.id}: evidence file is missing`));
  else if (`sha256:${fileHash(absolute)}` !== artifact.sha256) findings.push(finding('factory-evidence-file-changed', `${artifact.id}: checksum does not match`));
}

function validateCiPublication(publication, artifacts, findings) {
  requireKeys(publication, ['ci_run_id', 'artifact_id', 'artifact_url', 'retention_days', 'bundle_digest'], 'evidence.publication', findings);
  if (isPlaceholder(publication.ci_run_id) || isPlaceholder(publication.artifact_id)) findings.push(finding('factory-ci-artifact-provenance', 'CI run and artifact identifiers must be non-placeholder'));
  try {
    const url = new URL(publication.artifact_url);
    if (url.protocol !== 'https:') throw new Error('not HTTPS');
  } catch {
    findings.push(finding('factory-ci-artifact-url', 'publication.artifact_url must be an HTTPS URL'));
  }
  if (!Number.isInteger(publication.retention_days) || publication.retention_days < 1) findings.push(finding('factory-ci-artifact-retention', 'publication.retention_days must be a positive integer'));
  if (!TYPED_SHA256.test(publication.bundle_digest || '')) findings.push(finding('factory-ci-artifact-bundle-digest', 'publication.bundle_digest must be sha256:<64 hex>'));
  else {
    const expected = `sha256:${canonicalHash(Array.isArray(artifacts) ? artifacts : [])}`;
    if (publication.bundle_digest !== expected) findings.push(finding('factory-ci-artifact-bundle-mismatch', 'publication.bundle_digest does not match the artifact inventory'));
  }
}

function validateDeliveryWaiver(waiver, scope, findings) {
  if (!isObject(waiver)) {
    findings.push(finding('factory-evidence-waiver-shape', `${scope} waiver must be an object`));
    return;
  }
  if (typeof waiver.reason !== 'string' || !waiver.reason.trim()) findings.push(finding('factory-evidence-waiver-reason', `${scope} waiver requires a reason`));
  if (typeof waiver.approver_ref !== 'string' || !waiver.approver_ref.trim()) findings.push(finding('factory-evidence-waiver-approver', `${scope} waiver requires approver_ref`));
  if (!waiver.approved_at || Number.isNaN(Date.parse(waiver.approved_at))) findings.push(finding('factory-evidence-waiver-timestamp', `${scope} waiver requires an ISO approval timestamp`));
}

function sourceTreeDigest(repoRoot, revision, excludedPrefixes, findings) {
  const lines = gitLines(repoRoot, ['ls-tree', '-r', '--full-tree', revision]);
  if (!lines.length && !gitOk(repoRoot, ['cat-file', '-e', `${revision}^{tree}`])) {
    findings.push(finding('factory-git-tree-unresolvable', `cannot resolve tree for ${revision}`));
    return null;
  }
  const prefixes = excludedPrefixes.filter(Boolean).map((item) => normalizeRepoPath(item));
  const retained = lines.filter((line) => {
    const tab = line.indexOf('\t');
    const file = tab === -1 ? '' : line.slice(tab + 1);
    return !prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
  });
  return `sha256:${sha256(retained.sort().join('\n'))}`;
}

function resolveCommit(repoRoot, revision, findings, kind) {
  if (!validateEvidenceSha(revision)) {
    findings.push(finding(`factory-${kind}-sha-required`, `${kind} requires a full Git SHA`));
    return null;
  }
  const result = spawnSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
  const resolved = result.status === 0 ? result.stdout.trim().toLowerCase() : null;
  if (!validateEvidenceSha(resolved)) {
    findings.push(finding('factory-git-sha-unresolvable', `Git commit is not resolvable: ${revision}`));
    return null;
  }
  return resolved;
}

function currentGitHead(repoRoot, findings) {
  const head = observedGitHead(repoRoot);
  if (!head) findings.push(finding('factory-git-head-unresolvable', 'current Git HEAD is not resolvable'));
  return head;
}

function verifyReferencedDigest(file, expected, code, findings) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) findings.push(finding(`${code}-missing`, `referenced file is missing: ${file}`));
  else if (`sha256:${fileHash(file)}` !== expected) findings.push(finding(`${code}-changed`, `referenced file digest differs: ${file}`));
}

function safePath(value, name, findings) {
  try { normalizeRepoPath(value); } catch (error) { findings.push(finding(error.code || 'factory-path-invalid', `${name}: ${error.message}`)); }
}

function safeNormalizedPath(value, code, findings) {
  try {
    return normalizeRepoPath(value);
  } catch (error) {
    findings.push(finding(code, error.message));
    return null;
  }
}

function isPlaceholder(value) {
  return typeof value !== 'string' || !value.trim() || /^(unknown|placeholder|todo|tbd|<.*>)$/i.test(value.trim());
}

function requireKeys(value, keys, scope, findings) {
  if (!isObject(value)) {
    findings.push(finding('factory-evidence-shape', `${scope} must be an object`));
    return;
  }
  for (const key of keys) if (!Object.hasOwn(value, key) || value[key] === undefined || value[key] === '') findings.push(finding('factory-evidence-required-field', `${scope}.${key} is required`));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function gitOk(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).status === 0;
}

function gitLines(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function finding(code, message) {
  return { severity: 'P0', code, message };
}
