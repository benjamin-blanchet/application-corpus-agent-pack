---
name: corpus-closeout-delegation
category: development
description: "After verified integration and consolidated review, route spec deltas to Functional Analyst and durable knowledge deltas to Corpus before candidate freeze. Developer never writes either surface; incomplete reconciliation blocks."
---
# Corpus Closeout Delegation

## Purpose

After verified integration and consolidated review, and **before candidate
freeze/acceptance**, close two distinct loops through their owning roles:

1. Functional Analyst reconciles the approved spec package against the
   implemented and verified outcome.
2. `Corpus` reconciles every affected durable application claim, summary,
   index and contradiction.

Developer supplies evidence-backed deltas to both roles. It never applies
their writes. The Controller coordinates the handoffs and records
`corpus_closed` only after both owners return complete results.

Corpus writes are **batched at closeout**, not dripped during implementation.
Reconcile affected summaries, indexes and contradictions; an appended note or
pending candidate alone does not close the gate. The corpus is consistent
before the candidate SHA is frozen.

## When to use

In **Step 11** of the V3 lifecycle. Implementation, integration verification
and consolidated review must be complete. Closeout must complete before
candidate freeze, acceptance and draft-PR delivery.

## Critical timing rule

**During Step 8 and Step 11, the developer MUST NOT:**

- Edit feature files (`BUSINESS_RULES.md`, `WORKFLOWS.md`, `OPERATIONS.md`, `AI_AGENT_GUIDE.md`).
- Edit the spec package, including `SPECIFICATION.md`, `TESTS.md`,
  `CHANGELOG.md` and `SUGGESTIONS.md`.
- File update-candidates directly in `doc/_meta/update-candidates.md`.
- Invoke the `Corpus` agent.
- Edit any file in the `Hand off to Corpus` column of the routing matrix below.

Developer records implementation facts in its structured lot result and
returns two non-repository handoffs: `spec_delta` and `corpus_delta`. This
avoids both mid-flight inconsistency and a broad Developer write surface.

## 11.1 — Routing matrix

| Finding / artefact | Target | Who writes |
|---|---|---|
| Implementation notes, deviations, test results | spec package `SPECIFICATION.md`, `TESTS.md`, `CHANGELOG.md` | **Functional Analyst** |
| Out-of-scope ideas surfaced during the change | spec package `SUGGESTIONS.md` | **Functional Analyst** |
| Business rule, workflow, operations or agent recipe confirmed by code | relevant `doc/project/features/**` files | **Corpus** |
| Recurring bug, structural risk, playbook or monitoring signal | `doc/prod/**` | **Corpus** |
| Graph, reconciliation, index, roadmap or inventory change | corresponding `doc/_*/**` surface | **Corpus** |
| New feature folder or knowledge category | corresponding new `doc/**` surface | **Corpus** |
| Closeout/run ledger entry | `doc/_runs/**` | **Corpus** |

## 11.2 — Return structured deltas

Developer returns, without writing `doc/**`:

```yaml
spec_delta:
  implemented: <observable outcome>
  deviations: []
  verification: [{command: <exact command>, status: passed, evidence: <digest/ref>}]
  suggestions: []
corpus_delta:
  - target: <affected durable corpus surface>
    claim: <what changed or was confirmed>
    evidence: <code paths, diff/result digest, test evidence>
    confidence: confirmed | probable | suspected | unknown
```

Functional Analyst reconciles `spec_delta` first and returns exact changed
paths. `Corpus` then consumes `corpus_delta`, the reconciled spec result and
the implementation evidence. Either owner may surface a blocking question;
neither may delegate its decision back to Developer.

## 11.3 — Corpus-owned update candidates

When a proposal cannot yet be applied, **Corpus**, not Developer, records it in
`doc/_meta/update-candidates.md` using this shape:

```yaml
- id: <jira-or-topic>-<n>
  date: <YYYY-MM-DD>
  source: developer-handoff
  spec_ref: doc/spec/<version>/<jira>/
  target: <one of the routing-matrix targets>
  proposal: |
    <what to add/change, with code or corpus citations>
  evidence: |
    <files read, code snippets, commit shas, test outputs>
  rank_won: <1..8 per foundations/core-rules>   # only for reconciliation candidates
  confidence: <suspected | probable | confirmed | unknown>
  status: pending
```

Pending candidates do not satisfy closeout for a claim required by the current
change. The owner must either apply it, prove it is not affected, or block the
gate for operator arbitration.

## 11.4 — Controller auto-invokes `Corpus` for closeout

