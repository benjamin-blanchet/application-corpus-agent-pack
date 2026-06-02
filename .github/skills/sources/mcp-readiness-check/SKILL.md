---
name: mcp-readiness-check
category: sources
description: "Prevent silent degradation when Jira, Confluence, Dynatrace or other MCP sources are expected but not actually available to the agent in the IDE."
---
# MCP Readiness Check

## Purpose

Prevent silent degradation when Jira, Confluence, Dynatrace or other MCP sources are expected but not actually available to the agent in the IDE.

This skill makes MCP consumption explicit: the agent must announce that it is about to use MCP, verify that the servers and tools are available, run a minimal read-only smoke test when possible, then report a clear status before choosing the next path.

## Why this matters

VS Code and Copilot can be ambiguous about tool availability. A server may be configured but not running, running but not exposed to the current agent, or exposed but missing required tools. If the agent simply decides "MCP unavailable" and continues with repository-only evidence, the generated corpus may miss critical Jira, Confluence or Dynatrace knowledge.

## Mandatory first reads

1. `doc/mcp/INDEX.md`
2. `doc/mcp/MCP_READINESS.md`
3. `doc/_meta/mcp-source-wizard.md`
4. `doc/mcp/atlassian.md`
5. `doc/mcp/dynatrace.md`
6. `doc/mcp/atlassian-query-catalog.md`
7. `doc/mcp/dynatrace-query-catalog.md`
8. `doc/_meta/information-sources.yaml`
9. `doc/_meta/mcp-readiness.md`
10. `doc/_meta/kickstart-progress.md` when kickstart is active

If `doc/_meta/mcp-source-wizard.md` is still `not_started` and the kickstart is early, run `sources/mcp-source-wizard` before readiness checks.

## Required announcement

Before consuming MCP evidence, say plainly:

```text
MCP readiness checkpoint
I am about to use MCP sources for Jira/Confluence/Dynatrace evidence.
Please verify in the IDE that the MCP servers are running and that their tools are attached to this agent/session.
I will run read-only smoke tests and record the exact availability status before using or skipping each source.
```

## Required statuses

| Status | Meaning |
|---|---|
| `available` | Server/tool is visible to the agent and a read-only smoke test succeeded. |
| `available_unverified` | Tool appears configured, but no safe smoke test could be run. Do not use for strong claims. |
| `not_attached_to_agent` | The IDE/session does not expose the expected MCP tools to the agent. |
| `server_not_running` | The expected MCP server appears configured but unreachable. |
| `not_configured` | No evidence that the source is configured. |
| `permission_blocked` | Tool is visible but the read-only test failed due to permissions. |
| `mapping_unknown` | Tool works, but project/app keys, spaces, entities or environment mapping are unknown. |

## Minimum MCP readiness matrix

Update `doc/_meta/mcp-readiness.md` with at least:

| Source | Required for | Expected server/tool | Status | Smoke test | Next action |
|---|---|---|---|---|---|
| Jira | project activity discovery | Atlassian/Jira MCP tools | unknown | pending | verify IDE tools |
| Confluence | documentation discovery | Atlassian/Confluence MCP tools | unknown | pending | verify IDE tools |
| Dynatrace | production discovery | Dynatrace MCP tools | unknown | pending | verify IDE tools |

## Smoke test rules

Smoke tests must be read-only and small.

Recommended tests:

- Jira: list accessible projects, inspect one configured project key, or run a bounded JQL query after project key is known.
- Confluence: list accessible spaces or search for the application name with a small limit.
- Dynatrace: list accessible environments/entities or run a tiny bounded query against the app entity after mapping is known.

Never run write operations, transitions, comments, ticket updates, page publishes, dashboard changes, tag changes, deploys, restarts or broad unbounded queries.

## No Silent Fallback Rule

If Jira, Confluence or Dynatrace is expected but unavailable:

1. Do not silently continue as if the source does not matter.
2. Record the exact status in `doc/_meta/mcp-readiness.md`.
3. Add a precise open question or setup action in `doc/_meta/open-questions.md`.
4. Update `doc/_meta/kickstart-progress.md`.
5. In the agent response, state what could not be consumed and what corpus areas are blocked or weaker because of it.
6. Continue only with clearly labeled repository-only work, or pause for operator setup when the missing MCP is required for the requested discovery.

## Source-specific gates

### Jira / project activity

Do not run `exploration/project-activity-discovery` from Jira unless Jira status is `available` or the operator explicitly accepts a partial discovery.

If Jira is unavailable, the agent may still use local Git evidence, but must label the activity snapshot as partial and explain the missing Jira dimension.

### Confluence / documentation

Do not claim business rules, architecture decisions or historical rationale from Confluence unless Confluence status is `available` and the exact page/search source is recorded.

If Confluence is unavailable, record that the corpus is code-first and may miss business or historical context.

### Dynatrace / production

Do not run `exploration/production-discovery` from Dynatrace unless Dynatrace status is `available` or a different registered production source is available.

If Dynatrace is unavailable, mark production discovery as unavailable or partial. Do not infer production health from code.

## Operator-facing response format

Use this format after readiness checks:

```text
MCP readiness result
- Jira: available | not_attached_to_agent | ...
- Confluence: available | not_attached_to_agent | ...
- Dynatrace: available | not_attached_to_agent | ...

Impact
- Project activity discovery:
- Documentation discovery:
- Production discovery:

Next
- ...
```

## Durable updates

Update:

- `doc/_meta/mcp-readiness.md`
- `doc/_meta/information-sources.yaml`
- `doc/_meta/open-questions.md`
- `doc/_meta/kickstart-progress.md`
- `doc/_meta/kickstart-report.md` when kickstart is active
- `doc/_meta/interaction-history/` when the setup created friction or operator actions

## Anti-patterns

Do not:

- assume a missing tool means the source does not exist;
- choose a repository-only path without telling the operator what evidence is missing;
- create durable claims from Jira, Confluence or Dynatrace without recording source and status;
- ask the same broad MCP setup question repeatedly without updating readiness files;
- bury MCP failures inside long prose.
