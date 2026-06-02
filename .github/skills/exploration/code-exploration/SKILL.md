---
name: code-exploration
category: exploration
description: "Extract application facts from the repository regardless of stack. This skill is the **entry point** for the deep code analysis pipeline. It does not extract knowledge by itself — it dispatches to the right pass."
---
# Code Exploration

## Purpose

Extract application facts from the repository regardless of stack. This skill is the **entry point** for the deep code analysis pipeline. It does not extract knowledge by itself — it dispatches to the right pass.

The deep code analysis is the first vector of corpus knowledge. Every later corpus area (production, project activity, adoption guide material) leans on it.

## Pipeline overview

Code analysis is a 9-pass pipeline. Each pass has its own skill, its own coverage targets and a hard gate that blocks the next pass.

| # | Skill | Output | Blocks until |
|---|---|---|---|
| P1 | `pipeline/p1-code-tree-inventory` | exhaustive file/dir inventory + classification | every directory walked, every file classified |
| P2 | `pipeline/p2-logical-boundaries` | modules, layers, architectural style | every module mapped, style recorded with evidence |
| P3 | `pipeline/p3-feature-candidates` | entry points + grouped candidates + folder skeletons | every entry point classified, every candidate has a folder |
| P4 | `pipeline/p4-feature-silo-deep-dive` | non-stub feature folders + per-feature interviews | every candidate is `documented`/`merged`/`split`/`rejected` and its interview is logged |
| P5 | `pipeline/p5-cross-cutting-extraction` | API catalog, domain model, integrations, messaging, persistence, cross-cutting | every API/entity/integration listed |
| P6 | `pipeline/p6-code-style-naming` | actual naming/style/conventions per layer | every layer has a style sheet, lint vs. code reconciled |
| P7 | `pipeline/p7-structural-issues` | coupling, parallel impls, dead code, smells | each category covered, HIGH+ findings promoted to risk files |
| P8 | `pipeline/p8-code-maturity` | scorecard across 12 dimensions | every dimension scored or marked `n/a` |
| P9 | `pipeline/p9-code-reconciliation-gate` | resolved contradictions, final code coverage flag | every contradiction resolved or `accepted_unresolved` |

The pipeline is **mandatory** for any kickstart on a primary application repository. It is not opt-in. There is no "light" mode.

## How to use this skill

1. Read `doc/_meta/code-pipeline-state.yaml`. If it does not exist, initialize it with all passes `not_started`.
2. Identify the next pass that is not `covered`.
3. Invoke its skill. Do not skip ahead.
4. After each pass, re-read `code-pipeline-state.yaml` to confirm the pass status before continuing.
5. After P9 finishes, the validator (`scripts/validate-corpus.mjs`) recognises `code_analysis_status: covered`. Only then can the corpus present its code baseline as structurally covered.

For P1, start with the deterministic helper:

```bash
node scripts/inventory-repo.mjs
```

The helper gives the agent measured filesystem counts and a reproducible first classification. Manual enrichment is allowed, but the measured inventory remains the baseline.

## Mandatory first reads (before invoking any pass)

1. `doc/CORPUS_MAP.md`
2. `doc/CORPUS_MANIFEST.md`
3. `doc/_meta/code-pipeline-state.yaml`
4. `doc/_meta/discovery-coverage.md`
5. `doc/_meta/blocking-questions.md`

## Canonical paths

- Corpus root: `doc/`
- Pipeline state: `doc/_meta/code-pipeline-state.yaml`
- Inventory: `doc/_meta/code-inventory.{md,yaml}`
- Boundaries: `doc/_meta/logical-boundaries.yaml`
- Feature candidates: `doc/_meta/feature-candidates.yaml`
- Per-feature evidence: `doc/project/features/<slug>/_evidence.yaml`
- Cross-cutting state: `doc/_meta/cross-cutting-state.yaml`
- Style: `doc/_meta/code-style-state.yaml`
- Structural: `doc/_meta/structural-issues.yaml`
- Maturity: `doc/_meta/code-maturity.yaml`
- Reconciliation: `doc/_meta/reconciliation-ledger.yaml`
- Interviews: `doc/_meta/code-interview/<slug>.md`

## Required behavior

1. Never start P(N+1) before P(N).status is `covered`.
2. Never silently skip a directory, an entry point, an entity, an integration or a category. If it cannot be processed, record why.
3. Never write feature business prose at P1–P3. Business writing is exclusively P4.
4. Use `governance/blocking-question-loop` for ad-hoc unblockers (1–3 questions).
5. Use `pipeline/per-brick-interview` for structured 5–15 question rounds tied to a specific brick (mandatory for each P4 feature).
6. Update `doc/_meta/discovery-coverage.md` repository row at the end of every pass with the concrete metrics from that pass.

## Replay policy

Each pass is independently replayable:

- After a major refactor, re-run P1 → P9 in order.
- After adding a single feature/module, re-run P1 (incremental), P2, P3, P4 (for new candidates only), then P5/P7/P9 to keep cross-cutting catalogs and reconciliation in sync.
- Re-running P8 alone is allowed for a fresh scorecard, as long as the underlying state has not changed since the previous pass run.

## Coverage contract integration

This skill satisfies `governance/discovery-coverage-contract` for the repository row. The repository row in `doc/_meta/discovery-coverage.md` must reflect the concrete metrics produced by each pass:

- files inventoried, exclusions, CI systems found (P1);
- modules and architectural style (P2);
- entry points and candidate counts (P3);
- features documented (P4);
- API/entity/integration/topic counts (P5);
- style sections written (P6);
- structural finding counts (P7);
- maturity overall score (P8);
- contradictions resolved (P9).

A row that says only "covered" without these numbers is non-compliant.

## Anti-patterns

Do not:

- run a "high-level look at the code" instead of P1;
- write feature folders before P3 has classified entry points;
- mark code analysis covered while any pass is `partial` or `blocked`;
- describe architecture from the README instead of from code;
- batch all features through P4 then interview at the end (P4 forbids this);
- prepare adoption guide material while the pipeline is incomplete.
