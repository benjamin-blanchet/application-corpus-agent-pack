---
name: brick-deep-dive
category: actionable
description: "Turn each important brick from `actionable/brick-inventory` into a corpus unit that agents can use for real work."
---
# Actionable Brick Deep Dive

## Purpose

Turn each important brick from `actionable/brick-inventory` into a corpus unit that agents can use for real work.

This skill is deliberately generic. It applies to features, APIs, screens, batches, consumers, integrations, entities, technical mechanisms, reliability scenarios and risks.

## Actionable means

A brick is actionable when an agent can use the corpus to answer:

- what it does;
- where the code and configuration live;
- how it executes;
- what data it reads/writes;
- which systems it calls or receives from;
- what rules, constraints and edge cases matter;
- what errors/failures occur and how to observe them;
- how to test or validate a change;
- what tickets/incidents/risks are linked;
- what a change may impact;
- what not to touch without extra confirmation.

If the answer requires rereading the whole repo, the brick is **not** actionable.

## Mandatory first reads

1. `doc/_meta/brick-inventory.yaml`
2. The brick's current canonical file or related feature folder.
3. Relevant P1–P9 artifacts.
4. Relevant Jira/Confluence/Dynatrace evidence when available.
5. `doc/_meta/mcp-source-wizard.md` and `doc/_meta/information-sources.yaml`.
6. `doc/_meta/open-questions.md` and `doc/_meta/blocking-questions.md`.

## Detail contract by brick kind

### Feature

- purpose and boundaries;
- entry points;
- workflow(s);
- business rules with source citations;
- data touched;
- integrations;
- operational behavior;
- tests;
- change-impact notes;
- agent guide.

### API

- endpoint/method/contract;
- auth and headers;
- request/response examples or schema references;
- downstream services/entities;
- errors/status codes;
- compatibility/versioning;
- tests;
- consumers when known;
- impact of changing contract.

### Screen

- route/view/controller/backing bean;
- user role;
- events/actions;
- validation;
- state/session behavior;
- downstream services/entities;
- known UX/prod errors;
- tests/manual validation path.

### Batch / job / scheduler

- launcher/script/class;
- trigger/schedule/source system;
- parameters;
- files/messages/tables read and written;
- transaction and idempotence behavior;
- retry/rerun rules;
- error handling and logs;
- production observability;
- linked tickets/incidents;
- change-impact notes.

### Consumer / listener

- topic/queue/subscription;
- message contract;
- producer(s) and downstream effects;
- ordering/idempotence/DLQ/retry;
- config;
- monitoring and failure modes;
- replay/backfill rules.

### Integration

- counterpart system and owner when known;
- direction/protocol/auth;
- contract and payload;
- timeout/retry/fallback;
- data sensitivity;
- observability;
- migration/deprecation state;
- impact of changing it.

### Domain entity

- table/entity/class;
- columns/keys/FKs;
- lifecycle;
- features that read/write;
- migrations;
- volume/sensitivity;
- invariants;
- safe change rules.

### Technical mechanism

- purpose;
- code/config entry points;
- runtime behavior;
- environments;
- failure modes;
- operational controls;
- change safety.

### Reliability scenario / risk

- symptom;
- detection query/log/metric;
- likely causes;
- affected bricks;
- investigation steps;
- mitigations/workarounds;
- escalation/owner;
- how to prove resolution.

## Output conventions

Use the most natural existing corpus location:

```text
doc/project/features/<feature>/
doc/project/apis/<api-group>/README.md
doc/project/batchs/<batch-or-job>/README.md
doc/project/screens/<screen>/README.md
doc/project/integrations/<system-or-flow>/README.md
doc/project/domain/<entity>.md
doc/project/technical/<mechanism>.md
doc/prod/root-cause-playbooks/PLAYBOOK-<scenario>.md
doc/prod/watchlist/WATCH-<signal>.md
```

If the directory does not exist, create it. Keep generated units linked from indexes.

## Evidence rules

- Prefer code, config, migrations and production evidence.
- Use Jira/Confluence for intent/history, then reconcile.
- Mark unknowns explicitly and ask via `governance/blocking-question-loop` when the operator can answer.
- If missing evidence could come from a custom MCP or non-MCP source, run the per-brick source discovery loop from `sources/mcp-source-wizard` before downgrading the brick to `partial`.
- Record files read. A brick with no source files/configs/queries read cannot be `actionable` unless it is explicitly non-code and source-backed elsewhere.

## Readiness statuses

| Status | Meaning |
|---|---|
| `identified` | brick exists, not enough detail |
| `partial` | useful but missing important sections |
| `actionable` | sufficient for normal agent work |
| `deferred` | consciously postponed; not an adoption blocker only if low/medium criticality |
| `blocked` | missing access or human answer |
| `not_applicable` | obsolete or outside scope with reason |

## Anti-patterns

Do not:

- produce a thin page with headings only;
- count a broad feature page as covering all APIs/batches/integrations inside it;
- mark a critical brick actionable with `files_read_in_silo: []`;
- mark a critical/high brick partial without asking whether a custom MCP/non-MCP source exists when the missing evidence is operational, contractual, scheduling, data, incident or dashboard knowledge;
- let a catalog row replace a brick deep dive when a team would need details to change it.
