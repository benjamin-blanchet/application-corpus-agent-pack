---
name: peer-corpus-access
category: sources
description: "Retrieve and read another application's corpus (a declared peer/linked corpus) via local workspace, sparse git clone, or GitHub MCP, with SHA-gated freshness and a uniform read handle. Use when a skill must read, search, or walk a peer corpus. Read-only."
references:
  - procedure-refresh.md
---
# Peer Corpus Access

## Purpose

One skill the `Corpus` agent **delegates the retrieval of a remote corpus to**.
It reads the corpus of another application in the ecosystem — a peer/linked
corpus declared in `app-profile.yaml` (`adjacent_repos` / `consumed_by`) — and
guarantees the agent consumes an **up-to-date** copy.

It owns three things end to end:

1. **Retrieval** — bring the peer's corpus within reach (a local sparse clone
   of `doc/`, or GitHub MCP read tools — no full-repo clone, no app source).
2. **Freshness** — at session start, reconcile the cache with the peer's
   current `ref` via a **SHA-gated incremental diff**: if nothing changed,
   it's a near-free no-op; if it changed, fetch only the delta. Never a blind
   re-clone, never silently stale.
3. **Access** — expose a uniform handle (targeted file reads, or a local
   directory for tree-walking passes) so every downstream skill reads a peer
   the same way regardless of transport.

This skill **accesses** peers. Declaring them and capturing consent is
`foundations/multi-repo-workspace-detection` (interview + `app-profile.yaml`).

## When to use

