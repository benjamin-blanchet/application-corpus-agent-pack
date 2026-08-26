---
name: implement-spec
category: authoring
description: "Implement one approved, Controller-reserved work package from repository evidence and proportional tests. Never creates or edits the spec/corpus; returns structured owner deltas."
---
# Implement Spec

## Purpose

Implement one approved and reserved work package using actual repository
conventions and proportional tests. Functional Analyst owns the spec, Planner
owns the work package, and Corpus owns durable knowledge.

This skill enforces the development lifecycle:

```text
read corpus + validate approved inputs -> implement reserved paths -> test -> return owner deltas
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

### 2. Validate the approved inputs

Before implementation, receive a human-approved spec package under:

```text
doc/spec/<version>/<jira>/
```

- `<version>` is the operator-confirmed target release/version slug.
- `<jira>` is the Jira issue key or operator-confirmed topic slug.
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

Developer does not create, move, complete or approve this package. It also
requires the approved Planner work package, Controller reservation, exclusive
write claims and capability contract. Missing/ambiguous spec input returns to
Functional Analyst; an incomplete work package returns to Planner/Controller.

### 3. Implement from repository evidence

Apply `development/existing-code-integration`. Before any reservation or edit,
return a read-only `lot_conventions_observed` handoff with sorted rule IDs and
neighbouring committed examples. The Controller materializes each example's
path, byte digest and byte count against the exact source revision; the later
lot result binds that contract and reattests how the same rules were applied.

- Detect the actual stack from files, build tools, conventions and tests.
- Follow existing naming, layering, routing, error handling, dependency and test conventions.
- Keep the change proportional to the spec.
- Record deviations from the spec in the returned `spec_delta`; never edit the
  package.
- Do not introduce opportunistic refactors, replacement libraries or a parallel
  architecture in the name of generic best practice.
- If the existing structure demonstrably blocks a safe implementation, stop
  with locations, impact, options and the smallest required refactor. Only an
  operator-approved plan amendment may widen the change.

### 4. Test or explain test gap

- Run relevant tests if available and feasible.
- Add or update tests when the repository has a test practice.
- If tests cannot be run or do not exist, record the gap in the structured lot
  result and `spec_delta`.

### 5. Return closeout deltas to the owners

Developer writes no `doc/**` path. Return:

```yaml
spec_delta:
  implemented: <observable result>
  deviations: []
  verification: [{command: <exact command>, status: <passed|failed|blocked>, evidence: <digest/ref>}]
  suggestions: []
corpus_delta:
  - target: <durable corpus surface>
    claim: <fact changed or confirmed>
    evidence: <code paths + diff/result/test evidence>
    confidence: <confirmed|probable|suspected|unknown>
```

Functional Analyst reconciles `spec_delta`; Corpus reconciles
`corpus_delta`, indexes, contradictions and any owner-created update candidate.
Controller keeps closeout blocked while either result is incomplete.

## Required behavior

1. Read `doc/CORPUS_MAP.md` to locate relevant knowledge.
2. Use `doc/CORPUS_MANIFEST.md` as read-only conventions.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Edit only Controller-reserved application source/test paths.
6. Return all spec/test/deviation facts in `spec_delta`.
7. Return durable knowledge and unresolved questions in `corpus_delta`.
8. Never substitute a direct doc edit or update-candidate for the owner handoff.

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

Prefer the smallest repository-native implementation. Keep handoffs factual,
bounded and evidence-backed; do not include private reasoning transcripts.
