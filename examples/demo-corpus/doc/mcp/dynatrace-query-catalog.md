---
type: mcp-query-catalog
status: draft
confidence: unknown
source: pack
last_validated:
title: "Dynatrace Query Catalog"
description: "Use this catalog during `exploration/production-discovery` when Dynatrace MCP is available."
---

# Dynatrace Query Catalog

Use this catalog during `exploration/production-discovery` when Dynatrace MCP is available.

The exact syntax depends on the Dynatrace MCP tools exposed to the IDE session. Do not invent field names. Adapt these intents to the available tool schema, keep every query bounded, and record the final executed query/filter in the production snapshot.

## Required Inputs

| Input | Required | How to obtain |
|---|---|---|
| Environment / tenant | yes | MCP readiness smoke test or operator |
| Application/service search names | yes | repo name, app profile, operator |
| Entity ids | preferred | entity discovery query |
| Tags / management zones | preferred | entity discovery query |
| Time windows | yes | default 24h, 7d, 30d |

If app/entity mapping is unknown, ask a blocking question before any broad query.

## Read-Only Query Bundle

| Step | Intent | Window | Bound | Evidence to record |
|---|---|---|---|---|
| DT-01 | Entity discovery by app/repo/service names | current | limit 50 | entity ids, names, type, environment, tags |
| DT-02 | Service health overview | 24h | services from DT-01 | request count, failure rate, p95/p99 latency |
| DT-03 | Top service errors | 7d | top 20-50 | service, endpoint, error type, count, sample trace/log id if safe |
| DT-04 | Latency hotspots | 7d | top 20-50 | endpoint/service, p95/p99, volume |
| DT-05 | Downstream dependency failures | 7d | top 20-50 | caller, dependency, protocol, failure type |
| DT-06 | Availability / restarts / crashes | 7d | entities from DT-01 | crashes, restarts, downtime, impacted process |
| DT-07 | Batch / consumer / job signals | 7d | names from P3/P5 + tags | failed jobs, lag, retries, long runtimes |
| DT-08 | Saturation/resource signals | 7d | entities from DT-01 | CPU, memory, GC, pools, threads, connections |
| DT-09 | Trend comparison | 30d | aggregate only | worsening/improving failure and latency signals |
| DT-10 | Monitoring gaps | current | app scope | missing services, unmapped repo components, naming mismatch |

## Runtime Architecture Query Bundle

Run this bundle when Dynatrace is available during serious corpus initialization. It is designed to understand production architecture and the product ecosystem, not only detect incidents.

| Step | Intent | Window | Bound | Evidence to record |
|---|---|---|---|---|
| DT-ARCH-01 | Management zones / tags / environment scoping | current | app/product/team filters | tenant scope, environment names, tags, management zones, ownership hints |
| DT-ARCH-02 | Runtime entity graph around app entities | current | one-hop then two-hop around DT-01 entities where safe | services, processes, hosts, containers, workloads, databases, queues, external services |
| DT-ARCH-03 | Inbound callers and entry services | 24h + 7d | top callers by volume/error/latency | caller, entry service, endpoint/operation, protocol, request count, error rate, latency |
| DT-ARCH-04 | Outbound dependencies and external systems | 24h + 7d | top dependencies by volume/error/latency | dependency, type, protocol, target, request count, error rate, latency |
| DT-ARCH-05 | Low-volume or rare flows | 30d | aggregate, bounded to app entities | monthly/rare jobs, rarely used external dependencies, low-volume APIs |
| DT-ARCH-06 | Service flow comparison across environments | 7d | prod plus known non-prod envs when available | environment-specific missing/excess flows, naming mismatch |
| DT-ARCH-07 | Database and datastore interactions | 7d | app entities only | datastore name/type if visible, caller service, volume, latency, failures |
| DT-ARCH-08 | Messaging and async topology | 7d + 30d | app entities + P5 topic/queue names | producers, consumers, queues/topics, lag/retries/failures if visible |
| DT-ARCH-09 | Trace path samples for main transactions | 7d | small representative samples | successful path, failing path, slow path, hot spans, correlation ids if safe |
| DT-ARCH-10 | Log picking across windows | 24h + 7d + 30d | top errors/warnings plus small samples | log pattern, level, service, count, sample id/message excerpt if safe |
| DT-ARCH-11 | Deployment/release overlays when visible | 30d | app entities only | deploy markers, version changes, signal changes after deploy |
| DT-ARCH-12 | Observability blind spots | current | app scope | entities with no traces/logs/metrics, missing dashboards, missing ownership tags |

