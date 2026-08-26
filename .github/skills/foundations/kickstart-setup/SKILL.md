---
name: kickstart-setup
category: foundations
lifecycle: init-only
description: "Initialize the corpus in a repository that had no agentic knowledge base. Do not modify application source code. Fill doc/_meta files, initialize doc/_indexes, detect stack from evidence, produce doc/_meta/kickstart-report.md, and prepare optional project activity discovery and…"
---
# Kickstart Setup

## Purpose

Initialize the corpus in a repository that had no agentic knowledge base. Do not modify application source code. Fill doc/_meta files, initialize doc/_indexes, detect stack from evidence, produce doc/_meta/kickstart-report.md, and prepare optional project activity discovery and production discovery passes when connected sources are available. Prepare the corpus for continuous enrichment and later adoption material without inventing team-specific or production facts.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Adoption guide material: `doc/_handover/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Required behavior

1. Read `doc/CORPUS_MAP.md` before creating or moving corpus content.
2. Use `doc/CORPUS_MANIFEST.md` for conventions.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Use frontmatter metadata for important corpus files.
6. Update indexes when canonical files are created or renamed.
7. Record unresolved questions in `doc/_meta/open-questions.md`.
8. Reconcile affected files instead of appending contradictions.
9. Keep adoption-related unknowns visible for later AI champion/team enablement.

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


## Optional connected-source discovery during setup

When Jira/work tracking, Git/source-control, PR or CI sources are declared, initialize historical coverage and prepare `exploration/project-activity-discovery`. Probe the required transport immediately before use; when unusable in this run, record the current-run impact and missing access or mappings without changing the durable source contract. Do not invent project activity state.
