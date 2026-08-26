---
name: implement-spec
category: authoring
description: "Plan and implement a validated or newly-created spec using actual repository conventions and proportional tests."
---
# Implement Spec

## Purpose

Plan and implement a validated or newly-created spec using actual repository conventions and proportional tests.

This skill enforces the development lifecycle:

```text
read corpus -> prepare/validate spec -> implement -> test -> reconcile/update corpus
```

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Mandatory lifecycle

### 1. Read corpus before implementation

Before code changes, read the smallest relevant corpus set:

- `doc/CORPUS_MAP.md`
- `doc/CORPUS_MANIFEST.md`
- `doc/_meta/app-profile.yaml`
- `doc/_meta/repository-map.yaml` when present
- the target `doc/spec/...` package
- related feature files under `doc/project/features/<feature>/`
- related production files under `doc/prod/` when behavior, support, runtime or incidents are involved

Do not read the entire corpus blindly. Read the relevant slice and state what was used.

### 2. Ensure a spec package exists

Before implementation, ensure there is a spec package under:

```text
doc/spec/<version>/<jira>/
```

- `<version>` is the target release/version slug read from the Jira ticket's `fixVersion` (or equivalent target-release field). If the field is empty or ambiguous, ask the operator before creating the folder — never invent a version.
- `<jira>` is the Jira issue key (e.g. `PROJ-1234`); if no Jira ticket exists, ask the operator for a short kebab-case topic slug to use instead.
- Both segments are required. A spec package outside `doc/spec/<version>/<jira>/` is non-compliant and must be moved before implementation.

Minimum useful files:

```text
README.md
SPECIFICATION.md
IMPACTS.md
TESTS.md
SUMMARY.md
SUGGESTIONS.md
```

If a package already exists, update or complete it before coding.

If the business need is unclear, do not invent rules. Record open questions and route to `functional-analyst`.

### 3. Implement from repository evidence

Apply `development/existing-code-integration` and include observed neighbouring
examples/conventions in the work package before editing.

- Detect the actual stack from files, build tools, conventions and tests.
- Follow existing naming, layering, routing, error handling, dependency and test conventions.
- Keep the change proportional to the spec.
- Record deviations from the spec in the spec package.
- Do not introduce opportunistic refactors, replacement libraries or a parallel
  architecture in the name of generic best practice.
- If the existing structure demonstrably blocks a safe implementation, stop
  with locations, impact, options and the smallest required refactor. Only an
  operator-approved plan amendment may widen the change.

### 4. Test or explain test gap

- Run relevant tests if available and feasible.
- Add or update tests when the repository has a test practice.
- If tests cannot be run or do not exist, record the gap in the spec package and task summary.

### 5. Update and reconcile the corpus at the end

After implementation, update durable knowledge immediately:

- spec package: final implementation notes, test results, deviations, out-of-scope suggestions;
- feature `README.md`, `ARCHITECTURE.md`, `WORKFLOWS.md`, `BUSINESS_RULES.md`, `OPERATIONS.md`, `AI_AGENT_GUIDE.md` when affected;
- prod knowledge: known bugs, structural risks, playbooks, watchlist entries when affected;
- indexes under `doc/_indexes/` when canonical files or relationships changed;
- `doc/_meta/open-questions.md` for unresolved uncertainty.

Do not leave the corpus in an append-only state. Use `authoring/reconciliation` and `governance/corpus-update`.

If the tool context prevents editing corpus files, write precise update instructions to:

```text
doc/_meta/update-candidates.md
```

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
