---
name: p5-cross-cutting-extraction
category: pipeline
description: "Aggregate everything that crosses feature boundaries: the **API surface**, the **domain model**, the **integration map**, the **messaging topology**, the **persistence schema** and the **shared infrastructure**."
references:
  - procedure-diagrams-and-gate.md
---
# Cross-Cutting Extraction (Pass 5 / 9)

## Purpose

Aggregate everything that crosses feature boundaries: the **API surface**, the **domain model**, the **integration map**, the **messaging topology**, the **persistence schema** and the **shared infrastructure**.

P4 documented features one by one. P5 looks at the *seams* between them and produces canonical catalogs that no single feature folder owns.

## Prerequisite

`p4_feature_silo_deep_dive.status == covered`.

P5 may be re-run if P4 changes after a `split`/`merge`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/_meta/feature-candidates.yaml`
4. Every `doc/project/features/<slug>/_evidence.yaml`
5. All migration files listed by P1 in `data_migration`
6. All schema/contract files listed by P1 in `proto_schema`
7. All `config_app` files listed by P1
8. `doc/_meta/code-activity-signals.yaml` (if it exists — see Prioritization input below)

## Prioritization input

If `doc/_meta/code-activity-signals.yaml` exists with `meaningful_history: true`, use it to **order entries within each catalog**. Coverage is still exhaustive over P1's inventory — every API, every entity, every integration, every messaging topic, every persistence target is catalogued. But within each catalog file, **list active entries first** (ranked by aggregate folder score of the implementing code), with dormant entries grouped at the end under a clearly marked section ("Dormant / no activity in window").

When the signal is missing or `meaningful_history: false`, fall back to module-order then alphabetical and note the fallback in the catalog's header.

This matters because P5 catalogs are large and read often — the operator and downstream agents land on the first entries by default. Putting active entries first makes those landings useful.

## Required behavior

Produce six canonical catalogs from the union of P4 evidence + the schema/migration/config files. Each catalog must be **exhaustive over the inventory of P1**, not just the union of what P4 happened to read.

## Sanctuarized output — the boundary contract

The API surface, integration map and messaging topology you extract here are
**also** emitted as the machine-readable, sanctuarized boundary contract at
`doc/architecture/boundary.yaml` — the single source of truth for the
application's inbound/outbound surface and the join target for ecosystem-graph
recomposition. This is a **first-class P5 output**, not optional: a P5 marked
`covered` with `boundary.yaml` still the empty skeleton is flagged by the
validator.

Follow `governance/boundary-contract` for the schema, the channel-normalization
conventions (so one app's `outbound` joins another's `inbound`), counterparty
identity, and the two-tier validation. Scope is **boundary-crossing only**
(exposed/called APIs, produced/consumed events, shared datastores, external
systems, file exchanges) — not internal calls. Inbound API edges are seeded in
P3; P5 completes them and adds outbound calls, events, datastores and external
systems. Regenerate `BOUNDARY.md` from the YAML; reconcile `by-api.md`,
`INTEGRATION_MAP.md`, the diagrams and (when runtime evidence exists)
`doc/prod/SERVICE_FLOWS.md` against it by claim scope. The contract describes
implementation; observed flows describe a named deployment and environment.

## Catalog 1 — API surface

Every inbound contract the application exposes:

```text
doc/project/apis/CATALOG.md
doc/project/apis/<group>/<endpoint>.md      # one file per non-trivial endpoint group
```

For each endpoint, record:

- protocol (HTTP/REST, GraphQL, gRPC, SOAP, WebSocket, server action);
- route/method/operation name;
- request schema (cite DTO file);
- response schema;
- auth requirement;
- consumed by (when known from operator interview);
- feature folder back-reference;
- versioning strategy if present.

Coverage target: every entry point of kind `http_route`, `graphql_resolver`, `grpc_method`, `soap_endpoint`, `websocket_handler`, `server_action` from P3 must appear in CATALOG. **Zero missing.**

## Catalog 2 — Domain model

Every business entity the code persists or transports:

```text
doc/project/domain/ENTITIES.md            # one row per entity
doc/project/domain/<entity>.md            # one file per important entity
doc/_indexes/by-business-entity.md        # updated
```

For each entity, record:

- canonical name;
- physical table(s) and column list (from migrations + ORM annotations);
- key fields, FKs, unique constraints;
- value objects / embedded types;
- enums used;
- features that read it / write it (back-references to feature folders);
- lifecycle (creation/update/deletion paths);
- audit/history columns if present.

Coverage target: every entity class found in source AND every table found in migrations must appear. **Zero missing.** Discrepancies (entity without table or table without entity) are flagged for P7/P9.

## Catalog 3 — Integration map

Every outbound or inbound link between this app and another system:

```text
doc/project/architecture/INTEGRATION_MAP.md
```

For each integration, record:

- direction (inbound, outbound, bidirectional);
- protocol;
- counterpart system (name from operator if not in code);
- contract reference (WSDL/OpenAPI/proto/topic name);
- auth mechanism;
- sync vs. async;
- error handling strategy;
- feature folders that use it.

Coverage target: every external client class, every Kafka/JMS/RabbitMQ/SQS topic referenced, every webhook URL configured, every external HTTP host found in config — all listed.

## Catalog 4 — Messaging topology

Specifically for async messaging (often mis-documented):

```text
doc/project/services/MESSAGING.md
```

For each topic / queue / subscription / exchange, record:

- name;
- broker (Kafka cluster, ActiveMQ broker, RabbitMQ vhost, etc.);
- producers in this repo (file:line);
- consumers in this repo (file:line);
- message class (DTO);
- retry/DLQ policy;
- ordering / partition key (if applicable);
- volume hint if Dynatrace data exists (link to prod snapshot).

Coverage target: every `@KafkaListener`, `@JmsListener`, `KafkaTemplate.send`, `JmsTemplate.convertAndSend` call, and equivalents across stacks, must be in the table.

## Catalog 5 — Persistence schema

```text
doc/project/architecture/PERSISTENCE.md
```

Sections:

- Database engines used (with version when detectable);
- Schemas/databases/keyspaces;
- Tables list with row count hint if known;
- Migration tooling (Flyway, Liquibase, Alembic, EF migrations, custom);
- Migration timeline (count + first/last date);
- Connection pools and their config (size, timeout);
- Read replicas / sharding / partitioning evidence;
- Caches in front of the DB (Redis, Caffeine, Hazelcast);
- Triggers, stored procedures, materialized views.

## Catalog 6 — Shared infrastructure & cross-cutting

```text
doc/project/technical/CROSS_CUTTING.md
```

Sections:

- Authentication & authorization stack (libraries, providers, scopes/roles);
- Configuration management (where config comes from: env, vault, config server);
- Secrets handling;
- Observability stack (logging framework + format, metrics, tracing);
- Internationalization;
- Error handling / global exception mappers;
- Rate limiting / circuit breakers;
- Caching layers;
- Feature flags;
- Audit/compliance hooks.

## Output files

```text
doc/project/apis/CATALOG.md
doc/project/apis/<group>/*.md
doc/project/domain/ENTITIES.md
doc/project/domain/<entity>.md
doc/project/architecture/INTEGRATION_MAP.md
doc/project/architecture/PERSISTENCE.md
doc/project/services/MESSAGING.md
doc/project/technical/CROSS_CUTTING.md
doc/project/architecture/diagrams/integration-context.md   # mermaid C4-context: this app + neighbors
doc/project/architecture/diagrams/integration-flow.md      # mermaid: inbound/outbound flows by protocol
doc/project/architecture/diagrams/messaging-topology.md    # mermaid: producers/topics/consumers
doc/project/architecture/diagrams/domain-er.md             # mermaid erDiagram: entities + relations
doc/project/architecture/diagrams/persistence.md           # mermaid: db engines, schemas, tables grouped
doc/_indexes/by-api.md                    # rebuilt from CATALOG
doc/_indexes/by-business-entity.md        # rebuilt from ENTITIES
doc/_indexes/by-component.md              # cross-cutting components
doc/_meta/cross-cutting-state.yaml
doc/_meta/code-pipeline-state.yaml        # P5 status
```

## Completion procedure

Load `procedure-diagrams-and-gate.md` after all six catalogs are populated. It
owns mandatory diagrams, the state schema, coverage gates, blocking questions
and the final P5 status update.
