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
| MCP readiness | [MCP_READINESS.md](./MCP_READINESS.md) | IDE/server/tool attachment checks before consuming MCP evidence. |
| GitHub / source control | [github.md](./github.md) | Repository, PR, issue and code search conventions, **plus the GitHub MCP read-only tools used to read other apps' corpora** (cross-application, via `sources/peer-corpus-access`). |
| Jira / Confluence | [atlassian.md](./atlassian.md) | Work tracking and knowledge-base conventions. |
| Atlassian query catalog | [atlassian-query-catalog.md](./atlassian-query-catalog.md) | Bounded Jira/Confluence query bundle, including cross-project and cross-space trajectory discovery. |
| Dynatrace / APM | [dynatrace.md](./dynatrace.md) | Logs, metrics, traces and DQL conventions when available. |
| Dynatrace query catalog | [dynatrace-query-catalog.md](./dynatrace-query-catalog.md) | Bounded production discovery query bundle for serious kickstarts. |
| ServiceNow | [servicenow.md](./servicenow.md) | Incident/change/service request conventions when available. |
| Custom sources | [custom-sources.md](./custom-sources.md) | Generic source onboarding and consumption rules for SQL, APIs, files, exports and internal tools. |

Before using a connected source, read its local reference file first. For MCP-backed sources, read [MCP_READINESS.md](./MCP_READINESS.md), update `doc/_meta/mcp-readiness.md`, and verify that the MCP server is running and tools are attached to the current IDE agent/session.

If a source is not configured or not attached, do not silently fall back. Mark the exact status in `doc/_meta/mcp-readiness.md` and `doc/_meta/source-inventory.md`, then state which discovery is blocked or partial.


## Project activity sources

Jira/Atlassian and Git/source-control references are used by `exploration/project-activity-discovery` when available. `exploration/atlassian-project-trajectory` expands this to cross-project Jira mentions and cross-space Confluence references. They support project trajectory analysis, not individual performance scoring.


## Generic source registry

All non-standard sources must be registered in `doc/_meta/information-sources.yaml` before agents use them for durable claims.
