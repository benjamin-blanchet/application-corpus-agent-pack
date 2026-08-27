---
type: mcp-reference
status: draft
confidence: unknown
source: pack
last_validated:
title: "Dynatrace / APM"
description: "Unknown until configured for the target team."
---

# Dynatrace / APM

## Runtime access

Before Dynatrace consumption, read its durable contract in
`doc/_meta/information-sources.yaml`, then run `sources/runtime-source-probe`.
The agent must verify:

- Dynatrace MCP server is running in the IDE context;
- Dynatrace capabilities are visible in this runtime observation;
- authentication allows read-only smoke tests;
- app/service/entity/environment mapping is known or discoverable.

If the capability is not visible in this run, do not treat Dynatrace as
nonexistent. Report `not_visible`, ask the operator for the capability or
explicitly accept no production discovery, and do not erase historical
production evidence.

## Local conventions

| Item | Value | Source | Confidence |
|---|---|---|---|

## Useful queries or lookup patterns

Use [dynatrace-query-catalog.md](./dynatrace-query-catalog.md) as the serious-kickstart checklist, then record verified final queries here. Do not invent fields, service names or dashboards.

## Common pitfalls

- Probe this runtime's source capability before relying on it.
- Record query limits and unsupported fields.
- Save reusable query patterns in this file after validation.


## Kickstart production discovery

Use this section to record verified Dynatrace conventions needed for the initial production discovery / rapport d'étonnement.

Do not run Dynatrace-backed production discovery unless the point-in-time
runtime observation is `usable`. If this source is required, absence blocks the
run; partial continuation needs a structured operator waiver. Do not infer
production health from repository code.

| Discovery need | Verified query / lookup pattern | Required filters | Notes |
|---|---|---|---|
| Find monitored entities for the app | unknown | unknown | Do not invent. |
| Discover management zones / tags / environments | unknown | unknown | Do not invent. |
| Map runtime entity graph around the app | unknown | unknown | Do not invent. |
| List inbound callers / entry flows | unknown | unknown | Do not invent. |
| List outbound dependencies / external flows | unknown | unknown | Do not invent. |
| Sample logs over 24h / 7d / 30d windows | unknown | unknown | Do not invent. |
| Sample representative traces | unknown | unknown | Do not invent. |
| List service error hotspots | unknown | unknown | Do not invent. |
| Check latency hotspots | unknown | unknown | Do not invent. |
| Check restarts / crashes / availability | unknown | unknown | Do not invent. |
| Check batch/job/consumer health | unknown | unknown | Do not invent. |
| Check downstream dependency failures | unknown | unknown | Do not invent. |

## Discovery limitations

Record unsupported fields, missing permissions, naming mismatches and known query limits here.
