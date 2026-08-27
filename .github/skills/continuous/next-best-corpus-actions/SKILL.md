---
name: next-best-corpus-actions
category: continuous
description: "Maintain practical guidance for what the operator and Corpus agent should do next."
---
# Next Best Corpus Actions

## Purpose

Maintain practical guidance for what the operator and Corpus agent should do next **inside the corpus**.

This skill does not force a single path. It recommends the most valuable next **corpus action** — next roadmap node to deepen, next analysis to run, next source to enrich, next operator interview — based on roadmap interest, production signals, code risk, source gaps, operator input and current context.

**Scope, non-negotiable.** Recommendations are always corpus actions, never delivery work (implementation, spec, ticketing, remediation, incident triage). The "Reliability risk" and "Production criticality" factors below weight **which corpus node deserves the next analysis pass**, not which bug to dispatch elsewhere. A captured bug, risk or drift is corpus knowledge already complete — it never appears here as a "to fix" item or as a hand-off. Never name another pack agent nor an `authoring/*` / `development/*` skill in a recommendation: those areas fall outside the corpus scope and you have no business knowing them. See `corpus.agent.md` § Scope boundaries for the prohibited wording list.

## When to use

Use this skill:

- at the end of every continuous run;
- when the operator asks "quoi faire ensuite", "where are we", "continue what?";
- after a roadmap branch reaches a natural pause;
- after Dynatrace/Jira/Confluence/source discovery creates many possible branches.

## Mandatory reads

1. `doc/_roadmap/CORPUS_ROADMAP.yaml`
2. `doc/_roadmap/NEXT_BEST_ACTIONS.md`
3. `doc/_roadmap/ROADMAP_STATE.md`
4. `doc/_runs/RUN_LEDGER.md`
5. `doc/_meta/brick-inventory.yaml`
6. `doc/_meta/actionable-readiness.md`
7. `doc/_meta/discovery-coverage.md`
8. Recent production/project activity files when relevant.

## Scoring factors

Use judgment, not mechanical arithmetic. Consider (in this order — the
first factor is dominant whenever the code baseline is incomplete):

| Factor | Signal |
|---|---|
| **Code-baseline progress** (dominant) | Is `corpus.code_analysis_status` in (`not_started`, `started`, `partial`)? Is any P1–P9 pass still below `covered`? Is `doc/_meta/repository-map.yaml` still on `name: unknown` or `source-inventory.md` missing? Are there code-derived features/APIs/batches/components/integrations discoverable from the repo but not yet documented? When yes, advancing the code-pipeline / retrodocumentation **outranks every other factor below**. See `foundations/core-rules § Code-first principle`. |
| Production criticality | High traffic, errors, latency, memory, batch failures, incidents, customer impact. |
| Delivery value | Active Jira epics, release pressure, migration, frequent changes. |
| Corpus weakness | Important node has low code/prod/Jira/Confluence coverage. Code-coverage gaps weigh more than prod/Jira/Confluence-coverage gaps on the same node. |
| User interest | Operator explicitly wants to work on it. |
| Reliability risk | Known bug, structural risk, watchlist or fragile dependency. |
| Leverage | Deepening this node unlocks many linked nodes. Code-derived nodes (features, APIs, batches, integrations, components) outrank purely-prod nodes by default — they are the spine the rest of the corpus hangs on. |
| Feasibility | Tools/MCP are available and the next run can stay bounded. |

Every recommendation should include an `interest_to_continue` score from 0 to 10 and a justification.

**Dominance rule — non-negotiable.** When `corpus.code_analysis_status != covered`, the top recommendation must be a code-pipeline / retrodocumentation action (advance P1, P2, … through P9), unless the operator has explicitly redirected to a bounded enrichment lane. A `Recommended next` line that proposes prod / Jira / Confluence / dashboard work while the code spine is incomplete is a discipline failure — surface the code gap first and propose the corresponding pipeline pass. After `code_analysis_status == covered`, code-derived nodes still win ties against purely-prod nodes by default.

## Output file

**`doc/_roadmap/NEXT_BEST_ACTIONS.md` is a derived artefact, not a journal.**
It is regenerated from scratch at the end of every run from the
freshly-recomputed `corpus-state.yaml` + the dominance rule + the
current operator intent. Prior entries do not carry by inertia.

The file header must include the line:

```
> Derived artefact — regenerated from scratch at end of every run by `continuous/next-best-corpus-actions`.
> Do not hand-edit. Recommendations that are still relevant re-emerge from the current scoring on their own.
```

Each regenerated entry contains:

- top recommendations (in priority order, code-baseline progress dominant when not covered);
- why each one matters **now** (not "still relevant from last week");
- expected sources/tools;
- expected corpus updates;
- whether the agent should ask before starting.

## Regeneration discipline (load-bearing)

`NEXT_BEST_ACTIONS.md` is a **direction-carrying file** read by every
agent at session start. Stale entries in this file lock the agent on a
stale direction even when every other rule says otherwise — observed
in real corpora usage. The fix:

1. **Discard.** At the end of every run, treat the existing file
   content as obsolete. Read it once for diff-reporting purposes if
   useful, then ignore.