## Multi-Window Sampling Rules

Use these windows unless the operator or tenant constraints require another safe bound:

| Window | Purpose | Minimum expected use |
|---|---|---|
| `24h` | Current runtime shape and active anomalies | health overview, current callers/dependencies, top logs |
| `7d` | Weekly operational behavior | errors, latency, dependencies, batch/async, representative traces |
| `30d` | Rare flows and trends | low-volume dependencies, monthly jobs, trend comparison, release overlays |

If a window is unavailable, record `blocked` or `unsupported` in `doc/_meta/discovery-coverage.md` with the exact reason. Do not silently replace multi-window discovery with a single tiny query.

## Temporal Correlation Query Bundle

Use this bundle with `exploration/production-temporal-correlation` when the goal is to understand production problems over several recent days and cross them with code.

| Step | Intent | Window / slice | Bound | Evidence to record |
|---|---|---|---|---|
| DT-TEMP-01 | Current anomaly scan | last 2h | app entities only | active errors, latency, saturation, restarts |
| DT-TEMP-02 | Current day scan | last 24h | app entities only | top traffic/errors/latency/dependencies |
| DT-TEMP-03 | Previous day comparison | previous 24h | same filters as DT-TEMP-02 | changes vs current day |
| DT-TEMP-04 | Recent recurrence | last 3d | top 20-50 signals | repeated patterns and recurring time slots |
| DT-TEMP-05 | Weekly pattern | last 7d | bounded by services/jobs | weekday/weekend, batch, async, dependency recurrence |
| DT-TEMP-06 | Rare/trend pattern | last 30d | aggregate only | low-volume flows, monthly jobs, release trend |
| DT-TEMP-07 | Business-hours slice | business hours over 7d | app entities only | user-facing errors/latency/traffic |
| DT-TEMP-08 | Night/batch slice | configured batch windows over 7d | batch/job/consumer names | failures, duration, lag, retries |
| DT-TEMP-09 | Deployment overlay | around recent deployments over 30d | app entities only | before/after signal changes |
| DT-TEMP-10 | Code-mapping evidence | selected high-value signals | source/P5 catalogs | endpoint/job/topic/component mapping |

Record unsupported slice syntax explicitly. The durable finding is the comparison and code mapping, not the raw query output.

## Output Routing

| Finding | Destination |
|---|---|
| Entity/service mapping | `doc/prod/COMPONENT_MAP.md` |
| Runtime architecture and ecosystem | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Inbound/outbound service flows | `doc/prod/SERVICE_FLOWS.md` |
| Stable baseline | `doc/prod/BASELINES.md` |
| Runtime infra state | `doc/prod/INFRA_STATE.md` |
| Batch/consumer health | `doc/prod/BATCH_HEALTH.md` |
| Recurring confirmed bug | `doc/prod/known-bugs/BUG-<id>-<slug>.md` |
| Systemic reliability weakness | `doc/prod/structural-risks/RISK-<id>-<slug>.md` |
| Repeatable investigation method | `doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md` |
| Signal to watch | `doc/prod/watchlist/WATCH-<slug>.md` |

## Safety Rules

- No writes, tags, dashboard edits, management-zone edits, deploys, restarts or comments.
- No unbounded tenant-wide query. Use app names, entity ids, tags or management zones.
- No production health claim without query/filter/time-window evidence.
- If a query is unsupported by the MCP tool, record `unsupported` in `doc/_meta/discovery-coverage.md`.
