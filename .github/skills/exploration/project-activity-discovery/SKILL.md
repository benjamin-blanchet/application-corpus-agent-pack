---
name: project-activity-discovery
category: exploration
description: "Run an initial, time-boxed project activity discovery pass during or just after corpus kickstart when Jira/work tracking, Git/source control, PR or CI sources are available."
---
# Project Activity Discovery

## Purpose

Run an initial, time-boxed project activity discovery pass during or just after corpus kickstart when Jira/work tracking, Git/source control, PR or CI sources are available.

The goal is to produce a grounded "fresh-eyes report" on the current life of the project: active work, recurring problems, delivery pressure, changed areas, project trajectory, cross-project dependencies and knowledge distribution.

This skill does not evaluate individual performance. Contributor information may be used only to understand code ownership, adoption needs and collaboration paths.

During kickstart, this skill must satisfy `governance/discovery-coverage-contract` for Jira, Confluence, Git/PR and CI sources that exist.

## Canonical output

Create or update:

```text
doc/project/activity/YYYY-MM-DD-project-activity-discovery.md
doc/project/activity/PROJECT_TRAJECTORY.md
doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md
doc/_indexes/by-project-signal.md
doc/_meta/kickstart-report.md
doc/_meta/corpus-state.yaml
doc/_meta/open-questions.md
doc/_meta/discovery-coverage.md
```

If source access is unavailable or mapping is unclear, do not invent activity state. Record the status as unavailable or partial.

Before using Jira or Confluence evidence, read their durable contracts and run `sources/runtime-source-probe`. Do not call either source unavailable based solely on one runtime observation.

When Jira or Confluence is available, use `doc/mcp/atlassian-query-catalog.md` as the bounded query checklist. Record which catalog steps were executed, skipped or unsupported in `doc/_meta/discovery-coverage.md`.

For serious/full kickstarts, combine this skill with `exploration/atlassian-project-trajectory`. The application may be mentioned in other Jira projects or Confluence spaces by teams that depend on it, call it, migrate around it, receive its batches, or report incidents against it.

When local Git history, CI/CD files or CI run/check evidence are available, also run `exploration/ci-cd-activity-discovery`. The project activity snapshot must not treat old Jenkins/GitLab/Azure/CircleCI files as active just because they exist, and must not ignore them just because another CI system also exists.

## Inputs

Use only available and verified sources:

- Jira / work tracking tickets, boards, epics, versions, defects, support tickets or incidents.
- Git history from the local repository when accessible.
- GitHub/GitLab/Bitbucket/Azure DevOps PRs, branches, reviews and CI checks when accessible.
- Confluence or delivery documents when explicitly available.
- Human confirmation from the AI champion or team when needed.
- Registered custom sources in `doc/_meta/information-sources.yaml`, such as delivery dashboards, internal planning exports, SQL views or CI/CD databases.

If Jira is required but `not_visible` in this runtime, stop Jira-backed discovery, report the point-in-time observation, and ask for the capability or explicit acceptance of a partial Git-only discovery. Preserve any valid historical Jira coverage.

## Default discovery windows

Use a practical time window unless the user specifies otherwise:

- Jira/current work: active sprint, current release, last 30 to 90 days.
- Git commits: last 30 to 90 days, plus last release boundary if known.
- PR/CI: last 30 to 90 days.

Always record the exact window used.

## Jira / work tracking discovery

Minimum Jira kickstart sample when Jira is available:

- last 50 created issues for the project;
- last 50 updated issues for the project;
- currently open/active issues;
- active sprint or current board focus when available;
- active epics, initiatives or versions when available;
- bugs/incidents updated in the last 90 days;
- reopened or high-churn issues when available;
- fields used for component, label, feature or service mapping.
- cross-project mentions of the application when supported;
- linked blockers/dependencies from other Jira projects when supported;
- roadmap, migration, release-train or initiative references from other Jira projects when supported.

Record exact JQL, limits, fields returned, time windows and unsupported fields in `doc/_meta/discovery-coverage.md`.

For a serious/full kickstart, treat the minimum sample as mandatory, not optional. If the MCP is available but a JQL was not run, mark Jira coverage `partial` and ask a blocking question if the missing input is project key, board, sprint or permission.

Do not assume the main Jira project is the whole story. After the main project sample, run `exploration/atlassian-project-trajectory` to look for references from other Jira projects unless cross-project search is unsupported or explicitly out of scope.

Look for:

- active epics, initiatives, versions and releases;
- current sprint or current board focus;
- dominant ticket types: stories, bugs, tasks, incidents, tech debt;
- recurring labels/components;
- old or stale tickets;
- reopened tickets or tickets with high churn;
- support or incident-linked work;
- tickets touching the same features/components repeatedly;
- gaps between Jira naming and repository/corpus naming.
- tickets in other apps that mention this application, its APIs, its jobs, its queues, its service code or its integrations;
- roadmap or migration signals outside the app team's own board.

Extract themes, not raw dumps.

## Confluence discovery

Minimum Confluence kickstart search when Confluence is available:

- application/product name;
- repository name;
- known acronyms or project keys;
- component/service names discovered from the repo;
- feature names discovered from repo or Jira;
- spaces declared by the operator;
- recently modified relevant pages when supported.
- global or cross-space references to the app, repo, service code, APIs, batches and integrations when supported.

