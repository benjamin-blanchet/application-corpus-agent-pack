---
name: production-temporal-correlation
category: exploration
description: "Run repeated production discovery over multiple recent time slices, then cross those signals with source code, P5 catalogs, runtime architecture, deployments and corpus bricks to understand what is actually happening and where to deepen the corpus next."
---
# Production Temporal Correlation

## Purpose

Run repeated production discovery over multiple recent time slices, then cross those signals with source code, P5 catalogs, runtime architecture, deployments and corpus bricks to understand what is actually happening and where to deepen the corpus next.

This skill turns production analysis from a single snapshot into an investigation cycle.

## When to use

Use this skill when:

- the operator asks to analyze production seriously;
- Dynatrace/APM/log sources are available during kickstart;
- a production snapshot contains errors, latency, memory pressure, restarts, dependency failures, batch failures or unknown runtime entities;
- a feature/API/batch/integration is important in production but thin in the corpus;
- `exploration/dynatrace-runtime-architecture` finds observed flows that do not match code-derived catalogs;
- the operator asks for memory stats, reliability analysis, top used features, batch health, code/prod reality or production problems over the last days.

If Dynatrace or another production source is required but unusable in this runtime, run `sources/runtime-source-probe`, ask a blocking question and do not replace this skill with code-only speculation.

## Code-first guard (mandatory pre-flight, anti-loop)

This skill is **the highest-loop-risk skill in the pack**: its mission is to repeat production discovery over multiple time slices, and it correlates findings across code, catalogs, deployments and prior windows. Without a covered code analysis pipeline, those correlations are speculative.

Per `foundations/core-rules` § Code-first principle and `foundations/core-discipline` Rule 5, before executing read `doc/_meta/code-pipeline-state.yaml`:

| `code_analysis_status` | Allowed scope of this skill |
|---|---|
| `covered` | Full scope. Temporal correlation runs as documented — multiple time slices, cross-references with code, deployments and corpus bricks. |
| `partial` (P1–P4 covered, P5 not covered) | **Two-slice mode at most.** Compare current vs. one previous window. No correlation against P5 catalogs (they do not exist yet). No third pull. Findings `confidence: probable`. |
| `partial` (P5 not covered) or worse | **Skill must not run.** Surface the gap. Propose `pipeline/p5-cross-cutting-extraction` as the next action. Temporal correlation without a code-derived integration/messaging/persistence map is not investigation — it is pattern-matching on noise. |

In every reduced-scope execution, the deliverable's first paragraph must state the code-coverage gap and the loop count enforced (e.g. *"Code pipeline at P3. Only one prior window compared; correlation against code catalogs deferred until P5 is covered."*).

Anti-loop addendum: even when code is covered, this skill should be invoked **once per operator request**, not as a recurring auto-action. If a previous run already produced a temporal correlation artefact in the current session, do not produce a second one in the same session without explicit operator pivot. Production looping is the failure mode this guard explicitly prevents.

## Mandatory reads

1. `doc/_meta/information-sources.yaml` and `doc/_meta/source-coverage.yaml`
2. `doc/_meta/discovery-coverage.md`
3. `doc/_meta/brick-inventory.yaml`
4. `doc/_roadmap/CORPUS_ROADMAP.yaml`
5. `doc/_runs/RUN_LEDGER.md`
6. `doc/project/apis/CATALOG.md`
7. `doc/project/architecture/INTEGRATION_MAP.md`
8. `doc/project/services/MESSAGING.md`
9. `doc/project/architecture/PERSISTENCE.md`
10. `doc/prod/RUNTIME_ARCHITECTURE.md`
11. `doc/prod/SERVICE_FLOWS.md`
12. `doc/prod/BASELINES.md`
13. `doc/prod/BATCH_HEALTH.md`
14. `doc/mcp/dynatrace-query-catalog.md`

## Default time slices

Use bounded read-only windows. Adapt to tenant retention and operator context, but start with this set when supported:

| Slice | Purpose |
|---|---|
| `last_2h` | current incident-like anomalies and active saturation |
| `last_24h` | current production day |
| `previous_24h` | compare with yesterday / previous business cycle |
| `last_3d` | recent recurring patterns |
| `last_7d` | weekly jobs, weekend/weekday differences, repeated failures |
| `last_30d` | rare flows, monthly jobs, release trend, low-volume dependencies |
| `business_hours_7d` | user-facing daytime behavior when relevant |
| `night_batch_windows_7d` | batch/async behavior when relevant |
| `around_recent_deployments_30d` | before/after release comparison when deploy markers are visible |

If a slice is unsupported, record `unsupported` with the exact reason. Do not silently collapse to a single 24h query.