**Mandatory for every significant development closeout**, even when Developer
expects no durable knowledge change. Only Corpus can attest that the corpus is
already reconciled. No additional operator confirmation is needed — the spec
and implementation gates already happened upstream.

The Controller, never Developer, invokes the `Corpus` custom agent via the
available delegation surface with this prompt template:

```
Corpus — reconcile the developer closeout handoff from this run.

Source:        developer closeout handoff
Spec:          doc/spec/<version>/<jira>/
Run summary:   <one-line of what was implemented>

Evidence-backed corpus_delta:
  - <target + claim + evidence>

Goal:
  - Reconcile each affected claim within your ownership: indexes (doc/_indexes/),
    graph (doc/_graph/nodes.yaml + edges.yaml + evidence.yaml),
    reconciliation ledger (doc/_meta/reconciliation-ledger.yaml),
    prod knowledge (doc/prod/...), brick inventory
    (doc/_meta/brick-inventory.yaml), roadmap state
    (doc/_roadmap/ROADMAP_STATE.md + CORPUS_ROADMAP.yaml + NEXT_BEST_ACTIONS.md),
    new feature folders if the evidence requires one.
  - Create/update a pending candidate only for work that genuinely cannot be
    applied now; required current-change reconciliation blocks instead.
  - Do NOT run the full P1→P9 pipeline. This is a focused continuous-enrichment pass.
  - For any candidate that requires operator validation, conflicts with existing
    corpus state, or hits ambiguity → park it via governance/blocking-question-loop
    and return without applying that single candidate.
  - Append one row in doc/_runs/RUN_LEDGER.md for this consumption pass.

Return a compact summary:
  - applied:   <ids>
  - parked:    <ids + reason>
  - questions: <blocking-question ids or none>
  - ledger:    <run id appended>
```

## 11.5 — Response handling

| Outcome | Controller handling |
|---|---|
| All affected claims reconciled | Surface exact paths and validation evidence as `Applied by Corpus` |
| Some candidates parked | Surface the parked IDs + reason |
| `Corpus` parked one or more blocking questions | List the question IDs in the closeout. Tell the operator a decision is required |
| `agent` tool not attached / invocation failed | Keep `corpus_closed` blocked and state the unavailable owner explicitly; never downgrade to “not needed” |
| `Corpus` reports an error or partial run | Surface the error verbatim + the candidate IDs still `status: pending` |

There is no “no candidate, no Corpus” fast path for significant work.

## 11.6 — Multi-repo sibling sync (when `multi_repo.status == declared`)

If the change touched a contract listed in `adjacent_repos[i].contracts` or `consumed_by[i].contracts`, append a sibling sync recommendation per `sync_policy`:

- `manual` — list affected siblings; the operator runs sibling sessions.
- `agent-suggested` (default) — list siblings + suggested run prompt for each.
- `agent-driven` — open sibling sessions through the configured driver tool; if no driver tool is connected, downgrade to `agent-suggested` and say so.

Sibling sync is independent of 11.4 — `Corpus` consumes candidates for the *current* repo's corpus; sibling sync is for the *other* repos' corpora.

## Required output: closeout block

End Step 11 with this block in the operator-visible response:

```
## Corpus closeout

Spec:                   doc/spec/<version>/<jira>/
Corpus files read:      <list>
Implemented:            <one-line summary>
Verification run:       <what + outcome>

Functional Analyst reconciliation:
  - Spec paths changed:          <list>
  - Result:                      <complete | blocked>

Corpus delegation (auto-invoked):
  - Delta items received:       <ids/targets>
  - Applied by Corpus:          <ids/paths>
  - Parked by Corpus:           <ids + reason or none>
  - Blocking questions opened:  <ids or none>
  - RUN_LEDGER entry:           <run id or none>

Sibling sync (multi-repo): <recommendation or N/A>
Open questions remaining:  <list or none>
```

## Rules

- **No Developer writes under `doc/**`.** Functional Analyst owns spec
  reconciliation; Corpus owns durable application knowledge.
- **Controller MUST auto-invoke `Corpus` for significant closeout.** Developer
  only returns the structured delta; the operator does not have to run the
  handoff manually, and owner unavailability blocks the gate.
- **MUST NOT substitute a pending candidate for required current-change
  reconciliation.** Escalate instead.
- **Surface failure modes explicitly.** Silent skip is the worst outcome.
- **Corpus sets confidence/source metadata** from the supplied evidence; a
  Developer never upgrades a durable claim itself.
