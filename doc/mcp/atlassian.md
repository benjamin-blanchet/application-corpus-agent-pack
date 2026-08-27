---
type: mcp-reference
status: draft
confidence: unknown
source: pack
last_validated:
title: "Atlassian / Jira / Confluence"
description: "For serious kickstarts, use [atlassian-query-catalog.md](./atlassian-query-catalog.md) as the bounded Jira/Confluence query checklist."
---

# Atlassian / Jira / Confluence

For serious kickstarts, use [atlassian-query-catalog.md](./atlassian-query-catalog.md) as the bounded Jira/Confluence query checklist. Record executed JQL/search terms, counts, fields and pages read in `doc/_meta/discovery-coverage.md`.

## Runtime access

Jira and Confluence are separate logical sources in
`doc/_meta/information-sources.yaml`, even when they share an Atlassian MCP
transport. Before use, run `sources/runtime-source-probe` and verify:

- Atlassian MCP server is running in the IDE context;
- Jira and/or Confluence capabilities are visible in this runtime observation;
- authentication allows read-only smoke tests;
- Jira project keys or Confluence spaces are known or discoverable.

If the tools are not visible in this run, do not treat Jira or Confluence as
nonexistent. Report `not_visible`, ask the operator for the capability or
explicitly accept a partial repository-only pass, and leave historical
coverage unchanged.

## Local conventions

| Item | Value | Source | Confidence |
|---|---|---|---|
| Jira project keys | unknown | | unknown |
| Boards / filters | unknown | | unknown |
| Issue types | unknown | | unknown |
| Release/version fields | unknown | | unknown |
| Components/labels conventions | unknown | | unknown |
| Confluence spaces | unknown | | unknown |
| App aliases / acronyms | unknown | | unknown |
| Related Jira projects | unknown | | unknown |
| Related Confluence spaces | unknown | | unknown |

## Useful queries or lookup patterns

Record verified queries only. Do not invent project keys, fields, service names, board names or dashboards.

Candidate JQL patterns must be validated before reuse:

```text
project = <KEY> AND updated >= -90d ORDER BY updated DESC
project = <KEY> AND statusCategory != Done ORDER BY priority DESC, updated DESC
project = <KEY> AND issuetype in (Bug, Incident) AND updated >= -90d ORDER BY updated DESC
```

For cross-project trajectory discovery, validate app alias searches before reuse. Candidate shapes include:

```text
text ~ "<APP_ALIAS>" AND project not in (<MAIN_KEYS>) ORDER BY updated DESC
text ~ "<APP_ALIAS>" AND issuetype in (Bug, Incident) AND updated >= -180d ORDER BY updated DESC
text ~ "<APP_ALIAS>" AND (labels in (migration, roadmap) OR summary ~ "migration") ORDER BY updated DESC
```

Exact syntax depends on the Jira MCP/tool and tenant fields. Do not save a pattern until it has been tested.

## Project activity discovery

When Jira is available, `exploration/project-activity-discovery` may use it to identify current project themes, active initiatives, defect pressure, aging work, reopened tickets, release focus and work linked to incidents or support.

Keep observations grounded and record the retrieval window.

Do not silently replace Jira-backed discovery with Git-only discovery. If Jira is unavailable, label the output as partial and state the missing Jira dimension.

For serious kickstarts, also run `exploration/atlassian-project-trajectory` when Jira or Confluence is available. The application may be referenced from other Jira projects or Confluence spaces by teams that depend on it, migrate away from it, call its APIs, consume its batches or report incidents against it.

## Common pitfalls

- Probe this runtime's capability before relying on the transport.
- Check MCP server/tool attachment before declaring the source unavailable.
- Ticket text is not automatically ground truth.
- Jira status/category conventions vary by team.
- Record query limits and unsupported fields.
- Do not turn activity discovery into individual performance analysis.
- Save reusable query patterns in this file after validation.
