---
type: mcp-reference
status: active
confidence: confirmed
source: pack
last_validated:
---

# MCP Readiness

Use this file before consuming Jira, Confluence, Dynatrace or any other MCP-backed source.

The goal is to avoid silent fallback. If an MCP source is expected but not available to the current IDE agent session, the corpus must say so clearly.

Before readiness checks, use the MCP source wizard when source inventory is incomplete:

```text
doc/_meta/mcp-source-wizard.md
```

## Required operator checkpoint

Before MCP consumption, the `Corpus` agent should say:

```text
MCP readiness checkpoint
I am about to use MCP sources for Jira/Confluence/Dynatrace evidence.
Please verify in the IDE that the MCP servers are running and that their tools are attached to this agent/session.
I will run read-only smoke tests and record the exact availability status before using or skipping each source.
```

## VS Code / Copilot checklist

| Check | Expected result |
|---|---|
| MCP server configured | The server appears in the IDE MCP configuration. |
| MCP server running | The server is started and reachable from the IDE. |
| Tools attached to agent | The current Copilot agent/session exposes the MCP tools. |
| Authentication valid | Read-only calls do not fail because of auth. |
| Scope mapped | Jira project keys, Confluence spaces and Dynatrace entities/environments are known or discoverable. |

## Source wizard

Ask early whether custom MCP servers exist for:

- logs;
- APIs;
- databases;
- incidents;
- CI/CD;
- deployments;
- feature flags;
- business data;
- dashboards;
- internal documentation.

Record candidates in `doc/_meta/mcp-source-wizard.md`, then run readiness checks only for the sources that are expected or required.

## Readiness statuses

| Status | Meaning |
|---|---|
| `available` | Server/tool is visible to the agent and a read-only smoke test succeeded. |
| `available_unverified` | Tool appears configured, but no safe smoke test could be run. |
| `not_attached_to_agent` | The IDE/session does not expose the expected MCP tools to the agent. |
| `server_not_running` | The expected MCP server appears configured but unreachable. |
| `not_configured` | No evidence that the source is configured. |
| `permission_blocked` | Tool is visible but the read-only test failed due to permissions. |
| `mapping_unknown` | Tool works, but project/app mapping is unknown. |

## Minimum smoke tests

| Source | Smoke test | Safe limit |
|---|---|---|
| Jira | List accessible projects or run a bounded JQL query after project key is known. | limit 10-50 |
| Confluence | List spaces or search for the app name. | limit 10-20 |
| Dynatrace | List entities/environments or run a tiny bounded query after entity mapping is known. | shortest useful time window |
| GitHub (peer corpus) | `get_repository` on a declared peer, or `get_file_contents` of its `doc/README.md`. | single file / single repo |

## Decision rule

If a source is expected but unavailable, do not silently move on.

Record:

- exact status;
- what was tested;
- what failed or was missing;
- whether the related discovery is blocked or partial;
- what the operator must configure in the IDE.

Then continue only with a clearly labeled reduced scope.
