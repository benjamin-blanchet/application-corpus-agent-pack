import { spawnSync } from 'node:child_process';
import { minimalChildEnvironment } from './child-environment.mjs';

import { canonicalHash, canonicalJson, normalizeText, sha256 } from './canonical-json.mjs';
import { controllerCorpusExclusions } from './corpus-attestation.mjs';
import { assertEventChain, parseEventLog, serializeEventLog } from './event-log.mjs';
import { normalizeRepoPath } from './path-claims.mjs';
import { CORPUS_TREE_ALGORITHM, corpusTreeDigest } from './proof-contracts.mjs';
import { reduceFactory, stateMatchesDerived } from './reducer.mjs';
import {
  CANDIDATE_BINDING_ALGORITHM,
  CONTROL_TRANSITION_ALGORITHM,
  REVIEWED_TREE_ALGORITHM,
  candidateBindingDigest,
  controlTransitionDigest,
  reviewedSnapshotDigest,
} from './review-contracts.mjs';

export {
  CANDIDATE_BINDING_ALGORITHM,
  CONTROL_TRANSITION_ALGORITHM,
  REVIEWED_TREE_ALGORITHM,
  candidateBindingDigest,
  controlTransitionDigest,
  reviewedSnapshotDigest,
} from './review-contracts.mjs';

export function captureGitCommitSnapshot({ repoRoot, revision }) {
  const commitSha = resolveExactCommit(repoRoot, revision);
  const gitTree = gitText(repoRoot, ['rev-parse', '--verify', `${commitSha}^{tree}`]);
  const files = committedFileInventory(repoRoot, commitSha);
  const snapshot = {
    algorithm: REVIEWED_TREE_ALGORITHM,
    commit_sha: commitSha,
    git_tree: gitTree,
    file_count: files.length,
    tree_sha256: canonicalHash({ algorithm: REVIEWED_TREE_ALGORITHM, files }),
    snapshot_sha256: null,
  };
  snapshot.snapshot_sha256 = reviewedSnapshotDigest(snapshot);
  return snapshot;
}

export function committedFileObservation({ repoRoot, revision, repoPath }) {
  const commitSha = resolveExactCommit(repoRoot, revision);
  let normalized;
  try {
    normalized = normalizeRepoPath(repoPath);
  } catch (error) {
    fail(error.code || 'factory-path-invalid', error.message);
  }
  const records = gitBuffer(repoRoot, ['ls-tree', '-z', '--full-tree', commitSha, '--', normalized])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (records.length === 0) return { exists: false, kind: null, sha256: null, bytes: null };
  if (records.length !== 1) fail('factory-git-tree-record-invalid', `Git returned ambiguous evidence for ${normalized}`);
  const match = records[0].match(/^([0-7]{6}) ([a-z]+) ([0-9a-f]{40,64})\t([\s\S]+)$/);
  if (!match || match[4] !== normalized) fail('factory-git-tree-record-invalid', `Git returned invalid evidence for ${normalized}`);
  const [, mode, type, objectId] = match;
  if (mode === '120000') fail('factory-git-tree-symlink', `convention evidence cannot be a symbolic link: ${normalized}`);
  if (type !== 'blob') return { exists: true, kind: 'unsupported', sha256: null, bytes: null };
  const bytes = gitBuffer(repoRoot, ['cat-file', 'blob', objectId]);
  return { exists: true, kind: 'file', sha256: sha256(bytes), bytes: bytes.length };
}