- Any time a skill needs to read a file, walk a tree, or search inside a
  declared peer corpus (cross-application analysis, cross-repo graph edges,
  reconciling a claim against a peer's `doc/`).
- The operator says: `read app-B's corpus`, `lis le corpus de l'app B`,
  `cross-application analysis`, `pull/refresh the linked corpus`,
  `via github mcp read the other corpus`.
- **At the start of every session that will consume a peer** — to run the
  freshness diff before reading (§ Retrieval & freshness).
- Before creating or verifying any cross-repo edge in `doc/_graph/edges.yaml`.

Do **not** use this skill to *declare* a peer or change consent — that is
`foundations/multi-repo-workspace-detection`.

## Mandatory first reads

1. `doc/_meta/app-profile.yaml` — peer declarations, `access`, `source`,
   consent flags.
2. `doc/_meta/corpus-state.yaml` — `multi_repo_status`, peer counts, last sync.
3. `doc/mcp/github.md` — GitHub MCP tool catalog and verified per-team
   conventions (owner/org, default branch, path quirks).
4. `doc/_meta/information-sources.yaml` and `doc/_meta/source-coverage.yaml` — durable GitHub transport policy and historical evidence.

If `corpus.multi_repo_status` is `not_started`, stop and route to
`foundations/multi-repo-workspace-detection`. There is nothing to access yet.

## Consent gate (before any retrieval)

Never retrieve a peer the operator did not consent to.

| Flag (`app-profile.yaml` → `multi_repo`) | Gate |
|---|---|
| `read_sibling_corpus: true` | required for a `source.type: path` peer's `doc/`. |
| `read_external_corpus: true` | required for a `source.type: git` peer's `doc/` (clone **or** MCP). |

Consent is about *the peer*, not the transport: git-clone and GitHub-MCP access
of the same `type: git` peer share the single `read_external_corpus` flag. If
the flag is missing, surface it and route to declaration — do not read.

## Access-method detection (the graceful chain)

For `access: auto` (default), choose the method top-down; first that works wins.
The order reflects cost and freshness once `surface` is sparse-scoped:

| Order | Method | Use when | Freshness |
|---|---|---|---|
| 1 | `workspace` | `source.type == path` and the path exists. | Operator owns the checkout. |
| 2 | `git-sparse` | `source.type == git`, git + network available, clone permitted. **Default for git peers** — local dir, cheap incremental refresh, supports breadth and repeated reads. | SHA-gated diff (§ Retrieval & freshness). |
| 3 | `github-mcp` | git clone impossible/forbidden, **or** a single cheap one-off lookup where setting up a cache isn't worth it. A runtime probe must report this transport `usable`. | SHA-gated diff over changed files only. |
| — | unreachable | none of the above. | Record in `doc/_meta/blocking-questions.md`; mark dependent findings partial. |

The choice interacts with the read strategy (§ Read strategies):

- **Breadth** (walk the tree) → prefer `git-sparse` (a sparse clone of `doc/`
  is cheaper than MCP file-by-file hydration and gives a real `localDir`). Use
  MCP hydration only when git is unavailable.
- **A single targeted file** → `github-mcp` `get_file_contents` is fine even
  when a git cache could exist, to avoid creating/refreshing a cache for one
  read.

Rules: honor an explicit `access` pin; **fall back loudly** (never silently);
**never silently skip** an unreachable declared peer.

## Declared preference (optional)

A peer may pin the method via its `access` field:

| `access` | Meaning |
|---|---|
| absent / `auto` | Walk the chain top-down (default). |
| `workspace` | Local path only; missing → blocking question (do not clone). |
| `git-sparse` / `clone` | Force the sparse-clone cache even if GitHub MCP is connected (policy forbids MCP file reads of that org). |
| `github-mcp` | Prefer GitHub MCP; fall back to git-sparse only if MCP unavailable **and** clone is allowed. |

`access` is captured in the declaration interview, never invented here.

## Retrieval and freshness

Load `procedure-refresh.md` before the first read required by the declared
refresh policy. It owns sparse-Git/MCP delta refresh, state updates and the
explicit stale-cache fallback.

## Uniform access handle (the contract)

Whatever method resolves, downstream skills see the same capabilities — the
invariant that keeps the rest of the pack transport-agnostic:

| Capability | `workspace` / `git-sparse` | `github-mcp` (not hydrated) |
|---|---|---|
| `localDir` — directory holding the peer's `corpus_path` | the resolved local path | `null` until the surface is hydrated (§ Strategy B) |
| `read(subpath)` — one file's text | filesystem read | `get_file_contents` (owner, repo, `<corpus_path>/<subpath>`, ref) |
| `list(subpath)` — directory entries | filesystem listing | MCP directory listing |
| `search(query)` — find inside the peer | local grep | `search_code` scoped `repo:<owner>/<repo> path:<corpus_path>` |

Tree-walking passes require `localDir` (sparse clone, or MCP hydration as a
fallback). Targeted lookups use `read`/`search` directly.

## Read strategies (both supported)

### Strategy A — targeted read (cheap, default for lookups)

A specific file or a small search — the common cross-application case ("does
app-B's `doc/_indexes/by-api.md` list the endpoint we call?").

- `workspace`/`git-sparse`: read the file from `localDir`.
- `github-mcp`: `get_file_contents` for the exact path, or a bounded
  `search_code`. Do not hydrate the tree for a single lookup.

### Strategy B — surface materialization (breadth, for pipeline passes)

A pass that walks the peer's tree (cross-repo feature/API extraction, an audit
resolving many evidence paths) needs `localDir`.

- `git-sparse`: the sparse clone of `surface` **is** the materialized tree —
  refreshed by the diff above. This is the preferred breadth path.
- `github-mcp` (only when git is unavailable): hydrate `surface` into
  `.corpus-cache/<name>/` — one MCP call per file. Scope to the surface (or a
  narrower sub-path); never the whole repo. Subsequent sessions refresh by the
  SHA-gated MCP diff, not a full re-hydration.

## GitHub MCP access details

- **Read-only tools only**: `get_file_contents`, directory listing,
  `search_code`, `list_commits`/compare (for diffs), `list_branches` /
  `get_repository` (ref + default branch). Never write tools (create/update
  file, PR, issue, merge, comment). Catalog + verified quirks in
  `doc/mcp/github.md`.
- **Coordinates** from the peer's `source`: `owner`/`repo` (parse from
  `source.url` if absent), `ref` (resolve via `get_repository` if unset — don't
  assume `main`), path `<corpus_path>/<subpath>`.
