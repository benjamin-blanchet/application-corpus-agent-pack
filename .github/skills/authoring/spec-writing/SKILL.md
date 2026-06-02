---
name: spec-writing
category: authoring
description: "Create spec packages under doc/spec/<version>/<jira>/ with need, scope, rules, impacts, tests, summary and out-of-scope suggestions."
---
# Spec Writing

## Purpose

Create spec packages under doc/spec/<version>/<jira>/ with need, scope, rules, impacts, tests, summary and out-of-scope suggestions.

`<version>` is the target release/version slug, read from the Jira ticket's `fixVersion` (or equivalent target-release field). If the field is empty or ambiguous, ask the operator before creating the folder — never invent a version. `<jira>` is the Jira issue key (e.g. `PROJ-1234`); if no Jira ticket exists, ask the operator for a short kebab-case topic slug to use instead.

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
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Use frontmatter metadata for important corpus files.
6. Update indexes when canonical files are created or renamed.
7. Record unresolved questions in `doc/_meta/open-questions.md`.
8. Reconcile affected files instead of appending contradictions.

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
