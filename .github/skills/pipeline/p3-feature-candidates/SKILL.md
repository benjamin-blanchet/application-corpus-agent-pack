---
name: p3-feature-candidates
category: pipeline
description: "Enumerate every observable **entry point** of the application from P1+P2 evidence, group them into **feature candidates**, and scaffold a feature folder for each candidate."
---
# Feature Candidates (Pass 3 / 9)

## Purpose

Enumerate every observable **entry point** of the application from P1+P2 evidence, group them into **feature candidates**, and scaffold a feature folder for each candidate.

A feature candidate is a working hypothesis: "this set of entry points seems to deliver one coherent capability". P4 will confirm, refine, split, merge or reject each candidate.

## Prerequisite

`p1_tree_inventory.status == covered` AND `p2_logical_boundaries.status == covered`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/project/architecture/MODULES.md`
4. `doc/_indexes/by-feature.md` (if it exists)
5. `doc/_meta/code-pipeline-state.yaml`
6. `doc/_meta/code-activity-signals.yaml` (if it exists — see Prioritization input below)

## Prioritization input

If `doc/_meta/code-activity-signals.yaml` exists with `meaningful_history: true`, use it to **order** the candidate list — not to filter it. Every entry point is still enumerated; the list is **ranked by aggregate folder score** of the candidate's modules so that the most-active candidates appear first in `feature-candidates.yaml` and in `doc/_indexes/by-feature.md`.

When the signal is missing or `meaningful_history: false`, fall back to module-order then alphabetical. Surface the fallback in the P3 output so the operator knows the ranking is not activity-driven.

The order matters because P4 iterates features one at a time. With activity-driven ranking, the operator gets useful corpus depth on the team's current focus areas in the first hours of P4, instead of after a full alphabetical sweep.

## Required behavior

1. Walk the inventory and extract every concrete entry point (see catalog below).
2. For each entry point, capture its file path, signature/route/topic/queue/job name and the module it belongs to.
3. Group entry points into candidates using the grouping rules.
4. For each candidate, create a feature folder skeleton in `doc/project/features/<slug>/` with placeholder companion files **and an explicit `status: candidate` in the README frontmatter** so it is clear P4 has not run yet.
5. Update `doc/_indexes/by-feature.md` with all candidates.
6. Record the entry-point evidence so P4 can start without re-walking the tree.

## Entry point catalog

Enumerate (and never silently skip) all of these where they exist:

| Kind | Where to look |
|---|---|
| HTTP routes | `@RestController`/`@Controller`/`@RequestMapping`, Express `app.get/post/...`, Flask `@route`, FastAPI `@app.*`, Symfony routes, Rails `routes.rb`, .NET `[HttpGet]`, OpenAPI specs |
| GraphQL resolvers | `@Resolver`, schema files, code-first decorators |
| gRPC services | `*.proto` services + their generated/implemented servers |
| SOAP endpoints | `@WebService`, WSDL files |
| WebSocket / SSE handlers | `@MessageMapping`, Socket.IO handlers, EventSource |
| UI screens | JSF `*.xhtml`, Vue/React/Svelte page components, Angular routes, Blazor pages |
| CLI commands | `@Command`, argparse parsers, click commands, cobra commands, npm scripts that invoke a binary |
| Scheduled jobs | `@Scheduled`, cron declarations, k8s CronJob, Quartz, Hangfire, Airflow DAGs, GitHub Actions schedules |
| Message consumers | Kafka `@KafkaListener`, JMS `@JmsListener`, RabbitMQ consumers, SQS pollers, Pub/Sub subscriptions, Azure Service Bus handlers |
| Message producers (when they are an entry point) | webhook receivers that re-publish, edge ingestion |
| Batch launchers | `main()` in batch modules, Spring Batch `Job`, custom `Launcher` classes |
| Stream processors | Flink/Spark jobs, Kafka Streams topologies, Beam pipelines |
| Webhooks | inbound webhook handlers from external systems |
| External callbacks | OAuth callback routes, payment provider callbacks, SAML ACS |
| File watchers / FTP / file drops | configured directories, polling jobs |
| Page lifecycle hooks | when they expose business behavior (Next.js `getServerSideProps`, Nuxt `asyncData` if non-trivial) |
| Server actions / RPC | Next.js server actions, tRPC procedures |

For each entry point, record:

```yaml
- id: "<stable-slug>"
  kind: "http_route|kafka_consumer|jms_consumer|cli|ui_screen|scheduled_job|..."
  module: "myapp-webapp"
  file: "myapp-webapp/src/main/java/com/example/controller/duplicate/DuplicateController.java"
  symbol: "DuplicateController.send"
  route_or_topic: "POST /duplicate"
  trigger: "operator|external_system|schedule|message"
  upstream: "JSF page duplicate.xhtml"
  downstream_hint: ["Print service", "DuplicateDAO"]
