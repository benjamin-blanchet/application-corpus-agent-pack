# Reference — supported production sources

Production discovery can use any registered read-only source, including:

- Dynatrace / APM;
- log databases such as MariaDB, PostgreSQL, Oracle or SQL Server;
- ELK / OpenSearch / Splunk exports;
- internal observability APIs;
- local log exports or CSV evidence;
- incident / service-management exports.

Every non-standard source must be registered through
`sources/information-source-onboarding` before it is used for durable
findings. For SQL sources, use `governance/safe-operation-guardrails`:
`SELECT`-only, bounded time window, explicit `LIMIT` and no side effects.
