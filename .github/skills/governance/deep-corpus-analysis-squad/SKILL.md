---
name: deep-corpus-analysis-squad
category: governance
description: "Make corpus kickstart behave like a multi-disciplinary analysis team, not a light documentation generator."
---
# Deep Corpus Analysis Squad

## Purpose

Make corpus kickstart behave like a multi-disciplinary analysis team, not a light documentation generator.

This skill coordinates several deep read-only passes over the repository and connected sources so the initial corpus is rich enough for real intervention work: functional analysis, architecture, implementation support, production reliability, project activity and adoption.

## Principle

When sources are available, use them deeply and systematically within safe, read-only bounds.

The goal is to approximate the output of:

- a senior developer reading the source;
- a functional analyst reading tickets and Confluence;
- an architect mapping components and integrations;
- a reliability analyst reading Dynatrace, incidents and risks;
- a delivery analyst reading Jira, Git and CI;
- an operator preparing adoption material.

## When to use

Use this skill:

- on every primary application repository kickstart;
- after pack structure is verified;
- after source inventory, durable registration and required runtime probes;
- before declaring the initial corpus ready for broad adoption.

## Mandatory first reads

1. `doc/_meta/discovery-coverage.md`
2. `doc/_meta/source-coverage.yaml`
3. `doc/_meta/blocking-questions.md`
4. `doc/_meta/mcp-source-wizard.md`
5. `doc/_meta/information-sources.yaml`
6. `doc/_meta/deep-analysis-plan.md`
7. `doc/_meta/kickstart-progress.md`
8. `doc/_meta/code-pipeline-state.yaml`

## Analysis lanes

Run these lanes, or mark each one blocked/partial with a reason:

| Lane | Main sources | Main outputs |
|---|---|---|
| Source code archaeology | repo files, Git | **the entire P1 → P9 code analysis pipeline** (see `exploration/code-exploration`) |
| Functional/domain analysis | Confluence, Jira, code | feature folders enriched on top of P4 outputs, workflows, business rules |
| Architecture/integration analysis | code, Confluence, configs | architecture docs enriched on top of P5 catalogs |
| Production/reliability analysis | Dynatrace, incidents, logs, Confluence OPS/GDC | production snapshot, known bugs, risks, playbooks, watchlist |
| Project/delivery analysis | Jira, Git, PR/CI | activity snapshot, change hotspots, delivery risks |
| Adoption guide analysis | all corpus outputs | adoption summary, next 30 days, open decisions |

The source-code lane runs first and gates the others: `feature-candidates.yaml` (P3) and the catalogs from P5 are what the functional, architecture and reliability lanes enrich.

## Minimum deep-pass expectations

### Source code archaeology

The source-code lane is the **mandatory 9-pass code analysis pipeline** governed by `exploration/code-exploration`:

- P1 `pipeline/p1-code-tree-inventory` — exhaustive tree, every directory walked, every file classified.
- P2 `pipeline/p2-logical-boundaries` — every module mapped, architectural style with evidence.
- P3 `pipeline/p3-feature-candidates` — every entry point classified, every candidate has a folder.
- P4 `pipeline/p4-feature-silo-deep-dive` — every candidate becomes `documented`/`merged`/`split`/`rejected` with a per-feature interview via `pipeline/per-brick-interview`.
- P5 `pipeline/p5-cross-cutting-extraction` — API catalog, domain model, integrations, messaging, persistence, cross-cutting.
- P6 `pipeline/p6-code-style-naming` — actual conventions per layer, lint vs. code reconciled.
- P7 `pipeline/p7-structural-issues` — coupling, parallel impls, dead code, smells; HIGH/CRITICAL promoted to risk files.
- P8 `pipeline/p8-code-maturity` — 12-dimension scorecard.
- P9 `pipeline/p9-code-reconciliation-gate` — all contradictions resolved or `accepted_unresolved`.

The squad does not replace this pipeline; it cannot mark the source-code lane covered until `code_analysis_status: covered` in `doc/_meta/corpus-state.yaml`.

### Functional/domain analysis

