# Procedure — broad read-only Dynatrace bundle

Loaded by `production-discovery` when Dynatrace is available **and** the
code-first guard authorizes full mode (`code_analysis_status: covered`).

Mandatory read before this procedure: `doc/mcp/dynatrace-query-catalog.md`
for the query-intent checklist.

## When this procedure escalates to temporal correlation

If the bundle surfaces errors, latency, saturation, restarts, dependency
failures, batch failures or unmapped runtime entities, load
`procedure-temporal-escalation.md` before calling production coverage
complete.

## The bundle (broad but bounded, read-only)

Use `doc/mcp/dynatrace-query-catalog.md` as the query-intent checklist.
Adapt exact syntax to the available Dynatrace MCP tools and tenant
capabilities, but cover these intents:

| Query intent | Window | Limit / bound | Evidence to record |
|---|---|---|---|
| Discover app / service entities | current | bounded by app/service filter | entity ids, names, environments, tags |
| Service health overview | last 24h | top services only | request count, failure rate, latency summary |
| Top errors | last 7d | top 20-50 | error type, service, count, example trace/log ids if safe |
| Latency hotspots | last 7d | top 20-50 | endpoint/service, p95/p99, volume |
| Dependency failures | last 7d | top 20-50 | downstream, caller, failure type |
| Availability / restarts / crashes | last 7d | bounded entities | process/service restarts, crashes, availability gaps |
| Batch / consumer / job signals | last 7d | bounded by naming/tags | failures, retries, long runtimes |
| Saturation / resource signals | last 7d | bounded entities | CPU, memory, thread/connection pool, GC if visible |
| Trend comparison | last 30d | aggregate only | worsening / improving signals |
| Monitoring gaps | current | app scope | missing services, unmapped names, absent dashboards |

Record every query / filter, time window, limit and limitation in
`doc/_meta/discovery-coverage.md` and in the production snapshot.

**Do not run unbounded tenant-wide queries.** If the app mapping is
unknown, ask a blocking question via `governance/blocking-question-loop`
before querying broadly.