2. **Recompute the state first.** Run `node scripts/recompute-corpus-state.mjs --apply --json`
   so the scoring inputs are fresh. A regeneration on a stale state is
   useless.
3. **Re-score from scratch.** Apply the Scoring factors and the
   Dominance rule to the current roadmap nodes, validator findings,
   recent operator interactions, code-pipeline state. Do not preserve
   prior entries because they "still seem right" — let them re-emerge
   from current scoring.
4. **Write fresh.** Replace the file content entirely with the
   regenerated recommendations, header banner included.
5. **Surface in recap.** Mention in the operator recap if the top
   recommendation changed from the prior run, with one sentence on
   why (new validator P0, new operator focus, code pipeline advanced,
   etc.).

A recommendation that survives 3+ consecutive regenerations without
operator action is a signal — either the operator is deferring, or the
recommendation is mis-scored. Surface this as a blocking-question
candidate, do not just keep re-emitting it.

## Chat behavior

At the end of a run, show one context-aware recommendation, sometimes with two alternatives:

```text
Recommended next:
- I would continue on Production > Top used features > <feature> because it carries 30% of observed traffic and the code/prod corpus is still thin.
```

If the operator asks for choices, provide up to 3.

## Hard guard on adoption-ready language

Before writing any entry in `NEXT_BEST_ACTIONS.md` (or stating it in chat), cross-check `doc/_meta/corpus-state.yaml` and `doc/_meta/actionable-readiness.md`. The wording must match the current readiness label exactly.

Forbidden wording — `all gates passed`, `corpus ready for team onboarding`, `corpus is adoption ready`, `ready for handover`, `team can adopt`, or any equivalent phrasing that implies broad team adoption — is only permitted when **all** of the following hold:

- `corpus.actionable_readiness_status: covered` in `corpus-state.yaml`
- `adoption.readiness_status: adoption_candidate` (or stronger) in `corpus-state.yaml`
- `actionable-readiness.md` conclusion label is `adoption_ready`

If `actionable_readiness_status` is `partial` (or anything other than `covered`), or the conclusion label is `actionable_for_priority_scope`, `partially_actionable` or `baseline_created_not_actionable`, every entry that touches the adoption guide, team handover, or "gates" must:

1. Name the actual label verbatim (e.g. `actionable_for_priority_scope`).
2. State the scope it applies to (which bricks / which workflows).
3. Describe what is still missing before the broader `adoption_ready` label can be claimed.

When in doubt, prefer the lower label. Optimistic wording on a Track that involves the adoption guide is a corpus-truth bug, not a style choice — it leaks into downstream agent decisions and survives reconciliation passes if not flagged.

## Reconciliation discipline

When this skill runs as a reconciliation pass over an existing `NEXT_BEST_ACTIONS.md`:

- Re-read **every** entry against the current `corpus-state.yaml`, not only the ones you intend to change.
- Adoption / team-handover / "gates passed" entries are the highest-risk; check them first, every time, even when the planned reconciliation scope is elsewhere.
- Record in `RUN_LEDGER.md` which entries were re-validated (not only which were edited), so the next pass can see that the adoption-language guard was applied.

## Anti-patterns

- Always recommend adoption material.
- Recommend a deep run without checking durable source contracts, historical coverage and the capabilities needed in this runtime.
- Show a huge roadmap when a short next action is enough.
- Ignore the operator's current line of thought.
- Write "all gates passed" or "ready for team onboarding" without verifying both `corpus-state.yaml` flags and the `actionable-readiness.md` label above.
- Reconcile only the entries you plan to change and leave older optimistic wording untouched on adoption / handover entries.
- Recommend "fix BUG-…", "invoke … on …", "hand off to …", "write the
  spec", "open a ticket", "prepare the PR" — any implementation, spec,
  ticketing or triage action is outside the corpus scope.
  Recommendations are corpus actions only. A captured bug, risk
  or drift is knowledge already capitalized, not a backlog item waiting
  in this file.
- Name another pack agent or an `authoring/*` /
  `development/*` skill in a recommendation, even to pre-format the
  delivery-side follow-up. Naming it = opening the door to suggesting it; the
  right phrasing hands control back to the operator without pre-formatting:
  "BUG-014 captured under `doc/prod/known-bugs/`. It's up to you to say whether we
  dig into another area of the corpus or whether you move on elsewhere."
- Recommend a prod / Jira / Confluence / dashboard action as the top
  recommendation while `corpus.code_analysis_status != covered`. The
  code-baseline progress factor is dominant — when the spine is
  incomplete, the next best action is to advance it. Operator-redirected
  enrichment work is the only legitimate exception, and must be flagged
  as such in the justification.
- Append to `NEXT_BEST_ACTIONS.md` instead of regenerating it. The file
  is a derived artefact, not a journal — appending preserves stale
  entries that lock the agent on stale direction. See § Regeneration
  discipline.
- Carry forward a prior entry "because it still looks right" without
  running it through the current scoring. If it is still right, it
  re-emerges; if it does not, it is stale.
- Regenerate `NEXT_BEST_ACTIONS.md` without first running
  `recompute-corpus-state.mjs --apply`. A regeneration on stale state
  inputs reproduces the lock-in instead of breaking it.
