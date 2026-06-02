---
name: corpus-passe
category: governance
description: "Run focused corpus passes. The Corpus agent executes all passes; maturity changes the mode, not the agent."
---
# Corpus Passes

## Purpose

Run focused corpus passes. The Corpus agent executes all passes; maturity changes the mode, not the agent.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Adoption guide material: `doc/_handover/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Pass types

| Pass | Goal |
|---|---|
| orientation | Build or improve repo/app understanding. |
| feature | Deepen one feature folder. |
| architecture | Map components, integrations and technical flows. |
| production | Capture bugs, risks, incidents, playbooks or watchlist items. |
| mcp | Document how to use a connected tool/source reliably. |
| reconciliation | Remove contradictions and update indexes. |
| quality | Audit structure, links, metadata and coverage. |
| adoption | Prepare adoption guide material for the AI champion and team. |

## Required behavior

1. Read `doc/CORPUS_MAP.md` before creating or moving corpus content.
2. Use `doc/CORPUS_MANIFEST.md` for conventions.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Use frontmatter metadata for important corpus files.
6. Update indexes when canonical files are created or renamed.
7. Record unresolved questions in `doc/_meta/open-questions.md`.
8. Reconcile affected files instead of appending contradictions.

## Adoption stages

Use `doc/_meta/corpus-state.yaml` to keep adoption state honest:

| Stage | Label | Meaning |
|---|---|---|
| 0 | `pack_copied` | Pack copied, not initialized. |
| 1 | `operator_kickstart_started` | Operator is running the initial exploration. |
| 2 | `initial_corpus_generated` | First useful corpus baseline exists. |
| 3 | `reviewed_with_ai_champion` | AI champion has reviewed the corpus and usage model. |
| 4 | `used_by_team_on_real_work` | Team has used agents and corpus on real work. |
| 5 | `team_owned_maintenance` | Team maintains the corpus autonomously. |

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
