---
type: meta
status: draft
confidence: unknown
source: pack
last_validated:
---

# MCP Readiness

Use this file to track whether MCP-backed sources are available to the current IDE agent session.

Do not treat a source as unavailable until the IDE/server/tool attachment status has been checked.

Run the MCP source wizard first when source availability is unclear:

```text
doc/_meta/mcp-source-wizard.md
```

## Current Readiness Matrix

| Source | Required for | Expected server/tool | Status | Smoke test | Last checked | Next action |
|---|---|---|---|---|---|---|
| Jira | Project activity discovery | Atlassian/Jira MCP tools | unknown | pending | | Verify server is running and tools are attached to the agent. |
| Confluence | Documentation discovery | Atlassian/Confluence MCP tools | unknown | pending | | Verify server is running and tools are attached to the agent. |
| Dynatrace | Production discovery | Dynatrace MCP tools | unknown | pending | | Verify server is running and tools are attached to the agent. |

Add custom MCP sources discovered by the wizard below.

| Custom source | Required for | Expected server/tool | Status | Smoke test | Last checked | Next action |
|---|---|---|---|---|---|---|
| | | | | | | |

## IDE Checklist

| Check | Jira | Confluence | Dynatrace |
|---|---|---|---|
| Server configured | unknown | unknown | unknown |
| Server running | unknown | unknown | unknown |
| Tools attached to current agent/session | unknown | unknown | unknown |
| Authentication works | unknown | unknown | unknown |
| App/project/entity mapping known | unknown | unknown | unknown |

## Impact On Kickstart

| Corpus activity | Dependency | Status | Impact |
|---|---|---|---|
| Project activity discovery | Jira and/or Git/PR/CI | unknown | Do not run Jira-backed discovery until readiness is checked. |
| Documentation discovery | Confluence | unknown | Business and historical context may be missing. |
| Production discovery | Dynatrace or another production source | unknown | Do not infer production health from code. |

## Readiness Notes

- Record exact tool names when visible in the IDE.
- Record read-only smoke test results.
- If unavailable, record whether the problem is configuration, server runtime, tool attachment, authentication or app mapping.

## Operator Setup Actions

| Action | Owner | Status |
|---|---|---|
| Confirm Jira MCP tools are attached to the `Corpus` agent in the IDE. | operator | pending |
| Confirm Confluence MCP tools are attached to the `Corpus` agent in the IDE. | operator | pending |
| Confirm Dynatrace MCP tools are attached to the `Corpus` agent in the IDE. | operator | pending |