export function buildCandidateBinding({ repoRoot, packageRef, reviewedSnapshot, candidateSha, corpusEvent }) {
  if (!reviewedSnapshot || reviewedSnapshotDigest(reviewedSnapshot) !== reviewedSnapshot.snapshot_sha256) {
    fail('factory-reviewed-snapshot-invalid', 'candidate binding requires a valid consolidated-review snapshot');
  }
  if (!corpusEvent || corpusEvent.type !== 'corpus_closed') {
    fail('factory-candidate-corpus-closeout-missing', 'candidate binding requires a corpus_closed event');
  }
  const candidateSnapshot = captureGitCommitSnapshot({ repoRoot, revision: candidateSha });
  if (!isAncestor(repoRoot, reviewedSnapshot.commit_sha, candidateSnapshot.commit_sha)) {
    fail('factory-candidate-not-descendant', 'candidate commit must descend from the consolidated-review commit');
  }
  const authorizedPaths = changedPathsBetween(repoRoot, reviewedSnapshot.commit_sha, candidateSnapshot.commit_sha);
  const exclusions = controllerCorpusExclusions(packageRef);
  const controlPaths = factoryControlPaths(packageRef);
  const allowedControlPaths = new Set([controlPaths.events, controlPaths.state]);
  for (const changedPath of authorizedPaths) {
    if (changedPath !== 'doc' && !changedPath.startsWith('doc/') && !allowedControlPaths.has(changedPath)) {
      fail('factory-candidate-unreviewed-application-change', `candidate contains an unreviewed non-corpus path: ${changedPath}`);
    }
    if (isExcluded(changedPath, exclusions) && !allowedControlPaths.has(changedPath)) {
      fail('factory-candidate-control-artifact-change', `candidate cannot authorize excluded control artifact ${changedPath} through corpus closeout`);
    }
  }
  for (const requiredPath of allowedControlPaths) {
    if (!authorizedPaths.includes(requiredPath)) fail('factory-candidate-control-transition-missing', `candidate must commit the reviewed control transition at ${requiredPath}`);
  }
  const controlTransition = buildControlTransition({
    repoRoot,
    packageRef,
    reviewedSnapshot,
    candidateSnapshot,
    corpusEvent,
  });
  const committedCorpus = captureCommittedCorpusTree({ repoRoot, packageRef, revision: candidateSnapshot.commit_sha });
  const claimedCorpus = {
    root_path: corpusEvent.data?.root_path,
    algorithm: corpusEvent.data?.algorithm,
    exclusions: corpusEvent.data?.exclusions,
    files: corpusEvent.data?.files,
    corpus_tree_sha256: corpusEvent.data?.corpus_tree_sha256,
  };
  if (canonicalJson(committedCorpus) !== canonicalJson(claimedCorpus)) {
    fail('factory-candidate-corpus-tree-mismatch', 'candidate commit corpus bytes differ from the corpus_closed attestation');
  }
  const binding = {
    algorithm: CANDIDATE_BINDING_ALGORITHM,
    reviewed_snapshot_sha256: reviewedSnapshot.snapshot_sha256,
    candidate_snapshot: candidateSnapshot,
    corpus_closeout_event_id: corpusEvent.event_id,
    corpus_tree_sha256: corpusEvent.data.corpus_tree_sha256,
    authorized_paths: authorizedPaths,
    control_transition: controlTransition,
    binding_sha256: null,
  };
  binding.binding_sha256 = candidateBindingDigest(binding);
  return binding;
}

