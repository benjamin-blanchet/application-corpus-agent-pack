---
type: prod-service-flows
status: draft
confidence: unknown
source: pack
last_validated:
title: "Service Flows"
description: "This file captures inbound and outbound runtime flows observed through Dynatrace/APM or another verified production source."
---

# Service Flows

This file captures inbound and outbound runtime flows observed through Dynatrace/APM or another verified production source. Use it to reconcile production behavior with API, integration, messaging and persistence catalogs.

> **Reconcile against the sanctuarized boundary contract.** That contract
> describes implementation at an analyzed revision. These flows describe a
> named environment, deployed revision and observation window. A difference
> can be deployment lag, configuration/feature flags or contract drift; retain
> both scoped claims and open a reconciliation item.

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
