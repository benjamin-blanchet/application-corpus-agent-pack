---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Impacts — `<topic>`

<!--
Required for Small / Standard / Large.
Trivial: skip this file entirely.
Small: keep "Modules" + "Regression zones" only.
Standard: fill every section.
Large: + explicit perf budget + sibling sync (if multi-repo declared).

Sourced from Steps 3 (change surface) and 4 (risk analysis) of the developer lifecycle.
Apply `development/risk-analysis-checklist` to fill the risk sections.
-->

## Modules and files touched

<!-- The entry point + downstream dependencies, ordered by sequence of modification. -->

| # | File | Layer | Change kind |
|---|---|---|---|
| 1 | `<path>` | `<ui | service | data | batch | infra>` | `<add | modify | remove>` |

## APIs / contracts

<!-- Public surfaces: REST/SOAP endpoints, message schemas, library exports. -->

- `<endpoint or contract>` — change: `<add | modify | break>` — versioning: `<n/a | deprecation note | major bump>`
- `<…>`

## DB / migrations

<!-- Schema or data changes. Reference doc/project/architecture/PERSISTENCE.md. -->

- Migration: `<repo migration convention path, e.g. db/migrations/V2026__add_x.sql or N/A>`
- Tables touched: `<list>`
- Index required: `<yes — name + rationale | no — rationale>`
- Rollback: `<script ref or strategy>`
- Data backfill: `<yes — plan | no>`

## Batches / async

<!-- Reference doc/project/batchs/ and doc/project/services/MESSAGING.md. -->

- Batch job touched: `<name or N/A>` — change: `<…>`
- Async producer / consumer: `<name or N/A>` — message contract change: `<yes | no>`
- Ordering / idempotency assumptions: `<…>`

## Integrations

<!-- External service calls. Reference doc/project/architecture/INTEGRATION_MAP.md. -->

- `<integration>` — call change: `<new | moved | removed>` — timeout/retry/circuit: `<…>`

## Regression zones

<!--
Copy from development/risk-analysis-checklist § 4.1 the rows that apply.
Every zone MUST have a matching entry in TESTS.md (or explicit rationale to skip).
-->

| Regression zone | Detection / evidence | Mitigation |
|---|---|---|
| `<zone>` | `<graph edge / grep / known-bug ref>` | `<test name or rationale>` |

## Performance impact

<!--
Standard: state expected effect on hot paths, queries, external calls, memory, concurrency, batch sizing.
Large: must include numeric budget (latency target, throughput target, memory ceiling) and verification method.
Trivial/Small without perf concern: state "No measurable impact expected — <evidence>".
-->

- Hot path: `<affected? — evidence>`
- Query change: `<yes — query plan check planned | no>`
- External call: `<sync | async; timeout; retry policy>`
- Memory: `<bounded? eviction strategy?>`
- Concurrency: `<isolation level; critical section width>`
- Budget (Large): `<latency p50/p95/p99 | throughput | memory>`
- Verification method: `<see TESTS.md "Performance">`

## Cross-repo impact

<!--
Only if application.multi_repo.status == declared in doc/_meta/app-profile.yaml.
Otherwise delete this entire section.
-->

- Sibling consumer impacted: `<sibling repo name and contract>`
- Sibling sync recommendation (per `multi_repo.sync_policy`):
  - `manual`: list affected siblings; operator runs sibling sessions.
  - `agent-suggested`: list + suggested run prompt.
  - `agent-driven`: open via configured driver tool.

## Prod risk

<!-- Reference doc/prod/. List relevant known-bugs, structural-risks, watchlist entries. -->

- Known bug touched: `<BUG-id or none>`
- Structural risk: `<RISK-id or none>`
- Watchlist signal: `<WATCH-slug or none>`
- Incident replay risk: `<reference to incident or none>`
