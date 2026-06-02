---
name: dynatrace-runtime-architecture
category: exploration
description: "Use Dynatrace as a first-class source for understanding the production architecture and ecosystem around the product: what actually runs, who calls it, what it calls, which async/batch flows exist, which dependencies are hot or fragile and where runtime evidence contradicts the…"
---
# Dynatrace Runtime Architecture

## Purpose

Use Dynatrace as a first-class source for understanding the production architecture and ecosystem around the product: what actually runs, who calls it, what it calls, which async/batch flows exist, which dependencies are hot or fragile and where runtime evidence contradicts the repository.

This skill complements `exploration/production-discovery`. `exploration/production-discovery` owns the overall production snapshot; this skill owns the deep Dynatrace architecture/flow pass.

## When to use

Use this skill when:

- Dynatrace is available during corpus kickstart;
- the operator asks for a serious/full production analysis;
- `doc/_meta/discovery-coverage.md` shows Dynatrace coverage is `not_started`, `started` or `partial`;
- a critical/high brick is not actionable because runtime flows, logs, metrics, traces, dependencies or batch behavior are missing;
- P5 integration/API/messaging/persistence catalogs need reconciliation against observed production behavior.
- production signals need multi-slice correlation against code, deployments, batch windows or traffic shape.

If Dynatrace is expected but not available to the current IDE agent/session, run `sources/mcp-readiness-check`, ask a blocking question and do not silently continue as if production discovery were optional.

## Code-first guard (mandatory pre-flight)

Per `foundations/core-rules` § Code-first principle and `foundations/core-discipline` Rule 5: runtime architecture is read **against** the code-derived integration map, messaging topology and API catalog (P5 outputs). This skill is therefore most useful **after** P5 is covered. Before executing, read `doc/_meta/code-pipeline-state.yaml`:

| `code_analysis_status` | Allowed scope of this skill |
|---|---|
| `covered` | Full scope. Runtime architecture is reconciled against P5 catalogs, divergences are first-class findings. |
| `partial` with P5 covered | Full scope, but reconciliation is partial (downstream passes P6–P9 may surface code that contradicts the P5 picture later). Mark deliverable as `partial reconciliation`. |
| `partial` with P5 not covered | **Bounded discovery mode.** Map the runtime entity graph and inbound/outbound flows as inventory only. No reconciliation against code (there is no canonical code map yet). No multi-window pulls. All claims `confidence: probable`. Next bounded action: advance code pipeline to P5. |
| `not_started` or `started` | **Skill should not run.** Surface the gap, propose `pipeline/p1-code-tree-inventory` and refuse to produce a deep architecture map without code anchoring — it would be plausible-looking but uninterpretable, and would pollute the corpus with claims that need to be re-validated later. |

In reduced scope, the deliverable's first paragraph must state: *"Code pipeline at <pass>. Runtime architecture is captured as inventory; reconciliation against code catalogs cannot occur until P5 is covered."*

The guard is non-negotiable. Mapping a runtime topology without a code map produces a beautiful diagram that no one can verify or extend.

## Mandatory reads

1. `doc/_meta/mcp-readiness.md`
2. `doc/_meta/discovery-coverage.md`
3. `doc/_meta/brick-inventory.yaml`
4. `doc/project/architecture/diagrams/integration-context.md`
5. `doc/project/architecture/diagrams/integration-flow.md`
6. `doc/project/architecture/diagrams/messaging-topology.md`
7. `doc/project/services/README.md`
8. `doc/project/integrations/README.md`
9. `doc/mcp/dynatrace.md`
10. `doc/mcp/dynatrace-query-catalog.md`
11. `doc/prod/COMPONENT_MAP.md`
12. `doc/prod/RUNTIME_ARCHITECTURE.md`
13. `doc/prod/SERVICE_FLOWS.md`

## Required behavior

