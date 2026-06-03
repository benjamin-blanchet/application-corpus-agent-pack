---
type: prod-service-flows
status: draft
confidence: unknown
source: pack
last_validated:
---

# Service Flows

This file captures inbound and outbound runtime flows observed through Dynatrace/APM or another verified production source. Use it to reconcile production behavior with API, integration, messaging and persistence catalogs.

> **Reconcile against the sanctuarized boundary contract.** The code-derived
> source of truth for inbound/outbound is `doc/architecture/boundary.yaml`
> (`governance/boundary-contract`). These runtime flows are rank-3 evidence:
> corroborate, enrich latency/volume/failure, and surface edges the code missed
> — but when runtime and code disagree, **code wins**. Record a runtime-observed
> edge absent from the contract as a reconciliation item, not as ground truth.

## Inbound Flows

| Caller / source | Entry service | Endpoint / operation | Protocol | Window | Volume | Failure rate | Latency | Evidence |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Outbound Flows

| Source service | Dependency / target | Type | Protocol | Window | Volume | Failure rate | Latency | Evidence |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Async / Messaging Flows

| Producer | Topic / queue / channel | Consumer | Window | Volume / lag | Failure / retry signal | Evidence |
|---|---|---|---|---|---|---|
| | | | | | | |

## Trace Samples

| Transaction / operation | Sample type | Window | Trace / correlation evidence | Path summary | Finding |
|---|---|---|---|---|---|
| | success / failing / slow | | | | |

## Reconciliation With Catalogs

| Flow | Catalog destination | Current status | Next action |
|---|---|---|---|
| | | | |
