# Procedure — Dynatrace runtime architecture focus

Loaded by `production-discovery` when Dynatrace is available and the
operator wants a runtime architecture view (not only a reliability summary).

## Required coverage

| Area | Evidence to collect | Corpus routing |
|---|---|---|
| Runtime entity map | services, processes, hosts, containers, workloads, tags, management zones, environments | `doc/prod/COMPONENT_MAP.md`, `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Inbound flows | callers, entry services, entry endpoints, protocols, request volume, error rate, latency | `doc/prod/SERVICE_FLOWS.md`, P5 API/integration catalogs |
| Outbound flows | downstream services, databases, queues, external APIs, protocols, volume, failure rate, latency | `doc/prod/SERVICE_FLOWS.md`, `doc/project/integrations/README.md` |
| Service-to-service dependencies | dependency graph around the product, upstream/downstream neighbors, fan-in/fan-out | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Logs sampling | representative application errors/warnings and correlation ids over multiple windows | feature `OPERATIONS.md`, bugs, risks, playbooks |
| Metrics sampling | traffic, latency, failure rate, saturation, restarts, resource pressure | `doc/prod/BASELINES.md`, `doc/prod/INFRA_STATE.md` |
| Trace sampling | representative successful and failing transactions, hot paths, slow spans | feature workflows, architecture diagrams, playbooks |
| Batch and async signals | scheduled jobs, consumers, queues, lag, retries, long runtimes, failed executions | `doc/prod/BATCH_HEALTH.md`, batch index |
| Ecosystem inventory | adjacent products, shared services, gateways, identity providers, data platforms, partner systems | `doc/prod/RUNTIME_ARCHITECTURE.md`, integration catalog |

Run at least three bounded windows when the tools support them
(`24h`, `7d`, `30d`). If 30d is too expensive or blocked by tenant policy,
record the exact limitation and use the longest safe available window.
Do not replace this with a single 24h glance unless the operator explicitly
accepts a shallow production pass.

## Reconcile observed production flow with P5 catalogs

- observed inbound flow missing from API catalog → update the catalog or record a contradiction;
- observed outbound dependency missing from integration / messaging / persistence catalog → update the catalog or record a contradiction;
- code-declared dependency absent from Dynatrace → record as `not_observed_in_window`, not as unused;
- Dynatrace entity with no repository mapping → ask a blocking question or record as `unmapped_runtime_entity`.

## Per-brick runtime evidence

For each critical/high brick in `doc/_meta/brick-inventory.yaml`, capture
whether Dynatrace provides runtime evidence:

| Brick | Runtime evidence | Signal window | Completeness | Follow-up |
|---|---|---|---|---|
| `<brick>` | `<entity/flow/log/metric/trace>` | `<24h/7d/30d>` | `none/partial/covered` | `<question/update>` |
