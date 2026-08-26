---
type: meta
status: draft
confidence: unknown
source: pack
last_validated:
title: "Discovery Coverage"
description: "Human-readable view of the historical source coverage contract."
---

# Discovery Coverage

This file is the human-readable view of `doc/_meta/source-coverage.yaml`.

The goal is to make corpus initialization auditable: what was scanned, queried, read, skipped, blocked and still unknown.

## Coverage Status Scale

| Status | Meaning |
|---|---|
| `not_started` | No meaningful coverage yet. |
| `inventory_only` | Source or area identified but not deeply explored. |
| `started` | First useful evidence collected. |
| `partial` | Useful evidence collected, but required coverage target not met. |
| `covered` | Minimum coverage target met for kickstart. |
| `deep` | Beyond minimum target; enough for strong first baseline. |
| `blocked` | Cannot proceed without access, mapping, tools or human input. |
| `not_applicable` | Source or area does not apply, with reason. |

## Overall Coverage

| Area | Status | Evidence | Gaps / blockers |
|---|---|---|---|
| Repository source | covered | `doc/_meta/repository-map.yaml` | Fictional demo evidence. |
| Jira | covered | `doc/project/activity/PROJECT_TRAJECTORY.md` | Fictional demo evidence. |
| Confluence | not_started | | |
| Dynatrace / production observability | partial | `doc/prod/RUNTIME_ARCHITECTURE.md` | Fictional bounded demo sample. |
| Custom MCP sources | not_started | | |
| Non-MCP custom sources | not_started | | |
| Git / source-control history | not_started | | |
| CI/CD / release evidence | not_started | | |
| Recent commit hotspots | not_started | | |

## Repository Source Coverage

| Metric | Value |
|---|---|
| Total files inventoried | fictional bounded demo inventory |
| Total directories inventoried | fictional bounded demo inventory |
| Excluded paths / patterns | unknown |
| Manifests read | covered by `doc/_meta/repository-map.yaml` |
| Languages detected | unknown |
| Frameworks detected | unknown |
| Entry point categories checked | unknown |
| Tests detected | unknown |
| Migrations/data access checked | unknown |
| Config files checked | unknown |
| Zones not deeply read | synthetic source tree outside the demo evidence |

## Jira Coverage

| Target | Status | Query / filter | Count | Notes |
|---|---|---|---|---|
| Last 50 created issues | covered | fictional demo query | bounded demo sample | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| Last 50 updated issues | covered | fictional demo query | bounded demo sample | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| Open/active issues | covered | fictional demo query | bounded demo sample | `doc/project/activity/PROJECT_TRAJECTORY.md` |
| Active sprint / board focus | not_started | | | |
| Active epics / versions | not_started | | | |
| Bugs/incidents last 90 days | not_started | | | |
| Reopened/high-churn issues | not_started | | | |
| Cross-project app mentions | not_started | | | |
| Linked blockers / dependencies outside main project | not_started | | | |
| Roadmap / initiative / migration references | not_started | | | |
| Bugs/incidents/support references outside main project | not_started | | | |
| Stale external references | not_started | | | |

## Confluence Coverage

| Target | Status | Search / source | Count | Notes |
|---|---|---|---|---|
| Application/product name search | not_started | | | |
| Repository name search | not_started | | | |
| Acronym/project key search | not_started | | | |
| Component/service names search | not_started | | | |
| Feature names search | not_started | | | |
| Declared spaces scan | not_started | | | |
| Recently modified relevant pages | not_started | | | |
| Cross-space app mentions | not_started | | | |
| Roadmap / migration / target architecture pages | not_started | | | |
| Architecture / dependency pages outside declared space | not_started | | | |
| Incident / REX / runbook pages outside declared space | not_started | | | |
| Adjacent app pages mentioning this product | not_started | | | |

## Dynatrace / Production Coverage

| Target | Status | Query / filter | Time window | Notes |
|---|---|---|---|---|
| App visibility confirmed | covered | fictional bounded demo probe | current | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Runtime entity/service mapping | covered | fictional bounded demo mapping | current | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Runtime architecture / ecosystem map | partial | fictional bounded demo sample | current + 7d | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Inbound callers and entry flows | partial | fictional bounded demo sample | 24h + 7d | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Outbound dependencies and external flows | partial | fictional bounded demo sample | 24h + 7d | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Service-to-service dependency graph | partial | fictional bounded demo sample | current + 7d | `doc/prod/RUNTIME_ARCHITECTURE.md` |
| Database/datastore interactions | not_started | | 7d | |
| Messaging / async topology observed | not_started | | 7d + 30d | |
| Logs picking / representative samples | not_started | | 24h + 7d + 30d | |
| Trace path samples | not_started | | 7d | |
| Metrics sampling by service/entity | not_started | | 24h + 7d | |
| Last 24h immediate state | not_started | | 24h | |
| Last 7d recurring errors | not_started | | 7d | |
| Last 7d latency hotspots | not_started | | 7d | |
| Last 30d trends when useful | not_started | | 30d | |
| Availability/restart/crash signals | not_started | | | |
| Batch/job/consumer health | not_started | | | |
| Downstream dependency failures | not_started | | | |
| Monitoring gaps / naming mismatch | not_started | | | |

## Custom Source Coverage

| Source | Type | Expected use | Status | Evidence collected | Gaps / blockers |
|---|---|---|---|---|---|
| | | | | | |

## Coverage Limitations To Report

| Limitation | Impact | Next action |
|---|---|---|
| | | |
