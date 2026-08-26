import fs from 'node:fs';
import path from 'node:path';

import {
  SHA_PATTERN,
  asArray,
  canonicalizeCaseOutcome,
  duplicateIds,
  finding,
  resolveContainedRegularFile,
  sha256File,
  sha256Object,
} from './core.mjs';
import { scanEvidenceFile, redactRuntimeValue } from './minimize.mjs';
import { repositoryRelative, sourceTreeDigest } from './provenance.mjs';
import { hasValidWaiver, validateAcceptancePlan, validateAcceptanceResults, validateEnvironmentObservation, validateEvidence } from './validation.mjs';

function mediaType(file) {
  const extension = path.extname(file).toLowerCase();
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.zip': 'application/zip',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.json': 'application/json',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
  })[extension] || 'application/octet-stream';
}

function normalizeOutcome(result) {
  const attempts = Math.max(1, Number(result?.attempts) || 1);
  return canonicalizeCaseOutcome(result?.outcome, attempts);
}

function artifactInput(value, caseId, index) {
  if (typeof value === 'string') return { id: `${caseId}-evidence-${index + 1}`, path: value };
  return { id: value?.id || `${caseId}-evidence-${index + 1}`, path: value?.path, media_type: value?.media_type };
}

export function assembleEvidence({
  plan,
  environment,
  observation,
  results,
  artifactsRoot,
  repository = process.cwd(),
  subjectSha,
  baseSha = null,
  sourceDigest = null,
  specPackage = null,
  environmentContractPath = null,
  acceptancePlanPath = null,
  publication = null,
  supportingArtifacts = [],
}) {
  const generationFindings = validateAcceptancePlan(plan, { root: repository, checkFiles: false });
  if (!SHA_PATTERN.test(subjectSha || '')) generationFindings.push(finding('evidence-sha-invalid', 'subjectSha must be a full 40-hex SHA'));
  const provenanceWaiver = plan?.subject?.provenance_waiver || null;
  const environmentDigest = environmentContractPath && fs.existsSync(environmentContractPath)
    ? sha256File(environmentContractPath)
    : sha256Object(environment);
  const planDigest = acceptancePlanPath && fs.existsSync(acceptancePlanPath)
    ? sha256File(acceptancePlanPath)
    : sha256Object(plan);
  generationFindings.push(...validateEnvironmentObservation(observation, { provenanceWaiver, environment }));
  generationFindings.push(...validateAcceptanceResults(results, {
    subjectSha,
    observationRunId: observation?.run_id,
    planDigest,
    environmentDigest,
    plan,
    provenanceWaiver,
  }));
  if (observation?.environment_contract_digest !== environmentDigest) generationFindings.push(finding('evidence-environment-digest-mismatch', 'observation was not produced from the supplied environment contract'));
  const environmentProfile = asArray(environment?.profiles).find((profile) => profile.id === plan?.environment_profile);
  if (!environmentProfile) generationFindings.push(finding('acceptance-environment-unknown', `acceptance profile ${plan?.environment_profile} is not declared`));
  if (observation?.profile !== plan?.environment_profile) generationFindings.push(finding('evidence-environment-profile-mismatch', `observation profile ${observation?.profile} differs from planned profile ${plan?.environment_profile}`));
  for (const duplicate of duplicateIds(results?.cases)) generationFindings.push(finding('evidence-case-duplicate', `duplicate execution result ${duplicate}`));
  const planCases = new Map(asArray(plan?.cases).map((testCase) => [testCase.id, testCase]));
  const resultCases = new Map(asArray(results?.cases).map((testCase) => [testCase.id, testCase]));
  const artifactRecords = new Map();
  const cases = [];

  for (const [id, planned] of planCases) {
    const result = resultCases.get(id);
    if (!result) {
      cases.push({ id, criteria: asArray(planned.criteria), outcome: 'blocked', attempts: 0, oracle_results: [], evidence_ids: [] });
      generationFindings.push(finding('evidence-case-missing', `${id} has no execution result`));
      continue;
    }
    const normalized = normalizeOutcome(result);
    const outcome = normalized.outcome;
    if (normalized.reason === 'flaky_retry') generationFindings.push(finding('acceptance-flaky-blocking', `${id} passed only after retry and is recorded as failed`));
    if (normalized.reason === 'invalid_adapter_outcome') generationFindings.push(finding('evidence-outcome-invalid', `${id} returned unsupported adapter outcome ${JSON.stringify(result?.outcome)}`));
    const oracleResults = asArray(result.oracle_results).map((oracle) => ({
      ...oracle,
      outcome: canonicalizeCaseOutcome(oracle?.outcome).outcome,
    }));
    if (outcome === 'passed' && oracleResults.length === 0) generationFindings.push(finding('evidence-oracle-result-missing', `${id} has no recorded oracle result`));
    const evidenceIds = [];
    for (const [index, raw] of asArray(result.evidence).entries()) {
      const input = artifactInput(raw, id, index);
      if (!input.path) {
        generationFindings.push(finding('evidence-artifact-missing', `${input.id} has no path`));
        continue;
      }
      const candidate = path.resolve(artifactsRoot, input.path);
      let resolved;
      try {
        resolved = resolveContainedRegularFile(artifactsRoot, candidate);
      } catch (error) {
        generationFindings.push(finding('evidence-artifact-path-invalid', error.message));
        continue;
      }
      const { absolute, relative } = resolved;
      if (artifactRecords.has(input.id)) {
        generationFindings.push(finding('evidence-artifact-duplicate', `artifact id ${input.id} is not globally unique`, relative));
        continue;
      }
      const minimization = scanEvidenceFile(absolute, relative);
      for (const issue of minimization) generationFindings.push(finding(issue.code, issue.message, relative));
      const stat = fs.statSync(absolute);
      artifactRecords.set(input.id, {
        id: input.id,
        path: relative,
        media_type: input.media_type || mediaType(relative),
        sha256: sha256File(absolute),
        bytes: stat.size,
      });
      evidenceIds.push(input.id);
    }
    const requiredEvidence = asArray(planned?.evidence?.required);
    const resultBindings = new Map(asArray(result.evidence).map((raw, index) => {
      const input = artifactInput(raw, id, index);
      return [raw?.requirement_id || raw?.id, { requirement_id: raw?.requirement_id, artifact_id: input.id, type: raw?.type, checkpoint: raw?.checkpoint }];
    }));
    const evidenceBindings = [];
    for (const requirement of requiredEvidence) {
      const binding = resultBindings.get(requirement.id);
      if (!binding || !evidenceIds.includes(binding.artifact_id)) generationFindings.push(finding('evidence-artifact-missing', `${id} has no artifact for ${requirement.id}`));
      else {
        if (binding.type !== requirement.type || binding.checkpoint !== requirement.checkpoint) generationFindings.push(finding('evidence-artifact-type-mismatch', `${id}.${requirement.id} has the wrong type or checkpoint`));
        evidenceBindings.push(binding);
      }
    }
    cases.push({
      id,
      criteria: asArray(planned.criteria),
      outcome,
      ...(normalized.reason ? { reason: normalized.reason } : {}),
      attempts: Math.max(1, Number(result.attempts) || 1),
      oracle_results: oracleResults,
      evidence_ids: evidenceIds,
      evidence_bindings: evidenceBindings,
      ...(result?.waiver ? { waiver: result.waiver } : {}),
    });
  }

  const resultMutations = new Map(asArray(results?.mutations).map((mutation) => [mutation.id, mutation]));
  const mutations = asArray(plan?.mutations).map((planned) => {
    const actual = resultMutations.get(planned.id);
    if (!actual) {
      if (planned.cleanup_required === true) generationFindings.push(finding('acceptance-cleanup-pending', `${planned.id} has no cleanup result`));
      return { id: planned.id, outcome: 'not_applied', cleanup: planned.cleanup_required ? 'pending' : 'not_required' };
    }
    return {
      id: planned.id,
      outcome: actual.outcome || 'failed',
      cleanup: actual.cleanup || (planned.cleanup_required ? 'pending' : 'not_required'),
    };
  });

  const recordedPaths = new Set([...artifactRecords.values()].map((artifact) => artifact.path));
  for (const [index, supporting] of asArray(supportingArtifacts).entries()) {
    try {
      const resolved = resolveContainedRegularFile(artifactsRoot, path.resolve(supporting));
      if (recordedPaths.has(resolved.relative)) continue;
      const minimization = scanEvidenceFile(resolved.absolute, resolved.relative);
      for (const issue of minimization) generationFindings.push(finding(issue.code, issue.message, resolved.relative));
      const id = `support-${index + 1}-${path.basename(resolved.relative).replace(/[^A-Za-z0-9._-]/g, '-')}`;
      artifactRecords.set(id, {
        id,
        path: resolved.relative,
        media_type: mediaType(resolved.relative),
        sha256: sha256File(resolved.absolute),
        bytes: fs.statSync(resolved.absolute).size,
      });
      recordedPaths.add(resolved.relative);
    } catch (error) {
      generationFindings.push(finding('evidence-supporting-artifact-invalid', error.message));
    }
  }

  const summary = { passed: 0, failed: 0, blocked: 0, skipped: 0, waived: 0 };
  for (const testCase of cases) summary[testCase.outcome] += 1;
  const criteriaWaivers = asArray(plan?.criteria)
    .filter((criterion) => criterion?.waiver)
    .map((criterion) => ({ criterion_id: criterion.id, ...criterion.waiver }));
  const treeDigest = sourceDigest || (SHA_PATTERN.test(subjectSha || '') ? sourceTreeDigest(repository, subjectSha, {
    excludedPrefixes: specPackage ? [`${specPackage}/acceptance/runs`] : [],
  }) : 'sha256:invalid');
  const manifest = {
    schema_version: 1,
    run_id: redactRuntimeValue(results?.run_id || observation?.run_id || `run-${Date.now()}`),
    generated_at: new Date().toISOString(),
    spec_package: specPackage || path.dirname(plan?.spec_ref || 'doc/spec/unknown'),
    subject: {
      head_sha: String(subjectSha || '').toLowerCase(),
      ...(baseSha ? { base_sha: String(baseSha).toLowerCase() } : {}),
      ...(publication?.mode === 'evidence_only_commit' && publication?.evidence_commit_sha ? { evidence_commit_sha: String(publication.evidence_commit_sha).toLowerCase() } : {}),
      tested_sha: String(subjectSha || '').toLowerCase(),
      source_tree_digest: treeDigest,
    },
    environment: {
      profile: observation?.profile,
      contract_digest: environmentDigest,
      instance_id: redactRuntimeValue(observation?.instance_id || 'unknown'),
      deployed_revision: String(observation?.deployed_revision || '').toLowerCase(),
      build_or_image: redactRuntimeValue(observation?.build_or_image || 'unknown'),
      schema_version: redactRuntimeValue(observation?.schema_version_value || 'unknown'),
      dataset_id: redactRuntimeValue(observation?.dataset_id || 'unknown'),
      dataset_version: redactRuntimeValue(observation?.dataset_version || 'unknown'),
      auth_actor_type: observation?.auth_actor_type || 'unknown',
    },
    toolchain: {
      adapter: results?.toolchain?.adapter || plan?.campaign?.adapter || 'unknown',
      adapter_version: redactRuntimeValue(results?.toolchain?.adapter_version || 'unknown'),
      browser: redactRuntimeValue(results?.toolchain?.browser || 'not_applicable'),
      browser_version: redactRuntimeValue(results?.toolchain?.browser_version || 'not_applicable'),
    },
    acceptance: {
      plan_path: acceptancePlanPath
        ? repositoryRelative(repository, acceptancePlanPath)
        : `${specPackage || path.dirname(plan?.spec_ref || 'doc/spec/unknown')}/acceptance-plan.yaml`,
      plan_digest: planDigest,
    },
    publication: publication || { mode: 'ci_artifact' },
    criteria_waivers: criteriaWaivers,
    cases,
    mutations,
    artifacts: [...artifactRecords.values()].sort((a, b) => a.id.localeCompare(b.id)),
    summary,
    verdict: 'blocked',
    generation_findings: [],
    ...(provenanceWaiver ? { provenance_waiver: provenanceWaiver } : {}),
  };
  if (manifest.publication.mode === 'ci_artifact' && !manifest.publication.bundle_digest) manifest.publication.bundle_digest = sha256Object(manifest.artifacts);
  const validationFindings = validateEvidence(manifest, plan, { artifactsRoot, verifyArtifacts: true });
  const allFindings = [...generationFindings, ...validationFindings];
  manifest.generation_findings = [...new Map(allFindings.map((item) => [`${item.code}:${item.message}`, { code: item.code, message: item.message }])).values()];
  if (allFindings.length === 0
    && (cases.length > 0 || criteriaWaivers.length > 0)
    && cases.every((item) => item.outcome === 'passed' || (item.outcome === 'waived' && hasValidWaiver(item.waiver)))
    && criteriaWaivers.every(hasValidWaiver)) manifest.verdict = 'ready';
  return { manifest, findings: allFindings };
}

export function evidenceSummary(manifest) {
  const summary = manifest?.summary || {};
  return `passed=${summary.passed || 0} failed=${summary.failed || 0} blocked=${summary.blocked || 0} skipped=${summary.skipped || 0} waived=${summary.waived || 0}`;
}
