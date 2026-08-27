---
type: corpus-entrypoint
status: active
confidence: confirmed
source: pack
last_validated:
title: "Application Corpus"
description: "This directory is the durable knowledge base for the application."
---

# Application Corpus

This directory is the durable knowledge base for the application.

It is designed for two audiences:

- humans who need to understand the system;
- agents that need stable context to analyze, specify, implement, investigate and maintain the system.

## Main entry points

| Need | Start here |
|---|---|
| Understand the corpus layout | [CORPUS_MAP.md](./CORPUS_MAP.md) |
| Understand governance and conventions | [CORPUS_MANIFEST.md](./CORPUS_MANIFEST.md) |
| Understand the application | [project/README.md](./project/README.md) |
| Investigate production behavior | [prod/README.md](./prod/README.md) |
| Work on a change/spec | [spec/template/README.md](./spec/template/README.md) |
| Use connected sources/tools | [mcp/INDEX.md](./mcp/INDEX.md) |
| Inventory MCP/custom sources | [_meta/mcp-source-wizard.md](./_meta/mcp-source-wizard.md) |
| Review durable source contracts | [_meta/information-sources.yaml](./_meta/information-sources.yaml) |
| Review historical source coverage | [_meta/source-coverage.yaml](./_meta/source-coverage.yaml) |
| Check this runtime's source capabilities | `node scripts/check-runtime-sources.mjs --json` and `/sources/runtime-source-probe` |
| Continue roadmap-driven enrichment | [_roadmap/ROADMAP_STATE.md](./_roadmap/ROADMAP_STATE.md), [_roadmap/CORPUS_ROADMAP.md](./_roadmap/CORPUS_ROADMAP.md), [_runs/RUN_LEDGER.md](./_runs/RUN_LEDGER.md) |
| Inspect the knowledge graph | [_graph/README.md](./_graph/README.md) |
| Review current corpus state | [_meta/corpus-state.yaml](./_meta/corpus-state.yaml) |
| Review discovery coverage | [_meta/discovery-coverage.md](./_meta/discovery-coverage.md) |
| Answer blocking questions | [_meta/blocking-questions.md](./_meta/blocking-questions.md) |
| Coordinate deep analysis | [_meta/deep-analysis-plan.md](./_meta/deep-analysis-plan.md) |
| See kickstart progress | [_meta/kickstart-progress.md](./_meta/kickstart-progress.md) |
| Review agent interaction history | [_meta/interaction-history/](./_meta/interaction-history/) |
| Validate corpus structure | [_meta/validation-checklist.md](./_meta/validation-checklist.md) and `node scripts/validate-corpus.mjs` |
| Review repository landscape | [_meta/repository-map.yaml](./_meta/repository-map.yaml) |
| Find cross-cutting knowledge | [_indexes/](./_indexes/) |
| Prepare adoption guide material | [_handover/README.md](./_handover/README.md) |

## Principle

The corpus must be useful before it is exhaustive.

Do not document everything. Capture what improves team work: flows, decisions, risks, operational behavior, known failure modes, source mappings and verified constraints.

## Continuous enrichment model

This corpus is usually started by a corpus operator. The operator runs many short-to-medium enrichment sessions until the corpus is clean and useful enough to create a strong adoption effect with the team.

The roadmap lives in [`_roadmap/`](./_roadmap/), the graph in [`_graph/`](./_graph/), and run history in [`_runs/`](./_runs/). Adoption guide material lives in [`_handover/`](./_handover/) when the operator asks for it.


## Project activity discovery

When Jira, Git/source-control, PR or CI sources are available, the kickstart may include a project activity snapshot under `doc/project/activity/`. It gives a grounded view of current work themes, delivery friction, changed areas and knowledge distribution.

CI/CD evidence is captured under [`project/cicd/`](./project/cicd/). Corpus should identify active pipelines, stale/legacy pipeline definitions, recent commit hotspots and the currently moving bricks before claiming delivery/release knowledge is covered.

## Generic information sources

The pack supports more than predefined tools. Register SQL log databases, APIs, file exports, dashboards, CI/CD data, manual evidence and internal tools in `doc/_meta/information-sources.yaml`. Use `/sources/information-source-onboarding` before using a new source for durable corpus claims.

## Safe operation guardrails

Agents are read-only by default for external systems and high-risk actions. Use `/governance/safe-operation-guardrails` before destructive, broad or external side-effect operations. Prefer dry-runs, diffs, SELECT-only queries, previews and corpus update candidates.

## Corpus validation

Use `/governance/corpus-validation` after kickstart, before adoption guide generation and after significant corpus updates. The deterministic validator is:

```bash
node scripts/validate-corpus.mjs
```

## Kickstart visibility

Use `/governance/corpus-interaction-history` during corpus initialization. `doc/_meta/kickstart-progress.md` is the live operator cockpit: it shows the current phase, generated artifacts, open inputs and next action. `doc/_meta/interaction-history/` keeps synthesized session notes for improving future kickstarts.

During kickstart, `Corpus` should end every response with `/foundations/corpus-status-footer`, a compact summary of completeness by sector and next action.

## Continuous enrichment runs

Use `/continuous/corpus-run` for iterative work after or during discovery. `continue` resumes the active roadmap node from `_roadmap/ROADMAP_STATE.md`; if the active node is unclear, the agent asks which node to resume.

Use `/continuous/roadmap-graph` to maintain the roadmap and graph, `/continuous/corpus-run-audit` to check whether a run capitalized knowledge, `/continuous/next-best-corpus-actions` to recommend the next useful analysis, `/continuous/domain-run-recipes` for common runs such as production analysis, memory analysis, top used features, batch health and Atlassian trajectory, `/governance/post-kickstart-completeness-audit` before saying kickstart is complete or adoption-ready, `/exploration/production-temporal-correlation` for multi-slice production problem analysis crossed with code, and `/exploration/ci-cd-activity-discovery` for active pipeline and recent commit analysis.

When VS Code exposes `agent` / `runSubagent`, broad corpus runs use `/actionable/subagent-coverage-orchestration` by default. Internal subagents cover features, runtime/API/batch, data/integration, reliability and the corpus control plane. The main `Corpus` agent remains the only writer.

## Source contracts, runtime probes and coverage

Use `/sources/mcp-source-wizard` early to inventory Jira, Confluence, Dynatrace, Git hosting, custom MCP servers and non-MCP evidence sources, then register durable declarations in `doc/_meta/information-sources.yaml`.

Use `/sources/runtime-source-probe` before consuming a connected source. It validates a bounded read-only observation for this run and never writes global availability state.

If a required source is unusable in this runtime, the agent must say so clearly
and block the run. Partial continuation requires a structured operator waiver;
the runtime checker provides no un-attested bypass. Existing historical
coverage remains intact; its evidence and freshness live in
`doc/_meta/source-coverage.yaml`.

## Discovery coverage

Use `/governance/discovery-coverage-contract` during kickstart. `doc/_meta/source-coverage.yaml` records source-tree coverage, Jira samples, Confluence searches, Dynatrace production checks and custom source evidence; `doc/_meta/discovery-coverage.md` is the reconciled human view.

## Blocking questions

Use `/governance/blocking-question-loop` when a missing answer blocks coverage. `Corpus` should ask the operator a targeted question, then update `doc/_meta/blocking-questions.md`, `doc/_meta/open-questions.md` and the affected coverage files.

## Deep analysis mode

Use `/governance/deep-corpus-analysis-squad` for serious/full corpus initialization. It coordinates source code, functional/domain, architecture/integration, production/reliability, project/delivery and adoption analysis lanes in `doc/_meta/deep-analysis-plan.md`.
