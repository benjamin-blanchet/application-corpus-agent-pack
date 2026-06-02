---
name: knowledge-extraction-interview
category: exploration
description: "Extract durable knowledge from human input. Convert assertions into corpus updates with source=human and explicit confidence."
---
# Knowledge Extraction Interview

## Purpose

Extract durable knowledge from human input. Convert assertions into corpus updates with source=human and explicit confidence.

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