## Signal bundle per slice

For each selected slice, collect what is available and relevant:

| Signal family | Examples |
|---|---|
| Traffic | request count, top endpoints/transactions, top callers |
| Errors | top errors, exception types, HTTP status, failed traces, log patterns |
| Latency | p95/p99 hotspots, slow spans, slow downstream calls |
| Saturation | CPU, memory, GC, thread pools, connection pools, queue lag |
| Stability | restarts, crashes, availability gaps, deployment markers |
| Dependencies | downstream failures, database latency, external API errors, messaging issues |
| Batch/async | job duration, failures, retries, lag, missed schedules |
| Blind spots | missing traces/logs/metrics, unmapped entities, naming mismatches |

Bound every query by app entities, tags, management zone, environment or validated service names.

## Correlation matrix

Create or update a temporal correlation analysis under:

```text
doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md
```

The analysis must include:

```markdown
## Time Slices

| Slice | Query/filter | Window | Status | Notes |
|---|---|---|---|---|

## Signal Matrix

| Signal | Slice | Runtime entity | Volume/severity | Evidence | Compared with |
|---|---|---|---|---|---|

## Code Cross-Reference

| Runtime signal | Code/catalog expectation | Source files/catalogs checked | Match status | Follow-up |
|---|---|---|---|---|

## Deployment / Batch / Traffic Correlation

| Signal | Candidate correlation | Evidence | Confidence | Next action |
|---|---|---|---|---|

## Durable Knowledge Created Or Updated

| Finding | Corpus destination | Status |
|---|---|---|

## Open Questions
```

## Code cross-reference rules

For every high-value signal:

1. Map runtime entity -> repository component using `COMPONENT_MAP.md`, P2 modules and P5 catalogs.
2. Map endpoint/operation/job/topic -> API, feature, batch, consumer or integration brick.
3. Read the relevant code/config/test files, not just corpus summaries, when the mapping is uncertain or the signal is severe.
4. Classify the relationship:
   - `matches_code_expectation`
   - `prod_observed_not_in_catalog`
   - `code_declared_not_observed_in_window`
   - `prod_signal_requires_code_deep_dive`
   - `unmapped_runtime_entity`
   - `contradiction_needs_operator`
5. Update the canonical corpus location, not only the analysis file.

## Required corpus routing

| Finding | Destination |
|---|---|
| recurring confirmed failure | `doc/prod/known-bugs/BUG-<id>-<slug>.md` |
| systemic weakness | `doc/prod/structural-risks/RISK-<id>-<slug>.md` |
| repeated investigation path | `doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md` |
| signal worth watching | `doc/prod/watchlist/WATCH-<slug>.md` |
| batch/consumer observation | `doc/prod/BATCH_HEALTH.md` and `doc/project/batchs/<batch>/` |
| service/API flow observation | `doc/prod/SERVICE_FLOWS.md` and `doc/project/apis/CATALOG.md` |
| runtime component mapping | `doc/prod/COMPONENT_MAP.md` |
| infra/resource state | `doc/prod/INFRA_STATE.md` |
| baseline/trend | `doc/prod/BASELINES.md` |
| feature-specific operation | `doc/project/features/<feature>/OPERATIONS.md` |
| source/catalog contradiction | `doc/_meta/reconciliation-ledger.yaml` |
| next deep-dive branch | `doc/_roadmap/CORPUS_ROADMAP.yaml` and graph files |

## Interaction rules

Ask the operator when:

- app/entity/environment mapping is ambiguous;
- a severe signal has multiple plausible root causes;
- a runtime entity is unmapped to the repository;
- a deployment/release correlation appears likely but release context is missing;
- a query would become too broad without a better app/service filter.

For useful but non-blocking questions, record them in `doc/_meta/blocking-questions.md` or `doc/_meta/open-questions.md` with the affected brick.

## Completion criteria

This skill is complete for the run only when:

- every selected slice is `covered`, `partial`, `blocked` or `unsupported` with a reason;
- high-value signals have a code/catalog cross-reference;
- findings are routed to canonical corpus files;
- graph and roadmap are updated for new production/code branches;
- `doc/_indexes/by-production-signal.md` is refreshed;
- the run ledger records sources, slices, durable updates and next action.

## Anti-patterns

- Analyze only 24h and call it a multi-day production review.
- Summarize top errors without mapping them to code/catalog/brick ownership.
- Treat logs as root causes without code or runtime-flow evidence.
- Copy raw sensitive logs into the corpus.
- Ignore deployment, batch-window or traffic-shape correlation.
- Leave findings only in a chat answer or one snapshot file.
