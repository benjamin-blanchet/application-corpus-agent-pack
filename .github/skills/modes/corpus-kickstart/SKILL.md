---
name: corpus-kickstart
category: modes
lifecycle: init-only
description: "Mode skill loaded by the `corpus` agent when the operator's intent is to start, initialize, bootstrap, advance or assess the corpus. Triggers: 'init le corpus', 'kickstart', 'lance le corpus', 'continue', 'fais l'analyse complète du repo', 'where are we on the corpus', or bare 'init/kickstart/continue'. Also auto-engaged when foundational roadmap/graph is missing or code_analysis_status != covered."
owner: corpus
write_scope: ["doc/**", "doc/_meta/**", "doc/_roadmap/**", "doc/_graph/**"]
references:
  - procedure-steps.md
  - procedure-multi-repo.md
  - procedure-pipeline.md
  - procedure-readiness.md
---

# Corpus Kickstart Mode

> Loaded by `corpus` when the operator's intent is corpus initialization,
> bootstrapping, deep analysis or "where are we" assessment.

Kickstart is **resumable, not restartable**. Always check what is already
done before generating anything.

## Trigger detection

You enter Kickstart mode whenever the operator's request is about
starting, initializing, bootstrapping, advancing or assessing the corpus:

- "init le corpus", "initialise le corpus", "kickstart"
- "lance le corpus", "commence le corpus", "démarre le corpus"
- "start the corpus", "set up the corpus", "bootstrap the corpus"
- "where are we on the corpus", "continue the corpus", "resume kickstart"
- "fais l'analyse complète du repo", "run the deep analysis"
- "déclenche la pipeline", "run the code analysis pipeline"
- a bare "init", "kickstart" or "continue" with no other context

If the request is ambiguous (could be kickstart or something else),
default to **state verification first**: read the mandatory files below,
summarize what is already done, and ask the operator one targeted question
via `governance/blocking-question-loop` to confirm the intent before any
destructive work.

You also enter Kickstart mode automatically when the foundational roadmap
or graph is missing, or when `corpus.code_analysis_status != covered` and
the operator asks for broad corpus initialization.

## Mandatory reads (kickstart mode)

In addition to the persona's always-on reads (`corpus-state.yaml`,
`ROADMAP_STATE.md`):

1. `doc/_meta/code-pipeline-state.yaml`
2. `doc/_meta/discovery-coverage.md`
3. `doc/_meta/kickstart-progress.md`
4. `doc/_meta/blocking-questions.md`
5. `doc/_meta/brick-inventory.yaml`
6. `doc/_meta/actionable-readiness.md`
7. `doc/_meta/app-profile.yaml` — including the `application.multi_repo` block
8. `doc/_roadmap/CORPUS_ROADMAP.yaml`
9. `doc/_roadmap/NEXT_BEST_ACTIONS.md`
10. `doc/_runs/RUN_LEDGER.md` (last 10 rows)

When `application.multi_repo.status == declared` or any external peer is
declared, also resolve and read peer corpus indexes per `procedure-multi-repo.md`.

## Procedure dispatch

| Situation | Load |
|---|---|
| Every kickstart run | `procedure-steps.md` (Steps 0 → 11) |
| Multi-repo workspace or external peer corpora | also `procedure-multi-repo.md` |
| Code pipeline P1 → P9 active | also `procedure-pipeline.md` |
| Post-pipeline actionable readiness | also `procedure-readiness.md` |

## Code-first pre-flight gate

Before any prod/Jira/Confluence-deep work, read
`doc/_meta/code-pipeline-state.yaml` and apply:

| `code_analysis_status` | Behavior |
|---|---|
| `covered` | Proceed normally. |
| `partial` | **One bounded artefact.** No multi-iteration deep dive, no temporal correlation, no recurring auto-loop. Surface the gap; propose advancing the code pipeline. |
| `not_started` / `started` | **Refuse the deep work, redirect.** 1-snapshot inventory only; redirect to `pipeline/p1-code-tree-inventory`. |

**Anti-loop discipline**: in a single session, the same prod-flavored skill
is invoked **at most once** when code is `partial`. If the operator's
pattern pulls into multiple prod-deep runs while code is uncovered, surface
the loop and propose returning to the code pipeline.

## Subagent acceleration (when available)

When `runSubagent` or `agent` tools are available and the scope is broad
(multiple independent brick families, >10 critical/high items, full
kickstart, actionable readiness, post-kickstart completeness, large
"continue/analyse tout" request), use
`actionable/subagent-coverage-orchestration` by default. If subagents are
available but not used, record why in the run ledger.

Subagents are helpers only: they return coverage reports. The main `Corpus`
agent writes corpus files and owns gates.

## Operator visibility

The operator should never have to say "continue" blindly.

- Before each long continuation, show a kickstart checkpoint (phase, done,
  generated/updated, open inputs, next bounded action).
- Update `doc/_meta/kickstart-progress.md` with the same state.
- End every kickstart response with `foundations/corpus-status-footer` (9
  passes line-by-line).
- Do not silently fall back when expected MCP tools are unavailable.
  State the missing source and which discovery is blocked.
- Do not park blocking points silently — ask via `governance/blocking-question-loop`.

## State updates (kickstart mode end-of-run)

Apply the persona's end-of-run contract (recap + drift check + dashboard
rebuild). Additionally:

- Update `doc/_meta/kickstart-progress.md` with the current phase and
  next action.
- Update `doc/_meta/discovery-coverage.md` if any coverage status changed.
- Update `doc/_meta/code-pipeline-state.yaml` if a pipeline pass advanced.

Do not describe a run as "handover ready" or "adoption ready" unless the
operator explicitly asks for adoption material or an adoption readiness
review. See `procedure-readiness.md`.
