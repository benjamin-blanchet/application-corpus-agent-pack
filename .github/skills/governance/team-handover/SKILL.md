---
name: team-handover
category: governance
description: "Prepare adoption guide material for the AI champion and broader team once the operator decides the corpus is clean and advanced enough to show."
---
# Adoption Guide

## Purpose

Prepare adoption guide material for the AI champion and broader team once the operator decides the corpus is clean and advanced enough to show.

This skill is used by the `Corpus` agent when the operator asks for adoption/handover material. It is not the natural end of corpus work. Continuous enrichment continues after adoption material exists.

## Hard prerequisite (gate)

Refuse to run if any of the following is true:

| Condition | How to check |
|---|---|
| Operator did not ask for adoption material or adoption readiness review | current request |
| `corpus.code_analysis_status != covered` | `doc/_meta/corpus-state.yaml` |
| `corpus.actionable_readiness_status != covered` | `doc/_meta/corpus-state.yaml` + `doc/_meta/actionable-readiness.md` |
| Critical roadmap state is unknown or missing | `doc/_roadmap/ROADMAP_STATE.md` and `doc/_roadmap/CORPUS_ROADMAP.yaml` |
| Any pipeline pass P1–P9 status != `covered` | `doc/_meta/code-pipeline-state.yaml` |
| `brick_inventory.status != covered` | `doc/_meta/brick-inventory.yaml` |
| Critical/high bricks are not actionable enough for the agreed scope | `doc/_meta/actionable-readiness.md` |
| Critical indexes or prod/project/source routing are inconsistent | `actionable/closeout-consistency-pass` / validator |
| Any feature folder under `doc/project/features/` has `status: candidate` | feature READMEs |
| Any P4-documented feature is missing one of the 6 companion files | feature folders |
| Any P4-documented feature is missing a per-feature interview log without an explicit skip | `doc/_meta/code-interview/<slug>.md` and `_evidence.yaml` |
| Validator (`scripts/validate-corpus.mjs`) reports any P0 finding | run it first |

When the gate is not met, do not write any file under `doc/_handover/`. Instead:

1. Produce an "Adoption guide not yet recommended" report to the operator listing every failed condition with the file path that proves it.
2. Recommend the next bounded action (which pass to run, which feature to interview, which validator finding to fix).
3. Exit.

This rule exists because a structural baseline is not enough. Adoption material should be generated when the operator wants to help the team use the corpus, not because an initialization run happened to end.

## Inputs (when the gate passes)

- `doc/_meta/kickstart-report.md`
- `doc/_meta/source-inventory.md`
- `doc/_meta/coverage-matrix.md`
- `doc/_meta/discovery-coverage.md`
- `doc/_meta/code-pipeline-state.yaml`
- `doc/_meta/code-maturity.yaml` (P8 scorecard)
- `doc/_meta/reconciliation-ledger.yaml` (P9 ledger)
- `doc/_meta/brick-inventory.yaml`
- `doc/_meta/actionable-readiness.md`
- `doc/_roadmap/ROADMAP_STATE.md`
- `doc/_roadmap/CORPUS_ROADMAP.md`
- `doc/_roadmap/NEXT_BEST_ACTIONS.md`
- `doc/_runs/RUN_LEDGER.md`
- `doc/_meta/open-questions.md`
- `doc/_meta/corpus-state.yaml`
- `doc/CORPUS_MAP.md`
- `doc/_indexes/`
- All feature folders documented by P4
- All catalogs produced by P5
- All structural risks promoted by P7
- All architecture diagrams produced by P2 + P5
- Any production, project activity, MCP or spec files created during kickstart

## Outputs

```text
doc/_handover/HANDOVER_SUMMARY.md            # status: active, includes pipeline scorecard + reliable claims + roadmap state
doc/_handover/AI_CHAMPION_GUIDE.md
doc/_handover/TEAM_USAGE_GUIDE.md
doc/_handover/NEXT_30_DAYS.md
doc/_handover/OPEN_DECISIONS.md
doc/_handover/KICKSTART_CLOSEOUT_CHECKLIST.md
doc/_handover/RAPPORT_ETONNEMENT.md           # fresh-eyes report: what surprised the corpus operator, generated at handover close
```

