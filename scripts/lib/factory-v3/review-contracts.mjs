import { canonicalHash } from './canonical-json.mjs';

export const REVIEWED_TREE_ALGORITHM = 'sha256-git-tree-inventory-v1';
export const CONTROL_TRANSITION_ALGORITHM = 'sha256-factory-control-transition-v1';
export const CANDIDATE_BINDING_ALGORITHM = 'sha256-reviewed-candidate-v2';

export function reviewedSnapshotDigest(snapshot) {
  return canonicalHash({
    algorithm: snapshot?.algorithm,
    commit_sha: snapshot?.commit_sha,
    git_tree: snapshot?.git_tree,
    file_count: snapshot?.file_count,
    tree_sha256: snapshot?.tree_sha256,
  });
}

export function controlTransitionDigest(transition) {
  return canonicalHash({
    algorithm: transition?.algorithm,
    events_path: transition?.events_path,
    state_path: transition?.state_path,
    base_commit_sha: transition?.base_commit_sha,
    candidate_commit_sha: transition?.candidate_commit_sha,
    base_events_sha256: transition?.base_events_sha256,
    candidate_events_sha256: transition?.candidate_events_sha256,
    base_state_sha256: transition?.base_state_sha256,
    candidate_state_sha256: transition?.candidate_state_sha256,
    base_event_count: transition?.base_event_count,
    candidate_event_count: transition?.candidate_event_count,
    appended_event_ids: transition?.appended_event_ids,
    appended_events_sha256: transition?.appended_events_sha256,
  });
}

export function candidateBindingDigest(binding) {
  return canonicalHash({
    algorithm: binding?.algorithm,
    reviewed_snapshot_sha256: binding?.reviewed_snapshot_sha256,
    candidate_snapshot: binding?.candidate_snapshot,
    corpus_closeout_event_id: binding?.corpus_closeout_event_id,
    corpus_tree_sha256: binding?.corpus_tree_sha256,
    authorized_paths: binding?.authorized_paths,
    control_transition: binding?.control_transition,
  });
}
