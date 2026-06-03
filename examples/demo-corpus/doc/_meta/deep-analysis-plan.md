---
type: meta
status: draft
confidence: unknown
source: pack
last_validated:
---

# Deep Analysis Plan

Use this file to coordinate a serious corpus kickstart across multiple analysis lanes.

The goal is to make the corpus comparable to the output of a multi-disciplinary team: developer, functional analyst, architect, reliability analyst, delivery analyst and handover operator.

## Lane Status

| Lane | Status | Sources | Outputs | Gaps / blockers |
|---|---|---|---|---|
| Source code archaeology | not_started | repository | | |
| Functional/domain analysis | not_started | Confluence, Jira, code | | |
| Architecture/integration analysis | not_started | code, Confluence, configs | | |
| Production/reliability analysis | not_started | Dynatrace, incidents, logs, OPS/GDC | | |
| Project/delivery analysis | not_started | Jira, Git, PR/CI | | |
| Adoption analysis | not_started | corpus outputs | | |

## Source Code Archaeology

| Target | Status | Evidence |
|---|---|---|
| Full tree inventory | not_started | |
| Modules/components mapped | not_started | |
| Entry points mapped | not_started | |
| APIs/controllers/routes mapped | not_started | |
| Batches/jobs/consumers mapped | not_started | |
| Persistence/entities/migrations mapped | not_started | |
| External clients/integrations mapped | not_started | |
| Tests/build/deploy mapped | not_started | |

## Functional / Domain Analysis

| Target | Status | Evidence |
|---|---|---|
| Main features identified | not_started | |
| Feature folders populated with non-stub content | not_started | |
| Workflows documented | not_started | |
| Business rules documented | not_started | |
| Roles and permissions documented | not_started | |
| Domain entities documented | not_started | |

## Project / Delivery Analysis

| Target | Status | Evidence |
|---|---|---|
| Last 50 created Jira issues | not_started | |
| Last 50 updated Jira issues | not_started | |
| Open active Jira issues | not_started | |
| Bugs/incidents last 90 days | not_started | |
| Active epics/versions/sprints | not_started | |
| Cross-project Jira mentions | not_started | |
| Cross-app blockers/dependencies | not_started | |
| Roadmap/migration references | not_started | |
| Git change hotspots | not_started | |
| CI/CD/release evidence | not_started | |

## Confluence / Documentation Analysis

| Target | Status | Evidence |
|---|---|---|
| App/product name search | not_started | |
| Repository name search | not_started | |
| Project key/acronym search | not_started | |
| Component/service search | not_started | |
| Feature name search | not_started | |
| Relevant pages read | not_started | |
| Cross-space app references | not_started | |
| Roadmap/architecture/incident pages outside declared spaces | not_started | |
| Adjacent app pages mentioning this product | not_started | |
| Conflicts reconciled | not_started | |

## Dynatrace / Production Analysis

| Target | Status | Evidence |
|---|---|---|
| Dynatrace MCP attached/readiness checked | not_started | |
| App/service visibility | not_started | |
| Runtime topology | not_started | |
| Last 24h health | not_started | |
| Last 7d errors | not_started | |
| Last 7d latency | not_started | |
| Last 30d trend | not_started | |
| Dependency failures | not_started | |
| Restarts/crashes/availability | not_started | |
| Batch/consumer/job signals | not_started | |
| Monitoring gaps | not_started | |

## Reliability Knowledge Capture

| Target | Status | Evidence |
|---|---|---|
| Incident/REX pages read | not_started | |
| Known bugs captured | not_started | |
| Structural risks captured | not_started | |
| Root-cause playbooks created | not_started | |
| Watchlist created | not_started | |

## Blocking Questions Asked

| Question | Area | Status | Result |
|---|---|---|---|
| | | | |
