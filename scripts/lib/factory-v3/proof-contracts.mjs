import { canonicalHash, normalizedFileHash } from './canonical-json.mjs';

export const ENVELOPE_HASH_ALGORITHM = 'sha256-canonical-json-v1';
export const NORMALIZED_TEXT_HASH_ALGORITHM = 'sha256-normalized-text-v1';
export const FILE_ARTIFACT_HASH_ALGORITHM = 'sha256-file-bytes-v1';
export const TREE_ARTIFACT_HASH_ALGORITHM = 'sha256-tree-inventory-v1';
export const WORKSPACE_SNAPSHOT_ALGORITHM = 'sha256-git-dirty-snapshot-v1';
export const WORKSPACE_DELTA_ALGORITHM = 'sha256-git-workspace-delta-v1';
export const CORPUS_TREE_ALGORITHM = 'sha256-corpus-tree-v1';
export const CORPUS_VALIDATION_ALGORITHM = 'sha256-corpus-validator-result-v1';

export function preimplementationConventionDigest(contract) {
  return canonicalHash({
    algorithm: contract?.algorithm,
    source_revision: contract?.source_revision,
    observed_conventions: contract?.observed_conventions,
  });
}

export function lotResultDigest(result) {
  return canonicalHash({
    algorithm: result.algorithm,
    base_revision: result.base_revision,
    changed_paths: result.changed_paths,
    files: normalizeChangeInventory(result.files),
    workspace_delta: result.workspace_delta,
    outputs: result.outputs,
    verification: result.verification,
    preimplementation_contract_sha256: result.preimplementation_contract_sha256,
    observed_conventions: result.observed_conventions,
    refactor_assessment: result.refactor_assessment,
    blockers: result.blockers,
  });
}

export function normalizeChangeInventory(files) {
  return (files || []).map((file) => file?.status === 'deleted'
    ? { path: file.path, status: 'deleted', sha256: null }
    : { path: file?.path, status: file?.status, sha256: file?.sha256 });
}

export function changeInventoryDigest(files) {
  return canonicalHash(normalizeChangeInventory(files));
}

export function workspaceSnapshotDigest(snapshot) {
  return canonicalHash({
    v: snapshot?.v,
    algorithm: snapshot?.algorithm,
    workspace_id: snapshot?.workspace_id,
    workspace_mode: snapshot?.workspace_mode,
    attestation_mode: snapshot?.attestation_mode,
    base_revision: snapshot?.base_revision,
    exclusions: snapshot?.exclusions,
    entries: snapshot?.entries,
  });
}

export function treeArtifactDigest(inventory) {
  const files = [...(inventory || [])]
    .map((entry) => ({ relative_path: entry?.relative_path, sha256: entry?.sha256 }))
    .sort((left, right) => left.relative_path < right.relative_path ? -1 : left.relative_path > right.relative_path ? 1 : 0);
  return canonicalHash({ algorithm: TREE_ARTIFACT_HASH_ALGORITHM, files });
}

export function integrationVerificationDigest(data) {
  return canonicalHash({
    algorithm: data.algorithm,
    verifications: data.verifications,
    reviewed_snapshot: data.reviewed_snapshot,
  });
}

export function reviewFindingDigest(finding) {
  return canonicalHash({
    id: finding?.id,
    severity: finding?.severity,
    rule: finding?.rule,
    location: finding?.location,
    evidence: finding?.evidence,
    impact: finding?.impact,
    status: finding?.status,
  });
}

export function corpusTreeDigest({ root_path, exclusions, files }) {
  return canonicalHash({
    algorithm: CORPUS_TREE_ALGORITHM,
    root_path,
    exclusions,
    files,
  });
}

export function corpusManifestDigest(file) {
  return normalizedFileHash(file);
}
