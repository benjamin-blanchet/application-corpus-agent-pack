# Sources & Runtime Access

← [Back to README](../README.md)

Code is the structural spine of the corpus. Other sources are reconciled by
claim scope: implementation, runtime, intent or history, with revision and
environment attached where relevant. See
[Corpus model](corpus-model.md#core-principle-authority-follows-claim-scope).

## Three separate source truths

Early in kickstart, `sources/mcp-source-wizard` asks about standard MCP, custom MCP and non-MCP evidence sources. Confirmed declarations are registered in:

```text
doc/_meta/information-sources.yaml
```

The pack keeps three concepts separate:

- `doc/_meta/information-sources.yaml` contains durable, transport-neutral source contracts: intent, policy, mappings and bounded probe definitions;
- `sources/runtime-source-probe` observes what the current runtime can actually use, but emits no global current-state file;
- `doc/_meta/source-coverage.yaml` records historical evidence and freshness, with `doc/_meta/discovery-coverage.md` as its human-readable coverage view.

This prevents silent fallback without fossilizing a transient IDE state. A failed runtime attempt can block the current run, but it does not erase valid evidence collected earlier.

Where a server comes from depends on the surface, and the runtime probe asks for the right remediation on each:

| Surface | Where a runtime capability comes from |
|---|---|
| VS Code, JetBrains, Eclipse, Xcode, Visual Studio | the IDE attaches the servers to the session |
| Copilot cloud agent (github.com), Copilot app, Copilot CLI | the agent profile's `mcp-servers` frontmatter, or org-level provisioning |

The pack ships no server configuration — your sources are yours. Each runtime observation is established by a bounded read-only probe and is meaningful only at its timestamp.

Transport selection is durable policy: every source declares `alternative` or
`complementary` semantics, priorities, explicit fallbacks and consent needs.
The observation proves required tools plus the applied limit and observed count.
`--allow-partial` can acknowledge only an explicitly selected optional source;
it never bypasses a required source.

Print a probe plan with:

```bash
node scripts/check-runtime-sources.mjs --source jira --json
```

The resulting observation conforms to `schemas/runtime-source-observation.schema.yaml`; the checker accepts its JSON serialization on stdin or from a temporary file. It may be attached to a dated run record, but never stored as a global "available now" property.

Bounded query catalogs (`doc/mcp/atlassian-query-catalog.md`, `doc/mcp/dynatrace-query-catalog.md`) keep the agent's queries scoped and repeatable.

## Generic information sources

The pack supports more than predefined tools. Register SQL log databases, APIs, file exports, dashboards, CI/CD data, manual evidence and internal tools in `doc/_meta/information-sources.yaml`. Use `/sources/information-source-onboarding` before using a new source for durable corpus claims.

Jira, Confluence and Dynatrace are examples, not a fixed list: **any MCP server is eligible as a source**, and any non-MCP source can be registered too.

## Project activity discovery

During operator-led kickstart, `Corpus` can use `exploration/project-activity-discovery` when Jira, Git/source-control, PR or CI evidence is available. The goal is a grounded project activity snapshot — not individual performance scoring.

CI/CD is handled explicitly by `exploration/ci-cd-activity-discovery`: the agent inventories Jenkins, GitHub Actions, GitLab CI, Azure Pipelines and similar files, classifies pipelines as active, likely active, stale, legacy or unknown, scans at least the last 100 commits / recent 90 days when local Git history is available, and maps changed areas back to active corpus bricks.

## Safe operation guardrails

Agents are read-only by default for external systems and high-risk actions. Use `/governance/safe-operation-guardrails` before destructive, broad or external side-effect operations. Prefer dry-runs, diffs, SELECT-only queries, previews and corpus update candidates.
