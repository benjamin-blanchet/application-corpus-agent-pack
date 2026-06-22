---
type: meta
status: draft
confidence: unknown
source: pack
last_validated:
title: "MCP Source Wizard"
description: "Use this file early in corpus kickstart to inventory standard and custom MCP sources."
---

# MCP Source Wizard

Use this file early in corpus kickstart to inventory standard and custom MCP sources.

This is not the readiness result. It is the source discovery questionnaire. Readiness is tracked in `doc/_meta/mcp-readiness.md`.

## Wizard Status

| Field | Value |
|---|---|
| Wizard status | not_started |
| Last run | |
| Operator | unknown |
| Required before continuing | unknown |

## Minimum Questions

| Question | Answer | Status |
|---|---|---|
| Is there a Jira MCP/tool for this repo? Project keys or boards? | unknown | pending |
| Is there a Confluence MCP/tool? Spaces or page roots? | unknown | pending |
| Is there a Dynatrace MCP/tool? Environment, tenant, service/entity naming? | unknown | pending |
| Is there a Git hosting MCP/tool beyond local Git? | unknown | pending |
| Are there custom MCP servers for logs, APIs, DBs, incidents, CI/CD, deployments, feature flags, business data or dashboards? | unknown | pending |
| Are there non-MCP sources such as SQL databases, APIs, exports, files or dashboards? | unknown | pending |
| Which sources should be used during kickstart, handover, incident analysis, spec work or implementation support? | unknown | pending |
| Are there privacy, security or data handling restrictions? | unknown | pending |

## Source Candidates

| Source | Type | Category | Expected use | Known mapping | IDE MCP status | Next action |
|---|---|---|---|---|---|---|
| Jira | standard MCP | project-activity | kickstart | unknown | readiness pending | verify server/tools and project key |
| Confluence | standard MCP | documentation | kickstart | unknown | readiness pending | verify server/tools and spaces |
| Dynatrace | standard MCP | metrics/traces | production discovery | unknown | readiness pending | verify server/tools and entity mapping |

## Custom MCP Candidates

| Source | Category | Owner | Expected use | Restrictions | Next action |
|---|---|---|---|---|---|
| | | | | | |

## Non-MCP Source Candidates

| Source | Method | Category | Expected use | Restrictions | Next action |
|---|---|---|---|---|---|
| | | | | | |

## Sources Required Before Continuing

| Source | Why required | Blocking area | Operator action |
|---|---|---|---|
| | | | |

## Sources That Can Wait

| Source | Why it can wait | Follow-up |
|---|---|---|
| | | |

## Per-Brick Source Questions

Use this section when a critical/high brick cannot become actionable without evidence outside repository/Jira/Confluence/Dynatrace.

| Brick | Missing evidence | Candidate MCP/non-MCP source | Required for priority-scope adoption? | Status | Next action |
|---|---|---|---|---|---|
| | | | | | |

## Privacy / Security Notes

Do not store secrets or credentials here. Record only setup status, source names, owners, scopes and restrictions.