1. Announce a Dynatrace MCP checkpoint before querying.
2. Verify that Dynatrace tools are attached to the current IDE agent/session.
3. Map repository/application names to Dynatrace entities, tags, management zones and environments.
4. Run bounded read-only queries only. Never mutate dashboards, tags, management zones, comments, deploy markers or settings.
5. Use multiple windows when supported: 24h, 7d, 30d.
6. Record exact query/filter/window/limit for every durable claim.
7. Reconcile observed flows with code-derived catalogs instead of creating parallel truth.
8. Ask a blocking question when entity mapping or environment scope is ambiguous.
9. When a signal varies by day, hour, batch window or deployment period, invoke `exploration/production-temporal-correlation` before creating a durable root-cause-like claim.

## Minimum architecture bundle

| Area | Expected output |
|---|---|
| Entity scope | verified service/process/host/container/workload ids and names |
| Environment map | production and relevant non-production environments, if visible |
| Runtime ecosystem | upstream callers, downstream services, databases, queues, gateways, identity providers, partner systems |
| Inbound flows | callers, entry services, endpoints/operations, protocols, volumes, failures, latency |
| Outbound flows | dependencies, external APIs, databases, queues, volumes, failures, latency |
| Service graph | one-hop and safe two-hop dependency graph around product entities |
| Logs | representative errors/warnings sampled over 24h, 7d and 30d where available |
| Metrics | request count, failure rate, latency, saturation, restarts, resource pressure |
| Traces | representative successful, failing and slow paths |
| Batch/async | jobs, consumers, queue/topic flows, lag/retry/failure signals |
| Blind spots | missing instrumentation, unmapped names, missing dashboards/tags |

## Temporal correlation handoff

The runtime architecture pass maps what exists. It must hand off to `exploration/production-temporal-correlation` when the question becomes "when and why does this happen?"

Use temporal correlation for current day vs previous day comparison, repeated signals over last 3d/7d, 30d rare-flow or release trend comparison, business-hours vs night/batch-window behavior, memory/resource pressure over time, before/after deployment overlays, and code/prod mismatches that need evidence across more than one window.

## Corpus updates

Update:

```text
doc/prod/RUNTIME_ARCHITECTURE.md
doc/prod/SERVICE_FLOWS.md
doc/prod/COMPONENT_MAP.md
doc/prod/BASELINES.md
doc/prod/INFRA_STATE.md
doc/prod/BATCH_HEALTH.md
doc/prod/snapshots/YYYY-MM-DD-production-discovery.md
doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md
doc/_meta/discovery-coverage.md
doc/_indexes/by-production-signal.md
```

When findings are strong enough, create or update:

```text
doc/prod/known-bugs/BUG-<id>-<slug>.md
doc/prod/structural-risks/RISK-<id>-<slug>.md
doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md
doc/prod/watchlist/WATCH-<slug>.md
```

For every critical/high brick, add runtime evidence to the corresponding feature or brick documentation when relevant. If no runtime evidence is visible, record `not_observed_in_window` with the query window; do not claim the brick is unused.

## Reconciliation rules

- Observed inbound flow missing from P5 API/catalog docs: update catalog or record contradiction.
- Observed outbound dependency missing from integration/messaging/persistence catalog: update catalog or record contradiction.
- Code-declared dependency absent from Dynatrace: mark `not_observed_in_window`.
- Dynatrace entity with no repo mapping: mark `unmapped_runtime_entity` and ask the operator.
- Confluence architecture contradicted by Dynatrace and code: code wins for implementation, Dynatrace wins for runtime presence, Confluence is retained as stale or intent-only evidence.

## Anti-patterns

- Treat Dynatrace as a quick health check only.
- Query only 24h and call production coverage complete.
- Skip inbound/outbound flow mapping.
- Ignore logs/traces because metrics are available.
- Infer production topology from code when Dynatrace is attached.
- Mark production partial without asking for entity/environment mapping.