export function buildControlTransition({ repoRoot, packageRef, reviewedSnapshot, candidateSnapshot, corpusEvent }) {
  const paths = factoryControlPaths(packageRef);
  const base = readCommittedControlState({ repoRoot, packageRef, revision: reviewedSnapshot.commit_sha, paths });
  const candidate = readCommittedControlState({ repoRoot, packageRef, revision: candidateSnapshot.commit_sha, paths });

  if (candidate.eventsBytes.length <= base.eventsBytes.length
    || !candidate.eventsBytes.subarray(0, base.eventsBytes.length).equals(base.eventsBytes)) {
    fail('factory-control-log-prefix-mismatch', 'candidate control log must be a byte-for-byte append of the reviewed control log');
  }
  if (candidate.events.length <= base.events.length
    || canonicalJson(candidate.events.slice(0, base.events.length)) !== canonicalJson(base.events)) {
    fail('factory-control-event-prefix-mismatch', 'candidate control events must preserve the complete reviewed event prefix');
  }

  const appended = candidate.events.slice(base.events.length);
  const requiredTypes = ['integration_verified', 'consolidated_reviewed', 'corpus_closed'];
  if (canonicalJson(appended.map((event) => event.type)) !== canonicalJson(requiredTypes)) {
    fail('factory-control-transition-events', `candidate control suffix must be exactly ${requiredTypes.join(' -> ')}`);
  }
  const [integration, review, closeout] = appended;
  if (canonicalJson(integration.data?.reviewed_snapshot) !== canonicalJson(reviewedSnapshot)) {
    fail('factory-control-transition-integration-snapshot', 'integration verification must bind the exact reviewed commit snapshot');
  }
  if (integration.data?.status !== 'passed') {
    fail('factory-control-transition-integration-status', 'control transition requires passing integration verification');
  }
  if (review.data?.verdict !== 'passed'
    || review.data?.fresh_context !== true
    || canonicalJson(review.data?.reviewed_snapshot) !== canonicalJson(reviewedSnapshot)) {
    fail('factory-control-transition-review', 'control transition requires a passing fresh-context consolidated review of the exact integration snapshot');
  }
  if (canonicalJson(closeout) !== canonicalJson(corpusEvent)) {
    fail('factory-control-transition-closeout', 'candidate control suffix must end at the exact supplied corpus closeout event');
  }
  if (candidate.events.at(-1)?.event_id !== corpusEvent.event_id) {
    fail('factory-control-transition-tail', 'candidate committed event log must stop exactly at corpus_closed');
  }
  if (!stateMatchesDerived(base.state, base.derived)) {
    fail('factory-control-base-state-stale', 'reviewed control state is not the exact projection of its committed event prefix');
  }
  if (!stateMatchesDerived(candidate.state, candidate.derived)) {
    fail('factory-control-candidate-state-stale', 'candidate control state is not the exact projection of its committed event log');
  }
  if (candidate.derived.phase !== 'corpus_closed' || candidate.derived.gates?.corpus_closeout?.status !== 'valid') {
    fail('factory-control-candidate-not-corpus-closed', `candidate committed control projection must be corpus_closed, got ${candidate.derived.phase || 'unknown'}`);
  }

  const appendedBytes = candidate.eventsBytes.subarray(base.eventsBytes.length);
  if (!appendedBytes.equals(Buffer.from(serializeEventLog(appended)))) {
    fail('factory-control-transition-serialization', 'candidate control suffix bytes are not the canonical appended event serialization');
  }
  const transition = {
    algorithm: CONTROL_TRANSITION_ALGORITHM,
    events_path: paths.events,
    state_path: paths.state,
    base_commit_sha: reviewedSnapshot.commit_sha,
    candidate_commit_sha: candidateSnapshot.commit_sha,
    base_events_sha256: sha256(base.eventsBytes),
    candidate_events_sha256: sha256(candidate.eventsBytes),
    base_state_sha256: sha256(base.stateBytes),
    candidate_state_sha256: sha256(candidate.stateBytes),
    base_event_count: base.events.length,
    candidate_event_count: candidate.events.length,
    appended_event_ids: appended.map((event) => event.event_id),
    appended_events_sha256: sha256(appendedBytes),
    transition_sha256: null,
  };
  transition.transition_sha256 = controlTransitionDigest(transition);
  return transition;
}

export function captureCommittedCorpusTree({ repoRoot, packageRef, revision }) {
  const commitSha = resolveExactCommit(repoRoot, revision);
  const exclusions = controllerCorpusExclusions(packageRef);
  const files = committedFileInventory(repoRoot, commitSha)
    .filter((entry) => entry.path === 'doc' || entry.path.startsWith('doc/'))
    .filter((entry) => !isExcluded(entry.path, exclusions))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }));
  return {
    root_path: 'doc',
    algorithm: CORPUS_TREE_ALGORITHM,
    exclusions,
    files,
    corpus_tree_sha256: corpusTreeDigest({ root_path: 'doc', exclusions, files }),
  };
}

