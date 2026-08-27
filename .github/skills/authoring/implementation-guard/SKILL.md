---
name: implementation-guard
category: authoring
description: "Guard a Developer's reserved implementation against missing approved inputs, unobserved repository conventions and cross-owner writes. Developer returns closeout deltas; it never authors spec or corpus."
---
# Implementation Guard

## Purpose

Prevent code changes that are not grounded in the corpus, an approved spec and
plan, and observed repository evidence, without giving Developer ownership of
those durable inputs.

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
   - Receive an existing, approved `doc/spec/<version>/<jira>/` package.
   - Receive an approved Planner work package.
   - Before reservation, return a read-only, content-addressed
     `lot_conventions_observed` handoff: sorted rule IDs plus committed example
     paths. The Controller supplies the exact revision, byte hashes and sizes.
   - Receive the Controller reservation only after that contract validates.
   - Missing or ambiguous intent returns to `functional-analyst`; missing
     decomposition returns to `planner`. Developer creates or completes
     neither artefact.

3. **Stack detected from evidence**
   - Do not infer stack from habit or previous projects.
   - Use actual repository files, imports, build scripts, routes, controllers, jobs, tests and deployment files.
   - The implementation result must bind the preimplementation contract digest
     and reattest the same rules against post-change example bytes.

4. **Closeout handoff targets identified**
   - Before coding, identify which facts may affect the spec or durable corpus.
   - Record them as prospective `spec_delta`/`corpus_delta` items, never as a
     Developer write claim.

## Required behavior

1. Read `doc/CORPUS_MAP.md` to locate the smallest relevant corpus slice.
2. Use `doc/CORPUS_MANIFEST.md` to interpret conventions; do not edit it.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Do not create, move or edit any `doc/**` file.
6. Return spec facts/deviations/tests as `spec_delta` for Functional Analyst.
7. Return durable knowledge and unresolved questions as `corpus_delta` for
   Corpus, with evidence and confidence.
8. Keep the closeout gate blocked until the owning roles reconcile the deltas.

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

- which approved spec package and work package were used;
- which corpus files were read;
- what was implemented;
- what tests were run or why they were not run;
- the structured `spec_delta` returned to Functional Analyst;
- the structured `corpus_delta` returned to Corpus, including open questions;
- confirmation that Developer wrote no `doc/**` path.
