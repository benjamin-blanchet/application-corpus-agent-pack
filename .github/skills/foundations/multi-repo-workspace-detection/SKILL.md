---
name: multi-repo-workspace-detection
category: foundations
description: "Detect whether the current repository is part of a multi-repo workspace (e.g. `front` + `lib` + `deploy` opened together in VS Code) **or has a useful peer corpus hosted in a remote Git repository** (e.g. Service-B's corpus consumed by Service-A for cross-application analysis), intervie…"
---
# Multi-Repo Workspace Detection

## Purpose

Detect whether the current repository is part of a multi-repo workspace (e.g. `front` + `lib` + `deploy` opened together in VS Code) **or has a useful peer corpus hosted in a remote Git repository** (e.g. Service-B's corpus consumed by Service-A for cross-application analysis), interview the operator to capture the architecture, and persist it in `app-profile.yaml` and `corpus-state.yaml`. The kickstart and continuous runs use that captured architecture to scope work per repo role, link cross-repo nodes in the graph, and avoid silent desynchronization between sibling corpora.

This skill replaces the manual "edit `app-profile.yaml` by hand" workflow with an agent-led interview, so the operator does not have to know the pack's internal schema.

Local sibling folders in the workspace and remote Git corpora are handled **uniformly**: every peer carries a `source:` block (`type: path` or `type: git`); downstream skills only see a resolved local directory. Migrating a peer from "workspace sibling" to "remote git" (or vice versa) is a two-line change in the map.

## When to use

Use this skill:

- **Once, at the very start of a kickstart**, before `Step 3 — Detect repository role` of the Corpus agent. It is a precondition for role detection because role is a multi-repo concept.
- When the operator says: `multi-repo`, `setup workspace`, `add sibling repo`, `mon front utilise lib`, `j'ai plusieurs repos ouverts`, `il y a un autre corpus sur git`, `add external corpus`, `link a peer corpus`.
- Whenever `corpus.multi_repo_status == not_started` and the agent is about to start kickstart.
- When a new sibling repo appears in the workspace after the initial interview (re-run to refresh).
- When the operator wants to register or change a **remote git peer corpus** (URL added/removed/moved).
- Before any cross-repo edge is created in `doc/_graph/edges.yaml`.

## Mandatory reads

1. `doc/_meta/app-profile.yaml` (current state, may be empty)
2. `doc/_meta/corpus-state.yaml` (current state)
3. The current repository's git remote (`git remote -v`) and root path
4. If present: parent directory listing (`ls ..`) to find sibling git repos
5. If present: any `*.code-workspace` file at the parent level

## Detection protocol

Run signals in this order. Stop early if the first ones already give a confident answer; otherwise combine them.

### Signal 1 — Monorepo vs multi-repo disambiguation (do this FIRST)

A monorepo is **not** a multi-repo workspace. Confirm the current repo is not a monorepo before treating it as multi-repo:

- Check `package.json` for a `workspaces:` key.
- Check for `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`.
- Check for a single `.git` at the repo root with multiple application folders inside.

If the repo is a monorepo, set `application.multi_repo.status: monorepo` and stop. The corpus stays single. Do not run the interview.

### Signal 2 — Filesystem probe for sibling repos

From the current repo root, list the parent directory and look for sibling folders that each contain a `.git/` directory:

```bash
ls -la ..
for d in ../*/ ; do [ -d "$d/.git" ] && echo "sibling repo: $d" ; done
```

Record candidate siblings (names + paths). Do **not** assume they are related to the current app — siblings can be unrelated.

### Signal 3 — VS Code workspace file

Look for `*.code-workspace` at the parent level. If present, parse it and list the `folders[].path` entries. These are explicitly part of the same workspace and are strong candidates.

### Signal 4 — Code imports and references

Search the current repo for relative imports or path references that cross out (`../lib`, `../deploy`, `file:../lib` in `package.json`, `path: ../deploy` in compose/k8s files, etc.). A hit confirms a sibling is consumed.

### Signal 5 — Repository name patterns

If git remote URLs share a prefix or the local folder name pattern matches (`acme-front`, `acme-lib`, `acme-deploy`), flag them as likely related. This is a weak signal — always confirm via interview.

### Signal 6 — External corpus references (not in workspace)

Filesystem signals only catch peers physically present in the workspace. Many useful peer corpora live in **remote Git repositories** that the operator has access to but has not cloned next to this repo (e.g. Service-A reading Service-B's corpus to investigate a cross-application incident). Detection cannot infer these; the interview must ask explicitly. See § Interview protocol, question 5.

## Interview protocol

After detection, run the interview through `governance/blocking-question-loop`. Ask **only** what detection did not already answer with high confidence. Never proceed past this skill silently with unanswered multi-repo questions.

Open with a single yes/no:

```text
Multi-repo detection
- This repository: <name> at <path>
- Sibling repos found in the workspace: <list, or "none">
- Code references to siblings: <list, or "none">

Is this repository part of a multi-repo application split across several Git repositories? (yes/no/unsure)
```

If `no` or `standalone`: write `application.multi_repo.status: standalone`, set `corpus.multi_repo_status: standalone`, exit. Kickstart proceeds normally.

If `yes`, ask in order:

1. **Role of this repository** (one answer required):
   - `primary` — the application entry point (front-end, main service)
   - `library` — shared code consumed by primary(ies)
   - `secondary` — infra/deploy/tooling repo consumed by primary(ies)
   - `sibling-app` — peer application that shares some siblings
2. **For each candidate sibling** detected by Signal 2/3, ask:
   - Is `<sibling>` part of this application's setup? (yes/no/unsure)
   - If yes: its role (primary/library/secondary/sibling-app)
   - Its relative path from the current repo
   - What this repo consumes from it (free text — e.g. `api, types, business-rules` for a lib; `ci-cd, runtime-topology` for deploy)
   - Does it already have a copy of this pack installed? (yes/no/planned)
   - If yes, the relative path to its `doc/` directory (default: `<relative_path>/doc`)
3. **Operator consent** (one yes/no):
   - Is the agent allowed to read sibling repos' source code as a secondary source of truth during kickstart and continuous runs? (yes/no)
   - Is the agent allowed to read sibling repos' `doc/` corpora as code-derived secondary input? (yes/no)
4. **Sync policy** (one choice):
   - `manual` — operator runs sibling sessions themselves
   - `agent-suggested` — agent reminds the operator at end of run when a sibling needs an update (default)
   - `agent-driven` — agent opens sibling sessions automatically when an MCP/IDE-level tool allows it (only if such a tool is connected; otherwise downgrade to `agent-suggested`)
5. **External corpora hosted in remote Git repositories** (ask every time, even when `standalone` or `monorepo`; remote peers are independent of multi-repo status):

   For a **large ecosystem**, do not enumerate every peer by hand — point the
   operator to `sources/ecosystem-corpus-discovery`, which scans the org via the
   GitHub MCP, maintains the `doc/_meta/ecosystem-map.yaml` registry, and lets
   them **promote** discovered peers into the declarations below. The questions
   here remain the way to declare a specific known peer.

   Open with one yes/no:

   ```text
   External peer corpora
   - Beyond what is in your workspace, are there other repositories (hosted on GitHub/GitLab/Bitbucket/internal Git) whose corpus this agent should be able to read?
   - Common cases: a peer application (Service-A ↔ Service-B), a shared platform/library corpus, a parent business-domain corpus, a corpus from a team you depend on.
   (yes/no)
   ```

   If `no`: skip and continue. If `yes`, loop over each declared peer and capture:

   - **Name** — short slug, used as cache directory name (`app-b`, `platform-kafka`, …)
   - **Git URL** — clone URL the operator can reach (`git@github.com:org/app-b-corpus.git` or `https://…`). Do not test credentials silently; just record.
   - **Ref** — branch/tag/commit (default `main`).
   - **Access method** — how the agent should reach this peer (default `auto`):
     `auto` (let `sources/peer-corpus-access` walk workspace → cache →
     github-mcp → clone), `github-mcp` (prefer the GitHub MCP read tools, no
     clone), `clone` (force clone even if the MCP is connected), or `workspace`
     (local path only). For `github-mcp` on a GitHub/GHE repo, record the
     `owner`/`org` and `repo` (parse them from the URL if obvious) so the MCP
     calls do not have to guess. The actual access is performed by
     `sources/peer-corpus-access`, not here.
   - **Relation** — one of: `upstream_event_source`, `downstream_consumer`, `shared_infrastructure_doc`, `peer_application`, `parent_domain`, `other` (free text follows for `other`).
   - **Surface** — the sub-paths inside the peer to read (default `doc/`). Restricting to `doc/spec/`, `doc/project/`, etc. keeps the agent's context clean.
   - **Consumed for** — free text, what this corpus brings (`ack-events`, `sap-integration`, `shared-types`, …).
   - **Has pack** — does the peer already use this pack? (yes/no/unsure). If yes, the agent can read `_indexes/`, `_graph/`, `_roadmap/` directly; if no, only Markdown is reliable.
   - **Refresh policy** — `on-demand` (pull only when the agent needs the peer, default), `each-session` (pull at start of every session), `manual` (operator pulls themselves).

   For each peer, record the operator's consent to read it (default: yes if they declared it; ask explicitly only when the URL points to an unfamiliar org). Network access and credentials are the operator's responsibility — the agent does not store secrets.

If the operator answers `unsure` to "is this multi-repo?", do not write a definitive status. Set `corpus.multi_repo_status: unsure` and ask one targeted question per uncertainty before exiting. Never silently default to `standalone`.

## Write protocol

After the interview, write the captured architecture into the two state files. Always read them first; merge, do not overwrite unrelated fields.

### `doc/_meta/app-profile.yaml`

Add or update the `application.multi_repo` block. Schema:

```yaml
application:
  repository:
    role: primary               # mirror of multi_repo.role for backwards compat
  multi_repo:
    status: declared            # unknown | standalone | monorepo | declared | unsure
    role: primary               # primary | library | secondary | sibling-app
    workspace_root: ..          # relative path to the workspace root (usually `..`)
    last_interview: 2026-05-23  # ISO date of the last interview
    read_sibling_code: true     # operator consent flag (sibling source code)
    read_sibling_corpus: true   # operator consent flag (sibling doc/ corpora)
    read_external_corpus: true  # operator consent flag (remote git peer corpora)
    sync_policy: agent-suggested
    adjacent_repos:             # filled when role in [primary, sibling-app]
      - name: lib
        role: library
        source:
          type: path
          path: ../lib                # workspace sibling
        corpus_path: doc              # path WITHIN the resolved local dir; null if no pack
        has_pack: true                # true | false | planned
        refresh_policy: manual        # path peers: operator owns checkout freshness
        consumed_for: [api, types, business-rules]
      - name: deploy
        role: secondary
        source: { type: path, path: ../deploy }
        corpus_path: doc
        has_pack: true
        refresh_policy: manual
        consumed_for: [ci-cd, runtime-topology, environments]
      - name: app-b                   # local cache slug (directory name under .corpus-cache/)
        app_id: billing-service       # CANONICAL ecosystem identity — must equal the peer's
                                      # boundary.yaml `app.id` and its doc/_meta/ecosystem-map.yaml `id`.
                                      # `name` is local-only; `app_id` is the cross-app join key.
        role: peer_application        # see § External peer relations below
        access: github-mcp            # auto | workspace | github-mcp | clone (see sources/peer-corpus-access)
        source:
          type: git
          host: github               # github | gitlab | bitbucket | other (drives github-mcp eligibility)
          url: git@github.com:acme/app-b-corpus.git
          owner: acme                # org/owner for GitHub MCP calls (parsed from url if obvious)
          repo: app-b-corpus         # repo name for GitHub MCP calls
          ref: main
          surface: doc               # sub-path sparse-checked-out / hydrated (default doc)
          cache_path: .corpus-cache/app-b  # filled after first sparse clone OR MCP hydration; null until then
          last_synced_sha: null      # peer ref SHA at last successful sync (freshness diff baseline)
          last_synced_at: null       # ISO timestamp of last successful sync
        corpus_path: doc
        has_pack: true
        refresh_policy: each-session  # each-session (recommended for actively consumed peers) | on-demand | manual
        consumed_for: [ack-events, sap-integration]
    consumed_by:                # filled when role in [library, secondary]
      - name: front
        source: { type: path, path: ../front }
        corpus_path: doc
        has_pack: true
```

Rules:

- `adjacent_repos` is non-empty only when `role` is `primary` or `sibling-app`, **or** when the operator declared remote `peer_application` / `parent_domain` corpora in interview Q5 (those land here regardless of workspace role — they are independent peer references).
- `consumed_by` is non-empty only when `role` is `library` or `secondary`.
- **Identity.** A peer carries both `name` (local `.corpus-cache/` slug) and
  `app_id` (the **canonical ecosystem identity**). `app_id` is the single join
  key shared by the peer's `boundary.yaml` `app.id`, its
  `doc/_meta/ecosystem-map.yaml` registry `id`, and every `to`/`from`
  counterparty referencing it. `name` may differ from `app_id`, but `app_id`
  must not drift from the registry.
- Every entry **must** have a `source:` block. Two types:
  - `source: { type: path, path: <relative path> }` — local sibling in the workspace.
  - `source: { type: git, url: <clone URL>, ref: <branch|tag|sha>, cache_path: <relative path under .corpus-cache/> }` — remote peer. `cache_path` is written by the agent after the first successful clone; it is `null` until then.
- `corpus_path` is the path **within the resolved local directory** to the corpus root (typically `doc`). `null` when `has_pack: false`.
- `refresh_policy` for `type: git` peers drives the SHA-gated freshness diff (see `sources/peer-corpus-access § Retrieval & freshness`): `each-session` (recommended for actively consumed peers — diff before first read), `on-demand` (diff the first time the peer is read in a session), `manual` (operator owns freshness; the cache is read as-is with its `last_synced_at` surfaced). The diff is incremental, not a re-clone, so `each-session` is near-free when the peer is unchanged. For `type: path` peers, `refresh_policy` is implicitly `manual` (the operator owns the checkout).
- Never write a peer whose presence/identity was not confirmed by the operator in the interview. Filesystem proximity or a guessed URL is not consent.

### External peer relations

`type: git` peers added through Q5 use one of these relation values (recorded in the role field for `consumed_by` entries, or in a `relation:` field alongside `role` for `adjacent_repos`):

| Relation | Use when |
|---|---|
| `peer_application` | Another application this one talks to (events, APIs, shared DB). Example: Service-A ↔ Service-B. |
| `upstream_event_source` | Produces events/data this app consumes. |
| `downstream_consumer` | Consumes events/data this app produces. |
| `shared_infrastructure_doc` | Platform/infra corpus shared across multiple apps (Kafka platform, IAM, observability). |
| `parent_domain` | Business-domain corpus that contextualizes this app. |
| `other` | Free text in `consumed_for`; capture the rationale plainly. |

### `doc/_meta/corpus-state.yaml`

Add or update under `corpus:`:

```yaml
corpus:
  multi_repo_status: declared      # not_started | standalone | monorepo | declared | unsure
  multi_repo_role: primary         # mirror of app-profile multi_repo.role
  adjacent_repos_count: 3          # length of adjacent_repos (includes git peers)
  external_peers_count: 1          # number of adjacent_repos entries with source.type == git
  consumed_by_count: 0             # length of consumed_by
  last_multi_repo_interview: 2026-05-23
  last_adjacent_sync_check: null   # ISO timestamp, updated by continuous runs
  last_external_peer_pull: null    # ISO timestamp, updated when any type: git peer is pulled
```

## Source resolver — uniform access to peer corpora

This skill **declares** peers and records consent. The actual *retrieval and
access* — the graceful method chain (workspace → git sparse-clone cache →
GitHub MCP), the SHA-gated freshness diff so every session consumes an
up-to-date corpus, the uniform handle, and status recording — is owned by
**`sources/peer-corpus-access`**. Every downstream skill reads a peer through
that skill, never by touching a transport directly. The full retrieval
mechanics (sparse-clone commands, incremental diff, MCP delta fetch) live
there; this section only records the contract and the cache convention.

The contract: a peer resolves to a local directory (workspace path, sparse
clone, or MCP-hydrated cache) for tree-walking passes, with targeted MCP reads
available without materializing anything.

Resolution methods (executed by `sources/peer-corpus-access`):

| Method | Resolution | Failure modes |
|---|---|---|
| `workspace` (`type: path`) | Check the path exists relative to the current repo. Return absolute path. | Path missing → ask the operator to fix the workspace, or to migrate the entry to `type: git`. Do not silently skip. |
| `git-sparse` (`type: git`, default) | Sparse clone of `source.surface` into `.corpus-cache/<name>/` (or SHA-gated incremental refresh if present). Return absolute `cache_path`. | Clone/fetch failure → surface, do not retry silently, do not skip the peer. Record in `doc/_meta/blocking-questions.md` under "external corpus unavailable". |
| `github-mcp` (`type: git`, `host: github`, MCP available) | Targeted: read `<corpus_path>/<file>` via `get_file_contents`/`search_code`, no clone. Breadth: hydrate/delta-fetch `surface` into the cache. | MCP `not_attached`/`permission_blocked` → fall to `git-sparse` (loudly). |

The method is chosen by the peer's `access` field (default `auto` walks the
chain top-down). See `sources/peer-corpus-access § Access-method detection` and
`§ Retrieval & freshness`.

Cache convention (detail in `sources/peer-corpus-access § Cache convention`):

- Cached repos live under `.corpus-cache/<peer-name>/` at the **target repo root**.
- `.corpus-cache/` must be in `.gitignore` — per-developer, never committed. The kickstart adds the line if missing.
- **Sparse + shallow + partial** by default — only `surface` (e.g. `doc/`) is materialized, never the app source. The git transport is run deterministically by `scripts/sync-peer-corpus.mjs` (`--name --url --ref --surface --json`), not by hand-composed git commands.
- Freshness is a **SHA-gated incremental diff at session start**, not a re-clone: the script fetches shallow, compares SHAs, advances only on change, and reports `changed_files`. A stale cache is preferable to a broken session; surface staleness rather than blocking.

## Kickstart scope per role

After writing, recommend the kickstart scope to the operator. This is advisory — the operator can override. Defaults per role:

| Role | Recommended kickstart scope | Notes |
|---|---|---|
| `primary` | Full pipeline P1→P9, all discovery lanes, brick inventory, actionable readiness. | The standard kickstart described in `corpus.agent.md` § Kickstart. |
| `library` | P1, P2, P3 (entry points = public API surface), P5 (cross-cutting catalog focused on exposed API + persistence if any), P6 (conventions). Skip P4 deep-dive features, P7 structural issues, P8 maturity, P9 reconciliation gate. Skip prod, Jira/Confluence unless explicitly requested. | `code_analysis_status` will land at `partial`, not `covered`. That is the correct honest state for a library. |
| `secondary` | P1 inventory, P2 boundaries. Then `exploration/ci-cd-activity-discovery`, `exploration/dynatrace-runtime-architecture` if Dynatrace is connected, `exploration/project-activity-discovery`. Skip P3–P9 unless explicitly requested. | Focus is pipelines, environments, runtime topology consumed by the primary. |
| `sibling-app` | Treat as `primary` for its own scope. | Each sibling-app has its own full corpus. |

Announce the scope in the chat after the interview:

```text
Multi-repo setup captured
- Role: primary
- Adjacent: lib (library, has pack), deploy (secondary, no pack)
- Read sibling code: yes
- Read sibling corpus: yes (only lib for now)
- Sync policy: agent-suggested
- Recommended kickstart scope: full P1→P9 + adjacent reads
- Suggested next steps:
  1. Install the pack in deploy and run kickstart there (light scope).
  2. After that, return here and continue the full kickstart.
```

## Behavior in subsequent passes

Once `multi_repo_status: declared` **or** any `adjacent_repos` entry exists (external peers can be declared even on a standalone repo), downstream skills must use it. They always read peers through `sources/peer-corpus-access` — they never read `source.path` or `source.cache_path` directly, and never call a clone URL or GitHub MCP tool outside that skill.

- **`pipeline/p1-code-tree-inventory` (P1)**: when scanning the primary, also note imports/references to local sibling paths (`source.type == path` only). Do not deep-walk into siblings during P1; just note the boundary. External git peers are not in scope for code-tree inventory — they are documentation peers, not source-of-truth code peers.
- **`pipeline/p3-feature-candidates` (P3)** and **`pipeline/p5-cross-cutting-extraction` (P5)**: when an API/entity/integration is implemented in a sibling, create the node in the primary's graph with a `cross_repo:` field pointing to the sibling. See `continuous/roadmap-graph` for the edge convention.
- **`continuous/roadmap-graph`**: edges from primary to sibling use `cross_repo: <sibling-name>` and an `evidence:` path that goes through the sibling's `corpus_path` when `has_pack: true`.
- **`continuous/corpus-run`**: at end-of-run, if the work touched a node linked to a sibling, the run summary must recommend a sibling-side update under the configured `sync_policy`.
- **`continuous/corpus-run-audit`**: when cross-repo edges exist, verify their `evidence:` paths still resolve. Orphans are an audit failure.
- **`governance/post-kickstart-completeness-audit`**: skips `Adoption guide` gate for `library` and `secondary` roles — those don't ship adoption material, the primary does.

## Re-interview triggers

Re-run this skill (not just edit by hand) when:

- A new sibling appears in the workspace.
- A sibling is renamed or moved.
- The operator says the role has changed (e.g. a library is being promoted to a sibling-app).
- The operator wants to **add, remove or change a remote git peer corpus** (URL, ref, surface, refresh policy).
- A `type: git` peer's resolver fails consistently (auth lost, repo moved, ref renamed) — re-interview to update the entry rather than papering over the failure.
- `last_multi_repo_interview` is older than 90 days and the architecture is suspected to have drifted.

## Anti-patterns

- Treat a monorepo as multi-repo because there are several `package.json`. Run Signal 1 first.
- Write `adjacent_repos` from filesystem detection alone, without operator confirmation. Filesystem proximity is not consent.
- Assume `library` means "skip everything past P3" without saying so to the operator. Always announce the scope and let them override.
- Create cross-repo graph edges before `multi_repo_status` is `declared` (or before the relevant `type: git` peer is declared in `adjacent_repos`). The edges would be unverifiable.
- Run the interview every session. Once `declared`, trust the captured state until a re-interview trigger fires.
- Silently downgrade `sync_policy: agent-driven` to `agent-suggested` when no driver tool is available — say so out loud.
- Read a `type: git` peer directly from a clone URL or a GitHub MCP tool without going through `sources/peer-corpus-access`. That skill owns the method chain, consent gate, cache convention and status recording. The cache must be reusable across sessions, gitignored, and named by peer slug.
- Skip Q5 (external git peers) because the repo is `standalone`. Standalone vs multi-repo is about workspace layout; external peer corpora are independent of that and must always be asked.
- Hardcode credentials, tokens or SSH keys in `app-profile.yaml`. The agent never stores secrets — auth is the operator's environment (SSH agent, credential helper). If a clone fails for auth, surface it to the operator.
