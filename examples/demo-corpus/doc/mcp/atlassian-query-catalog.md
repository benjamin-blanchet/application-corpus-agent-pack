---
type: mcp-query-catalog
status: draft
confidence: unknown
source: pack
last_validated:
---

# Atlassian Query Catalog

Use this catalog during `exploration/project-activity-discovery` and Confluence enrichment when Jira/Confluence MCP is available.

Do not invent project keys, board ids, field names or space keys. Ask the operator when mapping is unknown.

## Jira Discovery Bundle

| Step | Intent | Query shape | Bound | Evidence to record |
|---|---|---|---|---|
| JIRA-01 | Project mapping | list accessible projects / inspect configured key | limit 50 | project key/name, permission status |
| JIRA-02 | Last created issues | `project = <KEY> ORDER BY created DESC` | 50 | JQL, count, fields returned |
| JIRA-03 | Last updated issues | `project = <KEY> ORDER BY updated DESC` | 50 | JQL, count, fields returned |
| JIRA-04 | Active open issues | `project = <KEY> AND statusCategory != Done ORDER BY priority DESC, updated DESC` | 100 | status mix, priority, components |
| JIRA-05 | Bugs/incidents 90d | `project = <KEY> AND issuetype in (Bug, Incident) AND updated >= -90d ORDER BY updated DESC` | 100 | recurring labels/components, links |
| JIRA-06 | Active epics/versions | project epics, versions, fixVersion/current release | bounded by project | active themes |
| JIRA-07 | Sprint/board focus | active board/sprint issues | current sprint | sprint goal if available, issue list |
| JIRA-08 | High-churn issues | reopened/comment-heavy/updated often | 50 | issue keys, likely friction |

If Jira MCP is available but no JQL or equivalent query is executed, mark Jira coverage `partial` and ask a blocking question.

## Jira Cross-Project Trajectory Bundle

Use this bundle during `exploration/atlassian-project-trajectory` when the tool supports searching outside the main project.

Build search terms from repo name, app/product names, aliases, service codes, Jira keys, P2/P5 component names, integration names, API names and batch/job names. Ask the operator when aliases are ambiguous.

| Step | Intent | Query shape | Bound | Evidence to record |
|---|---|---|---|---|
| JIRA-XP-01 | Accessible project map | list visible projects / inspect known related keys | limit 100 | keys, names, permission limits |
| JIRA-XP-02 | App mentions outside main project | text/summary/description/comment contains app alias and project not in main keys | top 50-100 | issue key, source project, status, relation |
| JIRA-XP-03 | Cross-app blockers/dependencies | linked issues or text mentions app aliases + blocks/depends/integrates | top 50 | link type, source app, target app, current status |
| JIRA-XP-04 | Roadmap / initiative / migration references | app aliases + roadmap/migration/initiative/release/decommission | top 50 | trajectory theme, target date/version if any |
| JIRA-XP-05 | Bugs/incidents/support outside main project | app aliases in bug/incident/support tickets outside main keys | last 180d or top 100 | operational pressure, recurring symptoms |
| JIRA-XP-06 | Release train coupling | app aliases + fixVersion/release labels across projects | active + last 180d | release coupling, dependency windows |
| JIRA-XP-07 | Stale external references | old open issues mentioning app aliases | top 50 | forgotten dependency, pending decision |

If cross-project search is unsupported, record `unsupported` in `doc/_meta/discovery-coverage.md` and ask for known related project keys.

## Confluence Discovery Bundle

| Step | Intent | Search terms | Bound | Evidence to record |
|---|---|---|---|---|
| CONF-01 | App/product pages | app name, product name | top 20 | page id, title, space, last modified |
| CONF-02 | Repo pages | repository name | top 20 | page id, title, relevance |
| CONF-03 | Project/acronym pages | Jira key, acronym, service code | top 20 | page id, title, relevance |
| CONF-04 | Component pages | P2 module names, P5 integration names | top 50 | pages read/skipped |
| CONF-05 | Feature pages | P3/P4 feature slugs and labels | top 50 | pages read/skipped |
| CONF-06 | OPS/REX/incidents | app + incident/REX/known bug/error/runbook | top 50 | durable prod knowledge candidates |
| CONF-07 | Recently modified relevant pages | app/repo/space filter | top 50 | drift indicators |

Search snippets are not enough for durable knowledge. Read relevant pages and record page id, last modified date and trust score.

## Confluence Cross-Space Trajectory Bundle

Use this bundle during `exploration/atlassian-project-trajectory` when the tool supports global or multi-space search.

| Step | Intent | Search terms | Bound | Evidence to record |
|---|---|---|---|---|
| CONF-XP-01 | Global app mentions | app aliases, repo name, service code | top 50-100 | page id, space, title, last modified, relevance |
| CONF-XP-02 | Roadmap / migration / target architecture | app aliases + roadmap/migration/initiative/release/decommission/target architecture | top 50 | trajectory candidates |
| CONF-XP-03 | Architecture / dependency docs | app aliases + architecture/integration/API/batch/queue/dependency | top 50 | dependency candidates, adjacent systems |
| CONF-XP-04 | Incident / REX / runbook pages | app aliases + incident/REX/postmortem/runbook/support/error | top 50 | prod knowledge candidates |
| CONF-XP-05 | Adjacent app pages | upstream/downstream names from P5/Dynatrace | top 50 | other apps that mention this product |
| CONF-XP-06 | Recently modified cross-space pages | app aliases + modified/recent filters when supported | top 50 | current attention and drift indicators |

If global Confluence search is unsupported, record `unsupported` and ask the operator for likely spaces or page roots.

## Routing Rules

| Atlassian evidence | Destination |
|---|---|
| Feature intent / business language | existing P4 feature folder |
| Confirmed recurring bug | `doc/prod/known-bugs/` |
| REX / incident investigation pattern | `doc/prod/root-cause-playbooks/` |
| Delivery friction | `doc/project/activity/` |
| Cross-project / cross-space reference | `doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md` |
| Project trajectory / roadmap signal | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| Code/documentation contradiction | `doc/_meta/reconciliation-ledger.yaml` during P9 |

Confluence is rank 7. Code, runtime config and production evidence win when they disagree.
