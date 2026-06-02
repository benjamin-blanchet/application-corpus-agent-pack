---
name: brick-inventory
category: actionable
description: "Build the list of **work bricks** the corpus must make actionable before it can reliably support real team work."
---
# Brick Inventory

## Purpose

Build the list of **work bricks** the corpus must make actionable before it can reliably support real team work.

The P1 → P9 pipeline creates a structural baseline. This skill turns that baseline into an explicit inventory of things the team and agents actually work on: features, APIs, screens, batches, jobs, consumers, integrations, entities, technical mechanisms, reliability scenarios, risks and runtime signals.

## Principle

A corpus is not team-ready because it mapped the repository. It becomes useful for serious adoption only when its important bricks are detailed enough for `developer`, `functional-analyst` and `reliability-analyst` to work without rediscovering the application from scratch.

## When to use

Use after P5 at the earliest, and always before adoption guide generation or broad team use.

Use again when:

- P3 finds new entry points;
- P5 adds APIs/entities/integrations;
- production discovery finds new runtime signals;
- Jira/Confluence reveals active or risky areas.

## Mandatory first reads

1. `doc/_meta/feature-candidates.yaml`
2. `doc/_meta/cross-cutting-state.yaml`
3. `doc/project/apis/CATALOG.md`
4. `doc/project/domain/ENTITIES.md`
5. `doc/project/architecture/INTEGRATION_MAP.md`
6. `doc/project/services/MESSAGING.md`
7. `doc/project/technical/STRUCTURAL_ISSUES.md`
8. `doc/prod/snapshots/` latest production discovery when available
9. `doc/prod/known-bugs/`, `doc/prod/structural-risks/`, `doc/prod/watchlist/`
10. `doc/_indexes/by-project-signal.md`

## Brick taxonomy

Every significant item belongs to one of these kinds:

| Kind | Examples |
|---|---|
| `feature` | user/business capability folder under `doc/project/features/` |
| `api` | REST/SOAP/GraphQL/gRPC endpoint group |
| `screen` | UI page, route, view, workflow surface |
| `batch_or_job` | scheduled job, command, import/export script, batch launcher |
| `consumer_or_listener` | Kafka/JMS/RabbitMQ/SQS/file watcher/listener |
| `integration` | external system link, inbound or outbound |
| `domain_entity` | critical table/entity/value object |
| `technical_mechanism` | auth, storage, logging, config, active CI/CD, legacy CI/CD, migration mechanism |
| `reliability_scenario` | recurring error, incident pattern, watch signal, playbook candidate |
| `risk` | structural, production, security, data, migration or delivery risk |
| `spec_or_change_axis` | active Jira/epic/change area that should be supportable by the corpus |

## Criticality

Classify each brick:

| Criticality | Meaning |
|---|---|
| `critical` | required for production safety, compliance, active roadmap or frequent team work |
| `high` | important for common development, support or analysis tasks |
| `medium` | useful but not a blocker for priority-scope adoption |
| `low` | legacy, rare, peripheral or mostly reference |

## Output files

```text
doc/_meta/brick-inventory.yaml
doc/_meta/actionable-readiness.md
doc/_indexes/by-brick.md
```

## `brick-inventory.yaml` schema

```yaml
bricks:
  - id: "batch-document-import"
    kind: "batch_or_job"
    label: "Document import batch"
    criticality: "critical"
    status: "identified"       # identified | partial | actionable | deferred | not_applicable
    canonical_file: "doc/project/batchs/document-import/README.md"
    source_evidence:
      - "doc/_meta/feature-candidates.yaml"
      - "doc/project/features/document-import-batch/README.md"
    required_detail:
      execution: "missing"
      data: "missing"
      errors: "missing"
      observability: "missing"
      tests: "missing"
      change_impact: "missing"
    actionability:             # optional — per-role breakdown of `status`
      developer: partial       # identified | partial | actionable | not_applicable
      functional_analyst: identified
      reliability_analyst: identified
    cross_refs:                # optional — explicit links the dashboard will surface
      risks: ["RISK-CODE-007"]         # ids from doc/prod/structural-risks/
      known_bugs: ["BUG-002"]          # ids from doc/prod/known-bugs/
      open_questions: ["OQ-003"]       # ids from doc/_meta/open-questions.md
      spec_axes: ["PROJ-364"]           # active Jira keys / spec axes
    blockers: []
    notes: "..."
```

### Field semantics

- `id`, `kind`, `label`, `criticality`, `status`, `canonical_file`, `source_evidence`, `required_detail`, `blockers`, `notes` are **mandatory** (use empty list / `null` / `"missing"` when unknown rather than dropping the key).
- `actionability` is **optional**. When present, every role key carried takes precedence over `status` for that role in dashboards and downstream agents. Use to expose that a brick is `actionable` for `developer` but only `partial` for `reliability_analyst` (typical of bricks with code coverage but no Dynatrace mapping).
- `cross_refs` is **optional** but strongly recommended for any `feature` or `integration` brick that touches a known bug, risk or open question. The dashboard uses these to render in-brick drilldowns without re-walking the file tree. Always reference existing ids — do not invent.

## Anti-patterns: field-name drift

Earlier corpus generations used variant field names that look reasonable but break the canonical schema. **Do not** use these:

| Variant (don't write) | Canonical (write this) |
|---|---|
| `type:` | `kind:` |
| `priority:` | `criticality:` |
| `title:` | `label:` |
| `slug:` | use it inside `id:` if needed |
| `corpus_path:` | `canonical_file:` |
| `companion_files: [README, ARCH, ...]` | `required_detail:` (per-dimension status, not just file presence) |
| top-level `risks:` / `known_bugs:` / `open_questions:` on the brick | nest under `cross_refs:` |

If you encounter an existing `brick-inventory.yaml` using the variant names, do not silently rewrite it during enrichment. Either (a) leave it alone and proceed, or (b) regenerate the whole file from current evidence with the canonical schema. Mixing the two in the same file is the worst outcome.

## Required behavior

1. Inventory from existing corpus outputs first, not from guesses.
2. Create one row per significant brick.
3. Mark criticality from evidence: production usage, Jira activity, compliance, structural risk, active roadmap, operator input.
4. Do not flatten everything into features. If a batch, endpoint, integration or entity needs its own actionable details, create it as its own brick.
5. Update `doc/_indexes/by-brick.md` for navigation.
6. If the same concept appears as a feature and as a technical brick, link them rather than merging away the technical brick.

## Coverage targets

For the inventory to be `covered`:

- every P3 feature candidate appears as a `feature` brick;
- every API group in `CATALOG.md` appears as an `api` brick;
- every messaging channel / consumer / listener appears as `consumer_or_listener` or `integration`;
- every batch/job/scheduler/script family appears as `batch_or_job`;
- every external system in `INTEGRATION_MAP.md` appears as `integration`;
- every critical entity/table appears as `domain_entity`;
- every HIGH/CRITICAL risk appears as `risk`;
- every production signal that may drive investigation appears as `reliability_scenario`.

## Anti-patterns

Do not:

- mark the corpus team-ready from feature folders alone;
- hide batch/job/API/detail gaps under a broad feature README;
- mark a brick `actionable` because it has a name and a link;
- skip low-level operational bricks because the feature-level prose exists.