All files are written with `status: active` only after the gate passes.

`RAPPORT_ETONNEMENT.md` is generated last, from `.github/templates/handover/RAPPORT_ETONNEMENT.md.template`. It is a deliberate "fresh-eyes" deliverable: the surprises, smells, fragile spots and surface-level oddities the operator noticed while building the corpus — captured before the operator's eyes acclimatize. Ground each observation in a corpus location (feature folder, risk, bug, reconciliation row); do not invent.

## Required behavior

1. Verify the gate. Stop if it fails.
2. Summarize what the corpus reliably knows, by sector. Cite the catalogs and feature folders that back each claim.
3. Separate confirmed facts (rank 1–3 sources), probable findings (rank 4–6), suspected findings (rank 7+) and unknowns. Use the source priority ranking from `foundations/core-rules`.
4. Highlight the most useful corpus entry points for the team:
   - the architecture diagrams produced by P2/P5;
   - the feature folders documented by P4;
   - the API/entity/integration catalogs produced by P5;
   - the P7 structural-issues report and the P8 maturity scorecard;
   - the reconciliation ledger (P9) — known accepted-unresolved items the team should be aware of.
5. Summarize actionable readiness: critical/high bricks covered, partially actionable bricks, blocked bricks and task families supported.
6. Identify the most important gaps and open decisions (from `doc/_meta/open-questions.md`, `doc/_meta/actionable-readiness.md` and from `accepted_unresolved` items in the P9 ledger).
7. Produce a concrete next-30-days adoption plan. Each item is a bounded action tied to a corpus file.
8. Explain which human-facing agent to use for common team workflows (`developer`, `functional-analyst`, `reliability-analyst`), including what each agent can and cannot yet trust.
9. Include roadmap state, next best actions and continuous enrichment guidance.
10. Update `doc/_meta/corpus-state.yaml` adoption guide fields once the material is produced.

## Adoption maturity model

| Stage | Label | Meaning |
|---|---|---|
| 0 | `pack_copied` | Pack copied, not initialized. |
| 1 | `operator_kickstart_started` | Operator is running the initial exploration. |
| 2 | `structural_baseline_generated` | P1 → P9 structural baseline exists. Not adoption-ready by itself. |
| 3 | `source_discovery_baseline_generated` | Jira/Confluence/Dynatrace/source discovery covered or honestly blocked. |
| 4 | `actionable_corpus_ready` | Critical/high bricks are actionable for normal agent work. **Required before strong adoption material.** |
| 5 | `team_owned_maintenance` | Team maintains the corpus autonomously after adoption. |

This skill may prepare adoption material only when the operator asks for it. It must not convert stage 2/3 into "done" language.

## Quality bar

The adoption guide must be honest. Do not oversell the corpus.

A good adoption guide says clearly:

- what is reliable (rank 1–3 evidence backed);
- what is incomplete (where coverage is `partial`);
- what is still speculative (Confluence-only or interview-only claims);
- what the team should do next;
- how the AI champion prevents corpus decay.

When P9 produced `accepted_unresolved` items, list them in `OPEN_DECISIONS.md` with the reason and the recommended owner.

## Project activity and roadmap in adoption material

Include relevant findings from `doc/project/activity/` and `doc/_roadmap/`: current themes, active risks, stale areas, knowledge concentration, open questions and recommended next runs. Do not present contributor data as individual productivity scoring.

## Anti-patterns

Do not:

- run this skill while the gate is not met;
- generate adoption material from a partial pipeline while presenting it as complete;
- generate adoption material from a structural baseline while hiding roadmap gaps;
- mark adoption guide sectors as `usable` in the status footer when the pipeline is incomplete;
- present Confluence-sourced material as confirmed truth in `HANDOVER_SUMMARY.md`;
- omit P9 `accepted_unresolved` items from `OPEN_DECISIONS.md`;
- omit the P8 maturity scorecard from `HANDOVER_SUMMARY.md`.
