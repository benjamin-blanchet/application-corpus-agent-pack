---
name: implementation-guard
category: authoring
description: "Prevent code changes that are not grounded in the corpus, a spec package and repository evidence."
---
# Implementation Guard

## Purpose

Prevent code changes that are not grounded in the corpus, a spec package and repository evidence.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Safe operation gates

Use `governance/safe-operation-guardrails` before any broad file rewrite, package script, Git operation, database query, migration, ticket transition, CI/CD action, deployment or production/runtime action. Developer may edit source code only within the spec scope. External side effects are blocked unless explicitly requested and safety-gated.

## Blocking gates

A development task must not proceed to code changes until these gates are satisfied:

1. **Corpus context loaded**
   - `doc/CORPUS_MAP.md`
   - `doc/CORPUS_MANIFEST.md`
   - `doc/_meta/app-profile.yaml`
   - relevant feature, architecture, operations, bug, risk or playbook files

2. **Spec package present**
   - Use an existing `doc/spec/...` package, or create a minimal one.
   - If the business intent is ambiguous, route to `functional-analyst`.
   - If the intent is clear but implementation detail is missing, complete `IMPACTS.md` and `TESTS.md` before coding.

3. **Stack detected from evidence**
   - Do not infer stack from habit or previous projects.
   - Use actual repository files, imports, build scripts, routes, controllers, jobs, tests and deployment files.

4. **Corpus update plan identified**
   - Before coding, identify which corpus files may need updates after the change.
   - At minimum, consider spec package, feature files, `OPERATIONS.md`, prod knowledge and indexes.

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

## Exit requirement

The final response for a development task must state:

- which spec package was used or created;
- which corpus files were read;
- what was implemented;
- what tests were run or why they were not run;
- which corpus files were updated;
- which open questions or update candidates remain.