Record search terms, spaces, counts found, pages read, pages skipped and limitations in `doc/_meta/discovery-coverage.md`.

For a serious/full kickstart, search results are not enough. Read the most relevant pages and extract durable knowledge into feature folders, architecture, prod risks, bugs and playbooks. If a large bug catalogue or REX set is found, capture it or record why it remains pending.

Do not assume the declared Confluence spaces are exhaustive. After declared-space search, run `exploration/atlassian-project-trajectory` to look for cross-space roadmap, architecture, incident, runbook and adjacent-app pages unless global search is unsupported or explicitly out of scope.

Do not treat Confluence prose as confirmed truth without reconciliation with code, Jira, production evidence or human confirmation.

## Git / source control discovery

When local Git is available, useful commands may include:

```bash
git log --since="90 days ago" --pretty=format:'%h%x09%ad%x09%an%x09%s' --date=short
git log --since="90 days ago" --name-only --pretty=format: | sort | uniq -c | sort -nr | head -50
git shortlog -sne --since="90 days ago"
git log --since="90 days ago" --stat --oneline
```

Use repository-specific alternatives when the team uses GitHub, GitLab, Bitbucket or Azure DevOps APIs/MCPs.

Look for:

- commit frequency and bursts;
- areas/files changed most often;
- risky or large commits;
- repeated changes to fragile components;
- relation between commits and tickets;
- branch/PR/review activity when available;
- CI failures or flaky checks when available;
- code ownership / knowledge concentration, without ranking people.

For serious/full kickstarts, scan at minimum the last 100 commits and/or last 90 days when available. Use the results to identify active bricks and changed areas, not to rank individuals.

## Fresh-eyes report questions

Answer questions such as:

- What seems to be the current project focus?
- What is the broader organizational trajectory around this application?
- Are other Jira projects blocked by, dependent on, migrating from or actively changing around this app?
- Which Confluence spaces outside the obvious app space mention this product, and why?
- Is the application mostly in feature delivery, corrective maintenance, stabilization, migration, compliance or run mode?
- Which components/features appear active or fragile?
- Are Jira activity and Git activity aligned?
- Are there many bugs, reopens, old tickets or incident-linked tasks?
- Are the same files/components modified repeatedly?
- Is knowledge concentrated around one or two contributors?
- Are there signs of delivery friction: stale work, long-lived branches, large PRs, failed CI, unclear ownership?
- What should be discussed with the operator or AI champion before broader team adoption?

## Output structure

Use `doc/project/activity/PROJECT_ACTIVITY_DISCOVERY_TEMPLATE.md` as the base structure.

Required sections:

1. Executive summary
2. Durable source contract, point-in-time runtime observation and prior coverage
3. Current work themes
4. Jira / work tracking signals
5. Cross-project / cross-space trajectory
6. Git / source control signals
7. CI/CD and recent repository activity
8. Contributors and knowledge distribution
9. Surprises / fresh-eyes report
10. Candidate durable knowledge
11. Open questions
12. Limitations

## Durable knowledge routing

Route discoveries to the right corpus location:

| Discovery | Target |
|---|---|
| Active feature not yet documented | `doc/project/features/<feature>/` |
| Repeated bug pattern | `doc/prod/known-bugs/` |
| Structural project or production risk | `doc/prod/structural-risks/` |
| Useful investigation method | `doc/prod/root-cause-playbooks/` |
| Monitoring or delivery watch item | `doc/prod/watchlist/` |
| Source access or mapping issue | `doc/_meta/open-questions.md` |
| Project activity theme | `doc/project/activity/` and `doc/_indexes/by-project-signal.md` |
| Cross-project reference | `doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md` |
| Roadmap / migration / trajectory signal | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| CI/CD active-vs-legacy finding | `doc/project/cicd/PIPELINES.md` |
| Recent changed area / active brick signal | `doc/project/cicd/RECENT_ACTIVITY.md` and roadmap |

## Update corpus state

If discovery was performed:

```yaml
corpus:
  project_activity_discovery_status: "done" # unavailable | partial | done
  jira_discovery_status: "done"             # unavailable | partial | done
  git_discovery_status: "done"              # unavailable | partial | done
  last_project_activity_discovery: YYYY-MM-DD
coverage:
  project:
    activity_snapshot: "partial"
```

If unavailable:

```yaml
corpus:
  project_activity_discovery_status: "unavailable"
  jira_discovery_status: "unavailable"
  git_discovery_status: "unavailable"
```

## Source onboarding

If project activity evidence comes from a non-standard source, register it first with `sources/information-source-onboarding`. Use `governance/safe-operation-guardrails` before any query or command that could alter tickets, branches, CI/CD state or external systems. Project activity discovery is read-only.

## Quality rules

- Do not infer project state from one weak signal.
- Do not silently fall back from Jira-backed discovery to Git-only discovery.
- Do not treat the main Jira project or declared Confluence spaces as exhaustive when cross-project/cross-space search is available.
- Do not treat ticket text as truth without status, comments, linked commits or team confirmation.
- Do not rank or score individual contributors.
- Do not expose sensitive personal conclusions.
- Prefer team-level and component-level observations.
- State limits clearly when source access is partial.
- Reconcile discovered themes with existing project, prod and spec corpus files.