export function changedPathsBetween(repoRoot, fromRevision, toRevision) {
  const from = resolveExactCommit(repoRoot, fromRevision);
  const to = resolveExactCommit(repoRoot, toRevision);
  if (from === to) return [];
  return gitBuffer(repoRoot, ['diff', '--name-only', '-z', '--no-renames', from, to, '--'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

function factoryControlPaths(packageRef) {
  const root = normalizeRepoPath(packageRef);
  return {
    plan: `${root}/factory/plan.v3.json`,
    events: `${root}/factory/events.v3.jsonl`,
    state: `${root}/factory/state.v3.json`,
  };
}

function readCommittedControlState({ repoRoot, packageRef, revision, paths }) {
  const eventsBytes = committedBlobBytes(repoRoot, revision, paths.events, 'factory event log');
  const stateBytes = committedBlobBytes(repoRoot, revision, paths.state, 'factory state');
  const planBytes = committedBlobBytes(repoRoot, revision, paths.plan, 'factory plan');
  let events;
  let state;
  let plan;
  try {
    events = assertEventChain(parseEventLog(eventsBytes.toString('utf8')));
  } catch (error) {
    fail(error.code || 'factory-control-log-invalid', `invalid committed factory event log at ${revision}: ${error.message}`);
  }
  try {
    state = JSON.parse(normalizeText(stateBytes));
  } catch (error) {
    fail('factory-control-state-json', `invalid committed factory state at ${revision}: ${error.message}`);
  }
  try {
    plan = JSON.parse(normalizeText(planBytes));
  } catch (error) {
    fail('factory-control-plan-json', `invalid committed factory plan at ${revision}: ${error.message}`);
  }
  let specPath;
  try {
    specPath = normalizeRepoPath(`${normalizeRepoPath(packageRef)}/${plan?.spec_path || ''}`);
  } catch (error) {
    fail(error.code || 'factory-control-spec-path', `invalid committed factory specification path at ${revision}: ${error.message}`);
  }
  const packageRoot = `${normalizeRepoPath(packageRef)}/`;
  if (!specPath.startsWith(packageRoot)) fail('factory-control-spec-path', 'factory specification must remain inside its package');
  const specBytes = committedBlobBytes(repoRoot, revision, specPath, 'factory specification');
  let derived;
  try {
    derived = reduceFactory({
      plan,
      events,
      current: {
        plan_sha256: canonicalHash(plan),
        spec_exists: true,
        spec_sha256: sha256(normalizeText(specBytes)),
        evidence_manifest_sha256: null,
        provenance_status: null,
      },
    });
  } catch (error) {
    fail(error.code || 'factory-control-replay-failed', `cannot replay committed factory controls at ${revision}: ${error.message}`);
  }
  return { eventsBytes, stateBytes, events, state, derived };
}

function committedBlobBytes(repoRoot, revision, repoPath, label) {
  const commitSha = resolveExactCommit(repoRoot, revision);
  const normalized = normalizeRepoPath(repoPath);
  const records = gitBuffer(repoRoot, ['ls-tree', '-z', '--full-tree', commitSha, '--', normalized])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (records.length !== 1) fail('factory-control-file-missing', `${label} must be one regular committed file: ${normalized}`);
  const match = records[0].match(/^([0-7]{6}) ([a-z]+) ([0-9a-f]{40,64})\t([\s\S]+)$/);
  if (!match || match[4] !== normalized || match[1] === '120000' || match[2] !== 'blob') {
    fail('factory-control-file-invalid', `${label} must be one non-symlink committed blob: ${normalized}`);
  }
  return gitBuffer(repoRoot, ['cat-file', 'blob', match[3]]);
}

function committedFileInventory(repoRoot, commitSha) {
  const records = gitBuffer(repoRoot, ['ls-tree', '-rz', '--full-tree', '-r', commitSha])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const files = records.map((record) => {
    const match = record.match(/^([0-7]{6}) ([a-z]+) ([0-9a-f]{40,64})\t([\s\S]+)$/);
    if (!match) fail('factory-git-tree-record-invalid', 'Git returned an invalid tree record');
    const [, mode, type, objectId, repoPath] = match;
    if (type !== 'blob') fail('factory-git-tree-node-unsupported', `candidate tree contains unsupported ${type} node ${repoPath}`);
    if (mode === '120000') fail('factory-git-tree-symlink', `candidate tree contains symbolic link ${repoPath}`);
    const bytes = gitBuffer(repoRoot, ['cat-file', 'blob', objectId]);
    return { path: repoPath, mode, sha256: sha256(bytes) };
  });
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return files;
}

function resolveExactCommit(repoRoot, revision) {
  if (typeof revision !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(revision)) {
    fail('factory-git-review-revision', 'review attestation requires a full Git commit id');
  }
  const resolved = gitText(repoRoot, ['rev-parse', '--verify', `${revision}^{commit}`]);
  if (resolved !== revision) fail('factory-git-review-revision-mismatch', 'Git resolved a different commit than the attested full revision');
  return resolved;
}

function isAncestor(repoRoot, ancestor, descendant) {
  const result = spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', ancestor, descendant], { encoding: null, stdio: 'pipe', env: minimalChildEnvironment() });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  fail('factory-git-review-failed', `git merge-base failed: ${String(result.stderr || result.stdout || '').trim()}`);
}

function gitText(repoRoot, args) {
  return gitBuffer(repoRoot, args).toString('utf8').trim();
}

function gitBuffer(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: null, stdio: 'pipe', env: minimalChildEnvironment() });
  if (result.status !== 0) fail('factory-git-review-failed', `git ${args[0]} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function isExcluded(candidate, exclusions) {
  return exclusions.some((excluded) => candidate === excluded || candidate.startsWith(`${excluded}/`));
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
