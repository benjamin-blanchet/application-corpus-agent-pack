# Sources & MCP

← [Back to README](../README.md)

The code is the spine of the corpus; every other source enriches it and is reconciled back against code (see the ranking in [Corpus model](corpus-model.md#core-principle-code-is-the-source-of-truth)).

## MCP readiness — no silent fallback

Early in kickstart, `sources/mcp-source-wizard` asks about standard MCP, custom MCP and non-MCP evidence sources, and updates:

```text
doc/_meta/mcp-source-wizard.md
```

Before Jira, Confluence, Dynatrace or custom MCP evidence is consumed, the `Corpus` agent uses `sources/mcp-readiness-check` and updates:

```text
doc/mcp/MCP_READINESS.md
doc/_meta/mcp-readiness.md
```

This prevents silent fallback when the MCP tools are not actually reachable from the current session — such a source is recorded as blocked, never quietly imagined.

Where a server comes from depends on the surface, and the readiness check asks for the right remediation on each:

| Surface | Where MCP comes from |
|---|---|
| VS Code, JetBrains, Eclipse, Xcode, Visual Studio | the IDE attaches the servers to the session |
| Copilot cloud agent (github.com), Copilot app, Copilot CLI | the agent profile's `mcp-servers` frontmatter, or org-level provisioning |

The pack ships no server configuration — your sources are yours — but the status recorded is the same on every surface, and it is established by a read-only smoke test rather than by assumption.

Bounded query catalogs (`doc/mcp/atlassian-query-catalog.md`, `doc/mcp/dynatrace-query-catalog.md`) keep the agent's queries scoped and repeatable.

## Generic information sources

The pack supports more than predefined tools. Register SQL log databases, APIs, file exports, dashboards, CI/CD data, manual evidence and internal tools in `doc/_meta/information-sources.yaml`. Use `/sources/information-source-onboarding` before using a new source for durable corpus claims.

Jira, Confluence and Dynatrace are examples, not a fixed list: **any MCP server is eligible as a source**, and any non-MCP source can be registered too.

## Project activity discovery

During operator-led kickstart, `Corpus` can use `exploration/project-activity-discovery` when Jira, Git/source-control, PR or CI evidence is available. The goal is a grounded project activity snapshot — not individual performance scoring.

CI/CD is handled explicitly by `exploration/ci-cd-activity-discovery`: the agent inventories Jenkins, GitHub Actions, GitLab CI, Azure Pipelines and similar files, classifies pipelines as active, likely active, stale, legacy or unknown, scans at least the last 100 commits / recent 90 days when local Git history is available, and maps changed areas back to active corpus bricks.

## Safe operation guardrails

Agents are read-only by default for external systems and high-risk actions. Use `/governance/safe-operation-guardrails` before destructive, broad or external side-effect operations. Prefer dry-runs, diffs, SELECT-only queries, previews and corpus update candidates.
