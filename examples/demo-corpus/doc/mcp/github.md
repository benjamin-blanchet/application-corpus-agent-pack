---
type: mcp-reference
status: draft
confidence: unknown
source: pack
last_validated:
title: "GitHub / Git / Source Control"
description: "GitHub is used here in two distinct ways."
---

# GitHub / Git / Source Control

GitHub is used here in two distinct ways. Keep them separate:

1. **This repository's own history** — local Git commands (commit activity,
   hotspots, contributors). No MCP required.
2. **Reading *other* applications' corpora in the ecosystem** — the GitHub MCP
   read-only tools let the agent read a peer app's `doc/` without cloning. This
   is the cross-application capability; it is driven by
   [`sources/peer-corpus-access`](../../.github/skills/sources/peer-corpus-access/SKILL.md),
   never ad hoc.

## Availability

Unknown until configured for the target team. Track the GitHub MCP status in
`doc/_meta/mcp-readiness.md` (run `sources/mcp-readiness-check` first). Local
Git history may still be available even when no GitHub/GitLab/Bitbucket/Azure
DevOps MCP is attached.

## Local conventions

| Item | Value | Source | Confidence |
|---|---|---|---|
| Source control provider | unknown | | unknown |
| Default branch | unknown | | unknown |
| Branch naming | unknown | | unknown |
| PR/MR convention | unknown | | unknown |
| Commit message convention | unknown | | unknown |
| Ticket key pattern | unknown | | unknown |
| CI provider | unknown | | unknown |
| GitHub org/owner(s) | unknown | | unknown |
| GitHub MCP server/tool names | unknown | | unknown |

## GitHub MCP — read-only tool catalog

Tool names vary by MCP implementation; record this team's actual names in the
table above after the first session. Use **only** read-only tools. Typical
read surface:

| Need | Typical tool | Notes |
|---|---|---|
| Read one file | `get_file_contents` | Pass `owner`, `repo`, `path`, `ref`. The path is `<corpus_path>/<subpath>`, e.g. `doc/_indexes/by-api.md`. |
| List a directory | `get_file_contents` on a dir path, or a directory-listing tool | Used to walk a peer's `doc/` surface during hydration. |
| Search inside a repo | `search_code` | Scope with `repo:<owner>/<repo> path:<corpus_path>` and a small result limit. |
| Resolve default branch / repo metadata | `get_repository` | Use before assuming `main`. Also the head SHA used as the freshness baseline. |
| Branches / tags | `list_branches`, `list_tags` | To pin a peer `ref`. |
| Changed files between two SHAs | `list_commits` / compare | The MCP freshness diff: fetch only files changed since `last_synced_sha`, not the whole tree. |
| PR / issue context (optional enrichment) | `list_pull_requests`, `list_issues` | Read-only; rank-low evidence per source priority. |

**Forbidden** (write tools, never call from any corpus mode): create/update/
delete file, create/merge PR, create/update issue, add comment, create branch,
dispatch workflow, change settings. The `Corpus` agent is read-only on every
external system.

## Reading a peer application's corpus (cross-application)

This is the capability behind "let the corpus agent read the corpora of the
other apps in the ecosystem". It is fully specified in
[`sources/peer-corpus-access`](../../.github/skills/sources/peer-corpus-access/SKILL.md).
Summary:

- The peer must be **declared** in `doc/_meta/app-profile.yaml`
  (`adjacent_repos`) with consent (`read_external_corpus: true`). Declaration is
  `foundations/multi-repo-workspace-detection`, not this file.
- Access is chosen by a graceful chain: local **workspace** path → existing
  **cache** → **github-mcp** (read tools, no clone) → **clone**. A peer may pin
  `access: github-mcp` to prefer the MCP path.
- Two read strategies, both supported:
  - **Targeted read** — `get_file_contents` / `search_code` for a few named
    files. Cheap; the default for cross-application lookups.
  - **Surface hydration** — walk and fetch the peer's `doc/` (or a sub-path)
    into `.corpus-cache/<peer>/` so tree-walking passes work unchanged. One MCP
    call per file — scope it to the surface, never the whole repo. For breadth,
    a git **sparse clone** of `doc/` is usually cheaper than MCP hydration; use
    MCP hydration only when git is unavailable.
- **Freshness**: every session consumes an up-to-date corpus via a SHA-gated
  diff, not a re-clone. Compare the peer's current head SHA to the stored
  `last_synced_sha`; if unchanged it's a near-free no-op, otherwise fetch only
  the changed files (git `diff`/`fetch`, or the MCP compare endpoint).
- A peer corpus is a **secondary, code-derived source** (when the peer has the
  pack): it enriches and contextualizes, it never overrides this app's own code
  under `foundations/core-rules § Source priority`.

Coordinates for MCP calls come from the peer's `source` block: `owner`/`repo`
(parsed from `source.url` if not explicit), `ref` (default `main`, but resolve
via `get_repository`), and `corpus_path` (default `doc`).

## Useful queries or lookup patterns

Record verified provider queries and verified GitHub MCP calls only. Do not
invent repositories, branches, owners, fields, service names or dashboards.

Local Git commands that may support project activity discovery:

```bash
git log --since="90 days ago" --pretty=format:'%h%x09%ad%x09%an%x09%s' --date=short
git log --since="90 days ago" --name-only --pretty=format: | sort | uniq -c | sort -nr | head -50
git shortlog -sne --since="90 days ago"
git log --since="90 days ago" --stat --oneline
```

## Project activity discovery

When Git or provider APIs are available, `exploration/project-activity-discovery` may use them to identify commit frequency, changed areas, hot files, PR activity, CI signals, release branches and knowledge concentration.

Use contributor information only for collaboration, handover and ownership discovery. Do not rank individual productivity.

## Common pitfalls

- Local clones may have shallow history.
- Merge commits and formatting-only commits can distort activity.
- Large generated files can pollute hotspot analysis.
- Author names may differ across identities.
- Commit volume is not value delivered.
- Check source availability before relying on it.
- Save reusable query patterns in this file after validation.

### GitHub MCP pitfalls (record what this team hits)

- Do not assume the default branch is `main` — resolve it with `get_repository`.
- `get_file_contents` paths are repo-root-relative; the corpus lives under
  `corpus_path` (usually `doc/`), so prefix accordingly.
- `search_code` may index only the default branch and can lag recent pushes;
  for an exact file, prefer `get_file_contents` at a pinned `ref`.
- Hydrating a whole `doc/` tree is one MCP call per file — scope to the needed
  sub-paths for large peers, or use targeted reads.
- A peer with `has_pack: false` has no `_indexes/`/`_graph/`; only raw Markdown
  is reliable.
- Auth is the operator's MCP token — never read, store or echo it. A
  `permission_blocked` status means fall back to clone, loudly.