- **Auth is the operator's environment.** The MCP carries its own token. Never
  read, store, or echo it. `permission_denied` / `not_visible` from
  `sources/runtime-source-probe` means MCP is unusable in this run — fall to
  git-sparse only when that transport is declared and allowed.

## Announcement

Before reading a peer, state peer, method, freshness, and strategy:

```text
Peer corpus access
- Peer: app-b (peer_application)
- Method: git-sparse  [fallback used: none]
- Freshness: refreshed @ main — 3 files changed since 2026-05-30 (sha a1b2c3 → d4e5f6)
- Strategy: targeted read of doc/_indexes/by-api.md
- Consent: read_external_corpus = true
```

## Cache convention

- Cached peers live under `.corpus-cache/<peer-name>/` at this repo's root.
- `.corpus-cache/` must be in `.gitignore` — per-developer, never committed.
- **Sparse + shallow + partial** by default: only `surface` (e.g. `doc/`) is
  materialized, never the app source. Commands above.
- MCP-hydrated peers reuse the same `.corpus-cache/<peer>/` dir so a later
  session with git available can pull on top transparently.
- A stale cache is preferable to a broken session — surface staleness, don't
  block.

## Durable updates

After accessing a peer in a run, update:

- `doc/_meta/corpus-state.yaml` — `last_adjacent_sync_check`; for any pulled or
  MCP-refreshed git peer, `last_external_peer_pull`.
- `doc/_meta/app-profile.yaml` — the peer's `source.cache_path`,
  `last_synced_sha`, `last_synced_at` after a successful sync. Leave `access`
  as declared.
- `doc/mcp/github.md` — per `sources/mcp-data-reading § Post-session
  capitalization`: verified owner/org, default branch, path quirks,
  `search_code`/compare limits discovered while reading the peer.
- `doc/_meta/source-coverage.yaml` — historical peer-source evidence and freshness after a successful read.
- `doc/_meta/blocking-questions.md` — any peer that ended `unreachable` or
  could not be refreshed repeatedly.

## Safety stance

- **Read-only on every peer, every transport.** Never write a file, open a PR,
  push a branch, or mutate a peer repo. The cache is read-only local state.
- **Never store secrets.** No tokens, SSH keys, or credentials in
  `app-profile.yaml` or anywhere in `doc/`. Auth is the operator's environment.
- Bound MCP reads: named files / small `search_code` for Strategy A;
  surface-scoped hydration or delta-only fetches for Strategy B. Never an
  unbounded org-wide sweep.
- Use `governance/safe-operation-guardrails` before any clone, fetch, or shell
  step.
- A peer corpus is a **secondary, code-derived source** (when `has_pack:
  true`): it enriches and contextualizes; it never overrides this app's own
  evidence under `foundations/core-rules § Source authority depends on the claim`.

## Anti-patterns

- Reading a peer without going through this skill's chain (method choice,
  consent gate, freshness, status recording get skipped).
- **Re-cloning a peer every session** instead of a SHA-gated diff, or
  **reading a cache without a freshness decision** — both violate "consume an
  up-to-date corpus".
- Full clone of a peer when only `doc/` is needed — use sparse checkout of
  `surface`.
- Hydrating an entire tree via MCP to answer a single-file question (Strategy
  A), or re-hydrating the whole surface when a SHA diff would fetch a few files.
- Silently cloning when `access: workspace` was pinned and the path is missing.
- Silently falling back to repository-only work when a declared peer is
  unreachable, or silently reading a stale cache.
- Treating GitHub MCP as a write path. Read-only, always.
- Re-declaring a peer or editing consent here — that is
  `foundations/multi-repo-workspace-detection`.
- Calling `main` the default branch without resolving it; hardcoding org/owner
  instead of parsing `source.url` / `source.owner`.
