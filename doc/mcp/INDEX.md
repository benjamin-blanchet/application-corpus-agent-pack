---
type: mcp-index
status: active
confidence: confirmed
source: pack
last_validated:
title: "MCP / Connected Sources"
description: "This directory documents how agents should use connected sources and tools for this application."
---

# MCP / Connected Sources

This directory documents how agents should use connected sources and tools for this application.

| Source | File | Purpose |
|---|---|---|
| GitHub / source control | [github.md](./github.md) | Repository, PR, issue and code search conventions, **plus the GitHub MCP read-only tools used to read other apps' corpora** (cross-application, via `sources/peer-corpus-access`). |
| Jira / Confluence | [atlassian.md](./atlassian.md) | Work tracking and knowledge-base conventions. |
| Atlassian query catalog | [atlassian-query-catalog.md](./atlassian-query-catalog.md) | Bounded Jira/Confluence query bundle, including cross-project and cross-space trajectory discovery. |
| Dynatrace / APM | [dynatrace.md](./dynatrace.md) | Logs, metrics, traces and DQL conventions when available. |
| Dynatrace query catalog | [dynatrace-query-catalog.md](./dynatrace-query-catalog.md) | Bounded production discovery query bundle for serious kickstarts. |
| ServiceNow | [servicenow.md](./servicenow.md) | Incident/change/service request conventions when available. |
| Custom sources | [custom-sources.md](./custom-sources.md) | Generic source onboarding and consumption rules for SQL, APIs, files, exports and internal tools. |

Before using a connected source, read its durable contract in
`doc/_meta/information-sources.yaml` and its local reference file. Then use
`sources/runtime-source-probe` to observe the point-in-time capability of the
selected transport.

If the selected transport is unusable in this runtime, do not silently fall
back. Report the observation in the dated run. A required source blocks unless
a structured operator waiver exists; an optional source may produce explicitly
partial discovery. Preserve any valid historical evidence in
`doc/_meta/source-coverage.yaml`.


## Project activity sources

Jira/Atlassian and Git/source-control references are used by `exploration/project-activity-discovery` when available. `exploration/atlassian-project-trajectory` expands this to cross-project Jira mentions and cross-space Confluence references. They support project trajectory analysis, not individual performance scoring.


## Generic source registry

All sources and their allowed transports must be registered in
`doc/_meta/information-sources.yaml` before agents use them for durable claims.
Historical evidence coverage belongs in `doc/_meta/source-coverage.yaml`;
runtime availability never belongs in either file.