- Builds on top of P4 + P5 outputs; does not replace them.
- **Authority follows claim scope.** Code anchors implementation; deployed
  evidence anchors runtime; approved specifications anchor intent; dated
  documentation may anchor history. Preserve scoped differences with revision
  and environment instead of forcing one universal winner.
- Search Confluence by app name, repo name, project key, components and feature slugs from `feature-candidates.yaml` — not by guesses.
- Read relevant pages, not only search result snippets. Capture page ID, last-modified date, last-modified author and a Confluence trust score (`high`/`medium`/`low`/`archival`) per `exploration/confluence-exploration`.
- Reconcile each behavioral Confluence claim against code/migrations/config. Record the result in the feature folder.
- On disagreement: keep the code-backed version as canonical; record the Confluence claim under "Confluence-stated, does not match code" with the page reference; ask via `pipeline/per-brick-interview` whether the divergence indicates a doc bug or a real behavior the code does not yet implement.
- Confluence-only claims must use `source: confluence` and `confidence: probable`, never `confirmed`.
- Enrich each feature folder produced by P4 with operator/Confluence-sourced material (history, intent, edge cases). Do not start from a blank folder when P4 already wrote one.

### Jira/project analysis

- Query last 50 created issues.
- Query last 50 updated issues.
- Query open active issues.
- Query bugs/incidents from the last 90 days.
- Query active epics/versions/sprints when available.
- Record exact JQL and counts.
- Link Jira themes to features, risks and source files.

### Dynatrace/production analysis

If Dynatrace is available, run the broad read-only discovery bundle in `exploration/production-discovery` and the runtime architecture pass in `exploration/dynatrace-runtime-architecture`:

- topology/entity discovery;
- runtime architecture and surrounding ecosystem;
- inbound callers, entry services, protocols and operations;
- outbound dependencies, external services, databases, queues and gateways;
- service-to-service graph around the product;
- representative logs, metrics and traces over bounded 24h/7d/30d windows;
- last 24h service health;
- last 7d errors;
- last 7d latency hotspots;
- last 30d trend query when useful;
- dependency failures;
- restarts/crashes/availability;
- batch/consumer/job signals;
- monitoring gaps.

If Dynatrace is not attached but expected, ask a blocking question immediately.

### Incident/reliability analysis

- Read REX/incident pages available in Confluence.
- Convert confirmed recurring bugs into `doc/prod/known-bugs/`.
- Convert systemic weaknesses into `doc/prod/structural-risks/`.
- Convert repeatable investigation paths into `doc/prod/root-cause-playbooks/`.
- Add monitoring focus to `doc/prod/watchlist/`.

## Non-stub rule

Do not create feature files that are only placeholders.

A feature file can remain intentionally short only if:

- there is no available evidence;
- the limitation is recorded in `doc/_meta/discovery-coverage.md`;
- a blocking question was asked when a human answer could help.

Otherwise, populate it with evidence-backed content or do not mark the feature folder as covered.

## Output tracking

Update `doc/_meta/deep-analysis-plan.md` after each lane.

Each lane must record:

- status;
- sources used;
- queries/searches/files read;
- outputs created;
- remaining gaps;
- blocking questions asked;
- next lane.

## Completion gate

Do not call a corpus "ready for adoption" unless:

- the source-code lane shows `code_analysis_status: covered` (P1 → P9 all `covered`);
- every other deep-analysis lane is `covered`, `partial`, `blocked` or `not_applicable` with a recorded reason;
- every feature folder produced by P4 is non-stub or marked `merged`/`split`/`rejected`;
- every available source has been used to its coverage target;
- production discovery is either complete enough or explicitly blocked by missing tooling/access;
- `doc/_meta/deep-analysis-plan.md`, `doc/_meta/discovery-coverage.md`, `doc/_meta/code-pipeline-state.yaml` and `doc/_meta/reconciliation-ledger.yaml` are updated.

## Anti-patterns

Do not:

- stop after a first high-level repo map;
- mark Jira available without running actual JQL samples;
- mark Confluence available without reading relevant pages;
- leave discovered bug catalogues uncaptured;
- mark production as partial without trying Dynatrace or asking for attachment;
- produce adoption material from a thin corpus;
- hide thin coverage behind confident prose.
