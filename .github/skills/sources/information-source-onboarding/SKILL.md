---
name: information-source-onboarding
category: sources
description: "Register and safely consume any information source that can enrich the corpus: APM, log database, SQL table, API, file export, wiki, ticketing system, CI/CD, object storage, or manual evidence package."
---
# Information Source Onboarding

## Purpose

Register and safely consume any information source that can enrich the corpus: APM, log database, SQL table, API, file export, wiki, ticketing system, CI/CD, object storage, or manual evidence package.

Dynatrace, Jira and Git are predefined examples. They are not the model's limit.

## When to use

Use this skill when:

- a team has a source not covered by existing references;
- production logs are stored in a database such as MariaDB;
- an internal API or export can provide evidence;
- `Corpus` is doing kickstart and discovers additional data sources;
- `Reliability Analyst` needs to investigate from a non-standard log/metric source;
- `Functional Analyst` needs to ground specs in external project or business evidence.

## Mandatory first reads

1. `doc/CORPUS_MAP.md`
2. `doc/CORPUS_MANIFEST.md`
3. `doc/_meta/information-sources.yaml`
4. `doc/_meta/source-inventory.md`
5. `doc/mcp/custom-sources.md`
6. `doc/_meta/app-profile.yaml`

## Source registration workflow

1. Identify the source and its purpose.
2. Classify the source:
   - `code`
   - `production-logs`
   - `metrics`
   - `traces`
   - `project-activity`
   - `documentation`
   - `business-data`
   - `ci-cd`
   - `manual-evidence`
   - `other`
3. Define the consumption method:
   - `mcp`
   - `sql`
   - `api`
   - `file-export`
   - `cli`
   - `local-filesystem`
   - `manual`
4. Define access mode. Default is `read-only`.
5. Define allowed uses.
6. Define restrictions and privacy constraints.
7. Define evidence rules: time window, query logging, filters, limits, limitations.
8. Update `doc/_meta/information-sources.yaml`.
9. Update `doc/_meta/source-inventory.md`.
10. Update `doc/_indexes/by-source.md`.
11. If the source supports production discovery, connect it to `exploration/production-discovery`.
12. If the source supports project activity discovery, connect it to `exploration/project-activity-discovery`.

## Safety rules

- Treat every new source as unavailable until access and allowed use are verified.
- Default to read-only consumption.
- Never run write SQL, destructive API calls, deploy commands, state transitions or bulk updates from a discovery pass.
- Use `governance/safe-operation-guardrails` before executing commands or queries that can alter state, consume large resources or expose sensitive data.
- For SQL sources, use SELECT-only queries with explicit time window and LIMIT unless the team has approved a safer alternative.
- Do not extract personal data unless explicitly required for the task and approved by the team.
- Do not score individual contributors or users.

## SQL-backed source checklist

Before querying a SQL source such as a MariaDB log database, identify:

| Item | Status |
|---|---|
| engine and version if known | unknown |
| database/schema | unknown |
| table(s) | unknown |
| timestamp column | unknown |
| severity/status column | unknown |
| service/component column | unknown |
| message/exception column | unknown |
| correlation id column | unknown |
| environment column | unknown |
| retention period | unknown |
| relevant indexes | unknown |
| safe default time window | unknown |
| safe default row limit | unknown |

If these are unknown, ask the operator/champion or record questions in `doc/_meta/open-questions.md` instead of guessing.

## Evidence format

Every finding from a custom source must include:

| Field | Required |
|---|---|
| source id | yes |
| environment | when applicable |
| time window | when applicable |
| query/filter/path | yes |
| result summary | yes |
| confidence | yes |
| limitation | yes |
| destination corpus file | yes |

## Output destinations

| Need | Destination |
|---|---|
| source registry | `doc/_meta/information-sources.yaml` |
| source inventory summary | `doc/_meta/source-inventory.md` |
| generic usage rules | `doc/mcp/custom-sources.md` |
| source index | `doc/_indexes/by-source.md` |
| production snapshot from source | `doc/prod/snapshots/` |
| project activity snapshot from source | `doc/project/activity/` |
| questions / missing access | `doc/_meta/open-questions.md` |

## Anti-patterns

Do not:

- hardcode credentials or secrets;
- commit connection strings with passwords;
- run unbounded queries against production data;
- summarize source data without recording the query/filter used;
- treat one sample as a trend;
- create a durable claim without confidence and evidence;
- add custom source findings only to a report without updating indexes or candidate durable knowledge.
