---
name: mcp-data-reading
category: sources
description: "Before using connected tools or custom sources, read `doc/mcp/<tool>.md` or `doc/mcp/custom-sources.md`, register the source in `doc/_meta/information-sources.yaml`, and record availability, query patterns and limitations."
---
# MCP Data Reading

## Purpose

Before using connected tools or custom sources, read `doc/mcp/<tool>.md` or `doc/mcp/custom-sources.md`, register the source in `doc/_meta/information-sources.yaml`, and record availability, query patterns and limitations.

For Jira, Confluence, Dynatrace or any expected MCP-backed source, first use `sources/mcp-readiness-check`. Do not silently fall back to repository-only evidence when an MCP source is missing from the current IDE agent session.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Required behavior

1. Read `doc/CORPUS_MAP.md` before creating or moving corpus content.
2. Use `doc/CORPUS_MANIFEST.md` for conventions.
3. Read `doc/mcp/MCP_READINESS.md` and `doc/_meta/mcp-readiness.md` before consuming MCP sources.
4. Announce MCP consumption before using MCP tools.
5. Verify that expected MCP servers are running and tools are attached to the current IDE agent/session.
6. Run small read-only smoke tests when possible.
7. Record MCP status as `available`, `available_unverified`, `not_attached_to_agent`, `server_not_running`, `not_configured`, `permission_blocked` or `mapping_unknown`.
8. Do not assume the technology stack; detect it from repository evidence.
9. Distinguish facts, hypotheses and unknowns.
10. Use frontmatter metadata for important corpus files.
11. Update indexes when canonical files are created or renamed.
12. Record unresolved questions in `doc/_meta/open-questions.md`.
13. Reconcile affected files instead of appending contradictions.

## Stack-neutral detection hints

Look for package/build/config files and entry points such as:

- `package.json`, `pnpm-lock.yaml`, `angular.json`, `vite.config.*`, `next.config.*`
- `composer.json`, `artisan`, `symfony.lock`, PHP route/config files
- `pom.xml`, `build.gradle`, `src/main`, Java/Kotlin package structure
- `.csproj`, `.sln`, `Program.cs`, `.fsproj`
- `requirements.txt`, `pyproject.toml`, `manage.py`, `app.py`
- Dockerfiles, compose files, CI pipelines, deploy manifests
- route definitions, controllers, handlers, consumers, jobs, scripts, migrations and tests

## Output discipline

Prefer small canonical files and indexes over large monolithic documents.

## Custom sources

Not every useful source is an MCP. For SQL databases, APIs, file exports or manual evidence, use `sources/information-source-onboarding` and respect `governance/safe-operation-guardrails`.

## No silent fallback

If an expected MCP source is unavailable, state it explicitly to the operator, update `doc/_meta/mcp-readiness.md`, and mark related discoveries as blocked or partial. Continue only with a clearly labeled reduced scope.

## Post-session capitalization

Reading `doc/mcp/<tool>.md` before a session is necessary but not sufficient. The pack ships each per-tool reference as a **draft template** — it becomes useful only when filled with what the team's actual MCP returns, refuses, and surprises with. **After any session that exercised an MCP, write back what was learned.**

### What to update (per tool file, e.g. `doc/mcp/dynatrace.md`)

1. **`Local conventions` table** — every concrete value the agent had to discover or be told (tenant, host group, management zone, entity ID, account ID, project key, container name, bucket, dashboard URL, …). One row per discovered value. Source column names *how* it was confirmed (smoke test, operator answer, doc page).

2. **`Common pitfalls` section** — every "I tried X and it returned 0 results / wrong shape / silent failure". These are the single highest-leverage entries — they save the *next* agent from rediscovering by trial and error. Be specific: not "filtering by host doesn't work" but "`dt.host_group.id` does not filter logs in Grail (returns 0); use `host.name` or `container.name`".

3. **`Useful queries or lookup patterns` / `Filtres DQL vérifiés`** — verified, runnable queries with the filters actually needed for *this* team's data. Do not paste invented or example queries — only what was executed and returned data.

4. **`Discovery limitations`** — what is impossible or blocked (missing permissions, deprecated fields, quota walls, naming mismatches, fields always `null`). Distinguish "not available for this tenant" from "not yet tried".

5. **Frontmatter** — bump:
   - `status: draft` → `active` once the file carries verified content beyond the template;
   - `confidence: unknown` → `confirmed` (or `probable` if not yet operator-validated);
   - `source: pack` → the actual primary source (`prod`, `operator`, `smoke_test`, `mcp_call`);
   - `last_validated:` → today's date.

### Where this does NOT go

Discoveries about MCP usage do **not** belong in:
- `doc/_meta/corpus-state.yaml` (state file — narrative there fragments the agent's read; `validate-corpus.mjs` flags `*_note` creep);
- a one-off `_runs/<date>-<topic>.md` run note alone — the run note is fine as audit trail, but the *operational knowledge* must also land in `doc/mcp/<tool>.md` for the next agent to find.

The run note answers "what we did this session". The MCP file answers "how to use this MCP for this app forever after". Both, not one.

### Discipline check

Before closing a session that touched an MCP, ask: *can the next agent that opens `doc/mcp/<tool>.md` skip the discovery I just did?* If no, the file is not done. `validate-corpus.mjs` runs a `mcp-knowledge-stale` check (P2) that flags when a `<tool>_mcp_status: connected|available` is paired with a still-draft `doc/mcp/<tool>.md`.
