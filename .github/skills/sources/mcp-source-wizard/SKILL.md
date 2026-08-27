---
name: mcp-source-wizard
category: sources
lifecycle: init-only
description: "Discover expected MCP and MCP-like information sources early in corpus kickstart, before the agent narrows its work to local repository evidence."
---
# MCP Source Wizard

## Purpose

Discover expected MCP and MCP-like information sources early in corpus kickstart, before the agent narrows its work to local repository evidence.

This wizard asks the operator a short, structured set of questions about Jira, Confluence, Dynatrace and custom sources. It produces a candidate list, then routes each candidate to durable source onboarding, a point-in-time runtime probe or open questions.

## Relationship to other skills

- Use this skill before `sources/runtime-source-probe` when source inventory is incomplete.
- Use `sources/runtime-source-probe` to observe whether a declared transport is usable in this run; never persist that result globally.
- Use `sources/information-source-onboarding` to register sources that should become durable evidence providers.
- Use `governance/discovery-coverage-contract` to define how much evidence must be collected from every available source.
- Use `governance/safe-operation-guardrails` before any query or command that might have side effects or broad data access.

## When to use

Use this skill:

- near the beginning of `foundations/corpus-kickstart`;
- before project activity discovery;
- before production discovery;
- when the operator says the team has custom MCP servers or internal tools;
- when Jira/Confluence/Dynatrace are not enough to represent the application context.
- when a critical/high brick remains `partial` during `actionable/brick-deep-dive`;
- during `actionable/readiness-gate` if missing data prevents developer, functional-analyst or reliability-analyst work.

## Operator-facing introduction

Ask this early:

```text
MCP source wizard
Before I continue the corpus init, I need to inventory MCP and connected sources.
This prevents me from missing Jira/Confluence/Dynatrace or silently ignoring custom MCP servers.
Please answer with what exists, even if access is not ready yet.
```

## Minimum questionnaire

Ask these questions in a compact form. Do not ask for secrets or credentials.

```text
1. Jira: is there a Jira MCP/tool available for this repo? Project keys or boards?
2. Confluence: is there a Confluence MCP/tool available? Spaces or page roots?
3. Dynatrace: is there a Dynatrace MCP/tool available? Environment, tenant, service/entity naming?
4. Git hosting: is there a GitHub/GitLab/Bitbucket/Azure DevOps MCP/tool beyond local Git?
5. Custom MCP servers: are there internal MCP servers for logs, APIs, databases, incidents, CI/CD, deployments, feature flags, business data or dashboards?
6. Non-MCP sources: are there SQL databases, APIs, exports, files or dashboards that should be registered even if not MCP?
7. For each source: should it be used during kickstart, later handover, incident analysis, spec work or implementation support?
8. Are there privacy, security or data handling restrictions?
```

## Custom MCP source classification

Classify each custom MCP source:

| Category | Examples |
|---|---|
| `production-logs` | log search MCP, SQL log MCP, ELK/Splunk/OpenSearch MCP |
| `metrics` | APM, Prometheus, Grafana, internal metrics |
| `traces` | tracing platforms, correlation lookup |
| `project-activity` | Jira alternatives, planning tools, delivery dashboards |
| `documentation` | wiki, knowledge base, architecture decision records |
| `ci-cd` | CI runs, deployments, release history |
| `incident-management` | ServiceNow, PagerDuty, Opsgenie, internal incident tools |
| `business-data` | reporting APIs, audit tables, domain dashboards |
| `feature-flags` | LaunchDarkly, internal flag services |
| `other` | anything useful that does not fit above |

## Output files

Update or create:

```text
doc/_meta/mcp-source-wizard.md
doc/_meta/information-sources.yaml
doc/_meta/source-coverage.yaml
doc/_meta/open-questions.md
doc/_meta/kickstart-progress.md
doc/mcp/custom-sources.md
doc/_indexes/by-source.md
```

## Source candidate table

Record discovered sources using this shape:

| Source | Candidate transport | Category | Expected use | Known mapping | Contract state | Next action |
|---|---|---|---|---|---|---|
| Jira | standard MCP | project-activity | kickstart | project key unknown | candidate | register contract and ask project key |
| Internal logs | custom MCP | production-logs | production discovery | service name unknown | candidate | register contract and define safe probe |

## Decision rules

- If a source exists but this runtime cannot access it, keep the durable contract and report a `not_visible` runtime observation, not an absent source.
- If a source exists but durable mapping is unknown, keep
  `mapping_state: unknown`; a runtime attempt blocked on it reports
  `mapping_missing`.
- If a source is important for the requested kickstart, pause or ask for explicit approval before continuing without it.
- If a source is useful but not required immediately, register it as a candidate and continue with clear reduced scope.
- If a source is usable and safe to read in this run, apply the discovery coverage contract rather than taking only a tiny sample.
- Never ask for credentials in chat. Ask for the IDE/tooling to be configured instead.

## Required response after wizard

After the wizard, answer with:

```text
MCP source inventory
- Standard MCP expected:
- Custom MCP expected:
- Non-MCP sources to register:
- Sources required before continuing:
- Sources that can wait:
- Next runtime probes:
```

Then update the `Corpus status` footer.

## Per-brick source discovery loop

The wizard is not only an early-kickstart questionnaire. It must be reused whenever a brick cannot become actionable with repository/Jira/Confluence/Dynatrace evidence alone.

For every critical/high brick that remains `partial` or `blocked`, ask:

```text
Brick source question
- Brick:
- Missing evidence:
- Why repository/Jira/Confluence/Dynatrace are insufficient:
- Is there a custom MCP or non-MCP source for this brick? (logs, scheduler, API gateway, DB, incident tool, CI/CD, feature flags, business dashboard, contract registry, CMDB, runbook, export)
- Safe access mode expected:
- What I will update if available:
```

Route answers to:

- `doc/_meta/mcp-source-wizard.md`;
- `doc/_meta/information-sources.yaml`;
- `doc/_meta/brick-inventory.yaml`;
- `doc/_meta/actionable-readiness.md`;
- `doc/_meta/blocking-questions.md` when the source is required for a critical/high brick.

## Anti-patterns

Do not:

- assume Jira/Confluence/Dynatrace are the only useful external sources;
- treat custom MCP sources as generic prose without registering them;
- continue with local-only discovery when the operator said important MCP sources exist;
- ask for secrets or tokens;
- run a query before the source has a safe access mode and a valid point-in-time
  runtime observation.
