# Procedure — multi-repo workspace and external peer corpora

Loaded by `modes/corpus-kickstart` when multi-repo workspace or external
peer corpora are involved.

## Multi-repo workspace detection (Step 2 bis of kickstart)

Run `foundations/multi-repo-workspace-detection`. This must execute
**before** repository role is set (Step 3), because role is itself a
multi-repo concept (primary vs library vs secondary vs sibling-app vs
standalone).

The skill detects whether the repo is part of a multi-repo workspace,
interviews the operator if so (never silently assumes from filesystem
proximity), **and always asks (Q5) whether external peer corpora hosted in
remote Git repositories should be readable** (even on a standalone repo —
e.g. one service reading a peer service's corpus for cross-application analysis).

It writes `application.multi_repo` in `doc/_meta/app-profile.yaml` plus
mirror fields in `doc/_meta/corpus-state.yaml`:

- `multi_repo_status`
- `multi_repo_role`
- `adjacent_repos_count`
- `external_peers_count`
- `consumed_by_count`
- `last_multi_repo_interview`

## Outcomes

- `standalone` — proceed to Step 3 as a single-repo kickstart.
- `monorepo` — proceed to Step 3 as a single-repo kickstart (a monorepo is one repo, not multi-repo).
- `declared` — proceed to Step 3, but the role from the interview wins over generic role detection. Downstream passes must apply the role-based scope from `foundations/multi-repo-workspace-detection § Kickstart scope per role`.
- `unsure` — do not start P1. Ask the targeted follow-up the skill recorded in `doc/_meta/blocking-questions.md` and wait.

Step 2 bis is **skippable on re-run** only when `corpus.multi_repo_status`
is already `standalone`, `monorepo` or `declared` **and** none of the
re-interview triggers in `foundations/multi-repo-workspace-detection` apply.

## External peer corpora (session-start reads)

When `application.multi_repo.status == declared` and `read_sibling_corpus: true`,
**or** when any `adjacent_repos[i].source.type == git` peer is declared and
`read_external_corpus: true`, also read the index of each declared peer's
corpus at the start of a session.

Peers are resolved through `foundations/multi-repo-workspace-detection § Source resolver` —
never read `source.path` or `source.cache_path` directly:

- For each `adjacent_repos[i]` with `has_pack: true`:
  - `source.type: path` → read `<source.path>/<corpus_path>/README.md` and `<source.path>/<corpus_path>/_roadmap/ROADMAP_STATE.md` directly.
  - `source.type: git` → resolve first (clone-if-missing per `refresh_policy`), then read `<cache_path>/<corpus_path>/README.md` and `<cache_path>/<corpus_path>/_roadmap/ROADMAP_STATE.md`. On clone/pull failure, do NOT skip silently — surface it and continue without that peer.
- For each `consumed_by[i]` with `has_pack: true`: same resolution.

External git peers are pulled lazily. Default `refresh_policy: on-demand`
means the agent ensures the peer is available only when a run actually
needs to read it; the session-start read above triggers the first
resolution for `each-session` peers.

These are read-only inputs treated as code-derived secondary source. They
never override the current repo's own corpus.

## Sibling sync (continuous and kickstart)

When `application.multi_repo.status == declared` or any peer is declared:

- If the run touched a node that has a `cross_repo:` edge to a peer declared in `adjacent_repos` or `consumed_by`, the end-of-run summary must include a `Sibling sync recommendation` line per affected peer.
- Behavior follows `application.multi_repo.sync_policy`:
  - `manual` — list affected peers only; the operator runs peer sessions themselves.
  - `agent-suggested` (default) — list affected peers with the suggested run prompt for each; do not open peer sessions.
  - `agent-driven` — open peer sessions through the configured driver tool; if no driver tool is connected, downgrade to `agent-suggested` and say so. For `source.type: git` peers, `agent-driven` is **not supported** by default — always downgrade to `agent-suggested` and say so.
- For `source.type: git` peers, also note in the recap whether the cache was pulled during the run (`last_external_peer_pull` timestamp) and surface staleness when relevant.
- Update `corpus.last_adjacent_sync_check` in `corpus-state.yaml` at the end of any run that performed or recommended a peer sync. Update `corpus.last_external_peer_pull` when a `type: git` peer was actually pulled.
