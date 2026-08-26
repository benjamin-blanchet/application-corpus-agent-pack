import fs from 'node:fs';
import path from 'node:path';

import { readData } from '../factory-delivery/files.mjs';
import { canonicalHash, canonicalJsonPretty, normalizedFileHash } from './canonical-json.mjs';
import { readEventFile, validateEventChain } from './event-log.mjs';
import {
  findGitRoot,
  observedGitHead,
  validateEvidenceManifest,
  validateReleaseProvenance,
} from './provenance.mjs';
import { reduceFactory, stateMatchesDerived } from './reducer.mjs';
import { validatePlan } from './contract.mjs';

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
  const paths = factoryPaths(packageDir);
  const plan = readJson(paths.plan);
  const events = readEventFile(paths.events);
  const specPath = resolvePackageReference(packageDir, plan.spec_path);
  const environmentPath = plan.environment_contract ? resolvePackageReference(packageDir, plan.environment_contract) : null;
  const repoRoot = findGitRoot(packageDir);
  const baseCurrent = {
    plan_sha256: canonicalHash(plan),
    spec_exists: fs.existsSync(specPath),
    spec_sha256: fs.existsSync(specPath) ? normalizedFileHash(specPath) : null,
    git_head: observedGitHead(repoRoot),
  };
  const event = lastEvidenceEvent(events);
  const evidencePath = event
    ? resolvePackageReference(packageDir, event.data.evidence_manifest_path)
    : paths.evidence;
  const evidence = fs.existsSync(evidencePath) ? readData(evidencePath) : null;
  const preProvenance = reduceFactory({ plan, events, current: baseCurrent, allowInvalidPlan });
  const checked = validateEvidenceForState({
    packageDir,
    plan,
    state: preProvenance,
    event,
    evidence,
    evidencePath,
    environmentPath,
    repoRoot,
  });
  const current = {
    ...baseCurrent,
    evidence_manifest_sha256: evidence ? canonicalHash(evidence) : null,
    provenance_status: checked.findings.length === 0 && event ? 'valid' : event ? 'invalid' : null,
    provenance_reason: checked.findings[0]?.message || null,
  };
  const derived = reduceFactory({ plan, events, current, allowInvalidPlan });
  const snapshot = fs.existsSync(paths.state) ? readJson(paths.state) : null;
  return {
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
}) {
  const findings = [];
  if (!event) return { evidence: evidence ?? null, evidencePath: evidencePath ?? null, findings };

  const resolvedEvidencePath = evidencePath || resolvePackageReference(packageDir, event.data.evidence_manifest_path);
  if (!fs.existsSync(resolvedEvidencePath)) {
    findings.push(finding('factory-evidence-manifest-missing', `evidence manifest is missing: ${event.data.evidence_manifest_path}`));
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
    ? (plan.environment_contract ? resolvePackageReference(packageDir, plan.environment_contract) : null)
    : environmentPath;
  const acceptancePlanFile = manifest?.acceptance?.plan_path
    ? resolvePackageReference(packageDir, manifest.acceptance.plan_path)
    : null;
  const resolvedRepoRoot = repoRoot === undefined ? findGitRoot(packageDir) : repoRoot;

  findings.push(...validateEvidenceManifest(manifest, {
    plan,
    manifestPath: resolvedEvidencePath,
    artifactsRoot: path.dirname(resolvedEvidencePath),
    requireFiles: manifest?.publication?.mode === 'evidence_only_commit',
    acceptancePlanFile,
    environmentContractFile: resolvedEnvironmentPath,
  }));
  if (canonicalHash(manifest) !== event.data.evidence_manifest_sha256) findings.push(finding('factory-evidence-manifest-stale', 'evidence manifest digest does not match the evidence_committed event'));
  if (manifest.run_id !== state.run_id) findings.push(finding('factory-evidence-run-mismatch', 'evidence manifest run_id differs from the event stream'));
  if (manifest?.subject?.head_sha !== state.provenance.candidate_sha) findings.push(finding('factory-evidence-candidate-mismatch', 'evidence manifest subject.head_sha differs from the frozen candidate'));
  if ((manifest?.subject?.tested_sha ?? null) !== state.provenance.tested_sha) findings.push(finding('factory-evidence-tested-mismatch', 'evidence manifest subject.tested_sha differs from acceptance provenance'));
  findings.push(...validateReleaseProvenance({ repoRoot: resolvedRepoRoot, state, manifest }));
  return { evidence: manifest, evidencePath: resolvedEvidencePath, findings: deduplicate(findings) };
}

export function validateFactoryPackageV3(packageDir) {
  const findings = [];
  let loaded;
  try {
    loaded = loadFactoryPackage(packageDir);
  } catch (error) {
    return [{ severity: 'P0', code: error.code || 'factory-v3-load-failed', message: error.message, details: error.details || {} }];
  }
  findings.push(...validatePlan(loaded.plan));
  findings.push(...validateEventChain(loaded.events));
  if (!fs.existsSync(loaded.specPath)) findings.push(finding('factory-specification-missing', `specification file is missing: ${loaded.plan.spec_path}`));
  if (loaded.environmentPath && !fs.existsSync(loaded.environmentPath)) findings.push(finding('factory-environment-contract-missing', `environment contract is missing: ${loaded.plan.environment_contract}`));
  if (!loaded.snapshot) findings.push(finding('factory-state-v3-missing', 'factory/state.v3.json is missing'));
  else if (!stateMatchesDerived(loaded.snapshot, loaded.derived)) findings.push(finding('factory-state-v3-stale', 'factory/state.v3.json does not exactly match the event-derived state'));
  if (loaded.derived.gates.evidence.status === 'valid' && !loaded.evidence) findings.push(finding('factory-evidence-manifest-missing', 'a valid evidence gate requires the event-bound evidence manifest'));
  findings.push(...loaded.provenanceFindings);
  return deduplicate(findings);
}

export function writeDerivedState(stateFile, derived) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, canonicalJsonPretty(derived), { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, stateFile);
}

function readJson(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

export function resolvePackageReference(packageDir, reference) {
  const local = path.resolve(packageDir, reference);
  if (fs.existsSync(local)) return local;
  const repoRoot = findGitRoot(packageDir);
  return repoRoot ? path.resolve(repoRoot, reference) : local;
}

function lastEvidenceEvent(events) {
  return [...events].reverse().find((event) => event.type === 'evidence_committed') || null;
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
