---
name: atlassian-project-trajectory
category: exploration
description: "Use Jira and Confluence as ecosystem discovery sources to understand the product trajectory beyond the main Jira project or the obvious Confluence space."
---
# Atlassian Project Trajectory

## Purpose

Use Jira and Confluence as ecosystem discovery sources to understand the product trajectory beyond the main Jira project or the obvious Confluence space.

The goal is to find how the application is cited, depended on, changed around or constrained by the wider organization: tickets in other Jira projects, cross-app initiatives, migrations, incidents, roadmap pages, architecture decisions and dependency discussions.

This skill complements `exploration/project-activity-discovery`. `exploration/project-activity-discovery` owns the project activity snapshot; this skill owns cross-project/cross-space trajectory and ecosystem discovery.

## When to use

Use this skill when:

- Jira or Confluence is available during serious corpus kickstart;
- the operator wants to understand project trajectory, roadmap, migration, dependency or organizational context;
- the main Jira project looks too narrow to explain current activity;
- a ticket in another app may cite this application;
- Confluence may contain architecture, incident, roadmap or dependency pages outside the declared space;
- a critical/high brick is not actionable because intent, ownership, dependency context or active roadmap is unclear.

If Jira/Confluence is required but the declared transport is unusable in this runtime, run `sources/runtime-source-probe`, ask a blocking question and do not silently continue with repository-only evidence.

## Mandatory reads

1. `doc/_meta/app-profile.yaml`
2. `doc/_meta/information-sources.yaml` and `doc/_meta/source-coverage.yaml`
3. `doc/_meta/discovery-coverage.md`
4. `doc/_meta/brick-inventory.yaml`
5. `doc/mcp/atlassian.md`
6. `doc/mcp/atlassian-query-catalog.md`
7. `doc/project/activity/PROJECT_ACTIVITY_DISCOVERY_TEMPLATE.md`
8. `doc/project/activity/PROJECT_TRAJECTORY.md` when it exists
9. `doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md` when it exists

## Required behavior

1. Announce an Atlassian MCP checkpoint before querying.
2. Run `sources/runtime-source-probe` and verify the required Jira and/or Confluence capabilities in this runtime.
3. Build a search dictionary from evidence-backed names:
   - repository name;
   - product/application names;
   - app acronyms and service codes;
   - Jira project key(s);
   - package/module/service names from P2/P5;
   - important integration names and external systems;
   - batch/job names and API names from P3/P5.
4. Ask the operator for missing aliases when the app name is ambiguous.
5. Query the declared Jira project(s), then query accessible Jira projects globally by app aliases when supported.
6. Search Confluence declared spaces, then accessible spaces globally by app aliases when supported.
7. Record exact JQL/CQL/search terms, limits, counts, pages/issues read and unsupported query capabilities.
8. Distinguish:
   - direct evidence about this app;
   - indirect mentions from another app;
   - dependency/roadmap intent;
   - stale or historical references;
   - unverified ticket/page claims.

## Jira cross-project bundle

Run bounded read-only searches for these intents when supported by the Jira MCP/tool:

| Intent | Search shape | Bound | Evidence to record |
|---|---|---|---|
| Accessible project map | list projects or search visible projects | limit 100 | keys, names, permission limits |
| App mentions outside main project | text/summary/description/comment mention of app aliases and `project not in (<main>)` | top 50-100 | issue key, project, status, type, relation |
| Cross-app dependencies | linked issues, blockers, dependencies, mentions of APIs/batches/integrations | top 50 | source app, target app, link type, status |
| Roadmap / initiative / migration | initiatives, epics, fixVersion, labels containing app aliases | top 50 | active trajectory themes |
| Incidents / support references | bugs/incidents/support tickets mentioning app aliases outside main project | last 180d or top 100 | recurring operational pressure |
| Release train references | release/version tickets mentioning app aliases | active + last 180d | release coupling, migration windows |
| Stale historical references | old open issues mentioning app aliases | top 50 | long-lived decisions or forgotten dependencies |

Do not run tenant-wide unbounded searches. If the tool cannot search across projects, record `unsupported` and ask for known related project keys.

## Confluence cross-space bundle

Run bounded read-only searches for these intents when supported by the Confluence MCP/tool:

| Intent | Search terms | Bound | Evidence to record |
|---|---|---|---|
| Global app mentions | app aliases, repo name, service code | top 50-100 | page id, space, title, last modified, relevance |
| Roadmap / trajectory | app aliases + roadmap, migration, initiative, release, decommission, target architecture | top 50 | trajectory candidates |
| Architecture / dependency docs | app aliases + architecture, integration, API, batch, queue, dependency | top 50 | ecosystem and dependency candidates |
| Incidents / REX / runbooks | app aliases + incident, REX, postmortem, runbook, support, error | top 50 | prod knowledge candidates |
| Cross-app pages | integration names, upstream/downstream names from P5/Dynatrace | top 50 | adjacent apps mentioning this product |
| Recently modified pages | app aliases with modified/recent filter when supported | top 50 | current attention and drift indicators |

Search snippets are not durable evidence. Read relevant pages and record page ID, space, last modified date and trust score. Confluence is rank 7: it explains intent and history, not current truth until reconciled.

## Output files

Update:

```text
doc/project/activity/YYYY-MM-DD-project-activity-discovery.md
doc/project/activity/PROJECT_TRAJECTORY.md
doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md
doc/_indexes/by-project-signal.md
doc/_meta/discovery-coverage.md
doc/_meta/open-questions.md
doc/_meta/blocking-questions.md
doc/mcp/atlassian.md
```

Route durable findings:

| Finding | Destination |
|---|---|
| Active roadmap/theme | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| Other app depends on this app | `doc/project/integrations/README.md` or integration deep dive |
| Cross-project active change area | `doc/_meta/brick-inventory.yaml` and `doc/_indexes/by-brick.md` |
| Recurring operational issue | `doc/prod/known-bugs/` or `doc/prod/structural-risks/` |
| Runbook or REX | `doc/prod/root-cause-playbooks/` or incident analysis |
| Unclear external dependency | `doc/_meta/blocking-questions.md` |

## Coverage bar

When Jira or Confluence is available, the corpus should not mark the Atlassian lane `covered` for serious kickstart unless it has either:

- executed the cross-project/cross-space searches in this skill; or
- recorded why the tools, permissions, query capabilities or operator-provided scope prevent them.

A main-project-only Jira sample and one declared Confluence space scan may be `partial` when wider organizational references are likely.

## Anti-patterns

- Assume the application appears only in its own Jira project.
- Assume Confluence knowledge lives only in one declared space.
- Ignore tickets from another app that mention this product.
- Convert ticket/page text into confirmed behavior.
- Mark cross-project discovery complete without recording query terms and limits.
- Hide unsupported cross-project search as if no references exist.