```

## Grouping rules

A feature candidate groups entry points that:

1. Share a controller/handler folder (`controller/duplicate/*` → candidate `duplicate`), OR
2. Share a domain noun in the name (`*Archive*`, `*Archiver*`, `archive.*` topic → `archive`), OR
3. Share a UI screen tree (`/duplicate/*` JSF pages + their backing beans), OR
4. Are explicitly named in module/package (`features/recherche/`).

When in doubt, **create a separate candidate**. Splitting later is cheap; merging hidden behavior is dangerous.

For cross-cutting entry points (login, health checks, admin tooling), use the bucket `_cross-cutting/` instead of forcing them into a feature.

## Output files

```text
doc/_meta/feature-candidates.yaml                       # full candidate list with entry points
doc/project/features/<slug>/README.md                   # status: candidate, entry points listed
doc/project/features/<slug>/_evidence.yaml              # entry-point evidence for P4
doc/_indexes/by-feature.md                              # updated
doc/_meta/code-pipeline-state.yaml                      # P3 status
```

### `feature-candidates.yaml` schema

```yaml
candidates:
  - slug: "duplicate"
    label: "Duplicate (document resend)"
    confidence: "probable"           # probable | weak | derived-from-naming
    grouping_rule: "controller-folder + UI-screen-tree"
    modules_involved: ["myapp-webapp", "myapp-lib"]
    entry_points:
      - id: "ui-duplicate-page"
        kind: "ui_screen"
        file: "myapp-webapp/src/main/webapp/duplicate.xhtml"
      - id: "controller-duplicate-send"
        kind: "http_route"
        file: ".../DuplicateController.java"
        symbol: "DuplicateController.send"
    related_data:
      tables_hint: ["DUPLICATE", "PROCESSING"]
      messages_hint: []
    related_external:
      systems_hint: ["Print"]
    open_questions: []
cross_cutting:
  - slug: "auth"
    entry_points: [...]
unclassified_entry_points: []        # MUST be empty before P3 → covered
```

### Feature README scaffold (P3 output)

```markdown
---
type: feature
status: candidate
confidence: weak
source: code
last_validated: "YYYY-MM-DD"
pipeline_phase: p3
---

# Feature: <Label>

> Status: **candidate** — produced by P3. Awaiting P4 deep dive.

## Entry points (from P3)

| Kind | File | Symbol / route |
|---|---|---|
| ... | ... | ... |

## Modules involved

- ...

## Hypotheses to confirm in P4

- ...

## Open questions for the operator

- ...
```

Companion files (`ARCHITECTURE.md`, `WORKFLOWS.md`, `BUSINESS_RULES.md`, `OPERATIONS.md`, `AI_AGENT_GUIDE.md`) are **not** created at P3. They are the responsibility of P4 and must be evidence-backed when written.

## Coverage targets (gate for P3 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Entry points enumerated vs. entry points present in code | 100% | yes |
| Each entry point belongs to exactly one candidate or to `_cross-cutting` | 100% | yes |
| `unclassified_entry_points` length | 0 | yes |
| Feature folder created for every candidate | 100% | yes |
| `by-feature.md` index lists every candidate | 100% | yes |

## Blocking questions

Use `governance/blocking-question-loop` when:

- two candidates have heavily overlapping entry points and you cannot decide whether to merge — ask the operator for the canonical name;
- an entry point exists but the module it lives in has `role: unknown` from P2 — block on P2 first;
- a domain noun appears in many places with inconsistent casing/spelling (`Archive`, `archiver`, `archiveV2`) — ask which is the canonical feature name.

## Status update

```yaml
pipeline:
  p3_feature_candidates:
    status: covered|partial|blocked
    last_run: "..."
    entry_points_found: <int>
    candidates_created: <int>
    cross_cutting_buckets: <int>
    unclassified_entry_points: <int>
    blocks_next_pass: true|false
```

## Anti-patterns

Do not:

- skip an entry-point kind because the framework "is obvious" (every kind from the catalog must be checked);
- write business prose into a candidate README (P3 only lists evidence);
- merge candidates to keep the count small;
- mark P3 covered with unclassified entry points;
- create `WORKFLOWS.md` / `BUSINESS_RULES.md` etc. at this stage.
