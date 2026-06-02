---
name: discovery-coverage-contract
category: governance
description: "Make corpus kickstart coverage explicit, measurable and hard to fake."
---
# Discovery Coverage Contract

## Purpose

Make corpus kickstart coverage explicit, measurable and hard to fake.

The `Corpus` agent must not claim that the corpus is initialized from a vague exploration. It must record what was scanned, queried, read, skipped, blocked and still unknown across repository code, Jira, Confluence, Dynatrace and any custom sources.

## Principle

For every source or brick that exists and is safe to read, take the maximum useful information within bounded, read-only, evidence-recorded limits.

If the source exists but cannot be consumed, mark it as blocked or partial. Do not silently continue as if it does not matter.

## Mandatory first reads

1. `doc/CORPUS_MAP.md`
2. `doc/CORPUS_MANIFEST.md`
3. `doc/_meta/discovery-coverage.md`
4. `doc/_meta/mcp-source-wizard.md`
5. `doc/_meta/mcp-readiness.md`
6. `doc/_meta/information-sources.yaml`
7. `doc/_meta/kickstart-progress.md`
8. `doc/_meta/blocking-questions.md`

## Canonical output

Update:

```text
doc/_meta/discovery-coverage.md
doc/_meta/coverage-matrix.md
doc/_meta/source-inventory.md
doc/_meta/open-questions.md
doc/_meta/kickstart-progress.md
doc/_meta/kickstart-report.md
doc/_meta/corpus-state.yaml
doc/_meta/blocking-questions.md
```

## Coverage statuses

Use these statuses:

| Status | Meaning |
|---|---|
| `not_started` | No meaningful coverage yet. |
| `inventory_only` | Source or area identified but not deeply explored. |
| `started` | First useful evidence collected. |
| `partial` | Useful evidence collected, but required coverage target not met. |
| `covered` | Minimum coverage target met for kickstart. |
| `deep` | Beyond minimum target; enough for strong first baseline. |
| `blocked` | Cannot proceed without access, mapping, tools or human input. |
| `not_applicable` | Source or area does not apply, with reason. |

## Repository coverage contract

The first code pass must cover the whole repository at inventory level, excluding generated/vendor/build artifacts.

Minimum required evidence:

- total files and directories counted;
- excluded directories/patterns;
- manifests and build files read;
- detected languages/frameworks/package managers;
- entry points found: routes, controllers, handlers, CLIs, jobs, consumers, schedulers, scripts;
- APIs/endpoints or route definitions found;
- batch/job/consumer definitions found;
- config and environment files identified without extracting secrets;
- tests detected;
- migrations/schema/data-access areas identified;
- top-level modules/components classified;
- zones not deeply read yet.

Do not claim architecture or features from a tiny sample without marking coverage as partial.

## Jira coverage contract

When Jira is available, the minimum kickstart sample is:

- last 50 created issues for the project;
- last 50 updated issues for the project;
- currently open/active issues;
- active sprint or active board focus when available;
- active epics/initiatives/versions when available;
- bugs/incidents updated in the last 90 days;
- reopened or high-churn issues when available;
- issue fields used for component/label/feature mapping.
- cross-project mentions of the application by app aliases when supported;
- linked blockers/dependencies from other Jira projects when supported;
- roadmap, migration, release-train or initiative references from other Jira projects when supported.

Record exact JQL, limits, fields returned, time windows and unsupported fields.

When Jira is available for a serious kickstart, main-project-only coverage is not enough if cross-project search is supported. Use `exploration/atlassian-project-trajectory` or record why cross-project discovery is blocked, unsupported or out of scope.

If Jira exists but MCP tools are not attached, mark Jira coverage `blocked`, not absent.

Before marking it blocked, use `governance/blocking-question-loop` to ask the operator whether the Jira MCP tools can be attached and what project keys should be used.

## Confluence coverage contract

When Confluence is available, the minimum kickstart search is:

- application/product name;
- repository name;
- known acronyms or project keys;
- component/service names discovered from the repo;
- feature names discovered from repo or Jira;
- spaces declared by the operator;
- recently modified pages in relevant spaces when supported.
- cross-space references to the app/repo/service code when supported;
- roadmap, migration, target architecture, incident, REX, runbook and adjacent-app pages outside declared spaces when supported.

Record exact search terms, spaces, page counts found, pages read, pages skipped and limitations.

When Confluence is available for a serious kickstart, declared-space-only coverage is not enough if global or multi-space search is supported. Use `exploration/atlassian-project-trajectory` or record why cross-space discovery is blocked, unsupported or out of scope.

Before marking Confluence blocked or partial, ask the operator for spaces, page roots or likely search terms when available.

Do not convert Confluence prose into confirmed truth without reconciling with code, Jira, production evidence or human confirmation.

## Dynatrace / production coverage contract

When Dynatrace or another production source is available, the minimum kickstart discovery is:

- confirm whether the application is visible in the observability source;
- map service/entity/process names to repo components;
- map the observed runtime architecture and surrounding ecosystem;
- inspect inbound callers, entry services, protocols and entry operations;
- inspect outbound dependencies, external services, databases, queues and gateways;
- inspect service-to-service dependency graph around the product;
- sample logs, metrics and traces across bounded 24h, 7d and 30d windows when supported;
- inspect last 24h immediate state;
- inspect last 7d recurring errors and latency hotspots;
- inspect last 30d trends only when useful and safe;
- top error signals;
- top latency/performance hotspots;
- availability/restart/crash signals;
- batch/job/consumer health where applicable;
- downstream dependency failures;
- infrastructure or host/container signals when visible;
- monitoring gaps or naming mismatches.

Record exact query/filter, environment, time window, limits and limitations.

When Dynatrace is available, production coverage should not be marked `covered` unless `doc/prod/RUNTIME_ARCHITECTURE.md` and `doc/prod/SERVICE_FLOWS.md` have been populated or explicitly marked not applicable/blocked with reasons. A single health overview is only `started` or `partial`.

If Dynatrace exists but tools are not attached, mark production coverage `blocked`. Do not infer production health from code.

Before marking Dynatrace blocked or partial, ask the operator for environment, entity/service mapping and whether the Dynatrace MCP tools can be attached.

## Custom source coverage contract

For each custom MCP, SQL, API, export, dashboard or manual evidence source:

1. Register it in `doc/_meta/information-sources.yaml`.
2. Classify expected use.
3. Define safe access mode.
4. Define minimum smoke test.
5. Define minimum kickstart extraction if the source is required.
6. Record coverage status in `doc/_meta/discovery-coverage.md`.

## Required response behavior

During kickstart, each `Corpus status` footer must reflect coverage, not only file creation.

If a blocker is answerable by the operator, ask a blocking question before downgrading coverage.

If coverage is weak, say so:

```text
Project knowledge: partial - repo inventory complete, only controllers and configs deeply read
Jira coverage: blocked - Jira MCP tools not attached
Confluence coverage: not_started - wizard says source exists, readiness pending
Dynatrace coverage: partial - services mapped, 7d error query done, latency not yet checked
```

## Kickstart completion gate

Do not present the kickstart as complete unless:

- repository coverage is at least `covered`;
- every expected MCP/source has `covered`, `partial`, `blocked` or `not_applicable` with a reason;
- Jira/Confluence/Dynatrace gaps are explicitly recorded;
- `doc/_meta/discovery-coverage.md` is updated;
- `doc/_meta/kickstart-report.md` includes coverage limitations.

## Anti-patterns

Do not:

- say "I scanned the repo" without inventory counts and exclusions;
- say "Jira unavailable" before checking MCP readiness;
- skip Confluence because code was enough;
- infer production state from source code;
- hide blocked coverage inside prose;
- mark a sector `covered` because a template exists;
- use unbounded queries or extract sensitive data to maximize coverage.
