---
type: mcp-reference
status: active
confidence: confirmed
source: pack
last_validated:
title: "Custom Information Sources"
description: "Use this file to document sources that are not covered by a dedicated connector file such as `dynatrace.md`, `atlassian.md`, `github.md` or `servicenow.md`."
---

# Custom Information Sources

Use this file to document sources that are not covered by a dedicated connector file such as `dynatrace.md`, `atlassian.md`, `github.md` or `servicenow.md`.

A custom source can be:

- a MariaDB / PostgreSQL / Oracle / SQL Server log database;
- an ELK / OpenSearch / Splunk log endpoint;
- an internal REST or GraphQL API;
- a CSV export;
- object storage files;
- application audit tables;
- CI/CD reports;
- business monitoring dashboards;
- manual evidence provided by the team.

During kickstart, discover custom MCP sources through:

```text
doc/_meta/mcp-source-wizard.md
```

Use `sources/mcp-source-wizard` before deciding that Jira, Confluence and Dynatrace are the only relevant connected sources.

## Mandatory registration

Before using a custom source, register it in:

```text
doc/_meta/information-sources.yaml
```

The registry must define:

| Field | Meaning |
|---|---|
| `id` | Stable source id used in reports and indexes. |
| `category` | `production-logs`, `project-activity`, `documentation`, `business-data`, etc. |
| `status` | `available`, `partial`, `unavailable`, `template`, `deprecated`. |
| `consumption.method` | `sql`, `api`, `mcp`, `file-export`, `cli`, `manual`, etc. |
| `consumption.access_mode` | Usually `read-only`. |
| `allowed_uses` | What agents may use the source for. |
| `restrictions` | Safety, privacy, query and operational limits. |
| `evidence_rules` | What must be recorded for every finding. |

## Consumption discipline

Agents must not treat a source as available because it is mentioned. Availability requires one of:

1. a working connector/tool;
2. a local export in the repo/workspace;
3. explicit human-provided evidence;
4. a verified connection profile that allows read-only access.

If availability is unclear, record the source as `partial` or `unavailable` and add a question in `doc/_meta/open-questions.md`.

## SQL source rules

For SQL-backed sources, default to read-only investigation.

Allowed by default:

```sql
SELECT ...
```

Blocked by default:

```sql
INSERT
UPDATE
DELETE
DROP
TRUNCATE
ALTER
CREATE
MERGE
CALL
EXEC
LOCK TABLE
```

Every SQL query used as evidence must record:

- source id;
- environment;
- time window;
- filters;
- row limit;
- query text or query summary;
- result summary;
- limitations.

## MariaDB log database example

When a team pushes logs into MariaDB, create a real source profile based on `mariadb_logs_example` in `doc/_meta/information-sources.yaml`.

Minimum details to clarify with the team:

```text
- database / schema name
- table names
- timestamp column
- severity column
- service/component column
- message / exception columns
- correlation id column, if any
- environment column, if any
- retention period
- known indexes
- safe default time window
- maximum safe row limit
```

Example read-only query shape:

```sql
SELECT
  timestamp_column,
  service_column,
  severity_column,
  message_column,
  correlation_id_column
FROM log_table
WHERE timestamp_column >= :start_time
  AND timestamp_column < :end_time
  AND environment_column = :environment
ORDER BY timestamp_column DESC
LIMIT 500;
```

Never run exploratory SQL without a time window and limit on a large production log table.

## Routing source findings

| Finding type | Target |
|---|---|
| runtime signal | `doc/_indexes/by-production-signal.md` |
| project signal | `doc/_indexes/by-project-signal.md` |
| recurring production problem | `doc/prod/known-bugs/` or `doc/prod/watchlist/` |
| structural operational weakness | `doc/prod/structural-risks/` |
| useful investigation path | `doc/prod/root-cause-playbooks/` |
| source profile or limitation | `doc/_meta/information-sources.yaml`, `doc/_meta/source-inventory.md`, `doc/_meta/open-questions.md` |
