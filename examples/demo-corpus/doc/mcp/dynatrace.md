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

## Availability

Unknown until configured for the target team.

Before Dynatrace consumption, run `sources/mcp-readiness-check` and update `doc/_meta/mcp-readiness.md`.

The agent must verify:

- Dynatrace MCP server is running in the IDE context;
- Dynatrace tools are attached to the current agent/session;
- authentication allows read-only smoke tests;
- app/service/entity/environment mapping is known or discoverable.

If the MCP tools are not attached, do not treat Dynatrace as nonexistent. Record `not_attached_to_agent` and ask the operator to attach the tools or explicitly accept no production discovery.

## Local conventions

| Item | Value | Source | Confidence |
|---|---|---|---|

## Useful queries or lookup patterns

Use [dynatrace-query-catalog.md](./dynatrace-query-catalog.md) as the serious-kickstart checklist, then record verified final queries here. Do not invent fields, service names or dashboards.

## Common pitfalls

- Check source availability before relying on it.
- Record query limits and unsupported fields.
- Save reusable query patterns in this file after validation.


## Kickstart production discovery

Use this section to record verified Dynatrace conventions needed for the initial production discovery / rapport d'étonnement.

Do not run Dynatrace-backed production discovery unless readiness is `available` or the operator explicitly approves a partial/unverified pass. Do not infer production health from repository code.

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
