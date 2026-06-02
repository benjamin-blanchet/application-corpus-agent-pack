---
name: corpus-closeout-delegation
category: development
description: "At the **end of implementation and verification, before the PR is opened**, close the corpus loop. The developer applies the writes it owns, files structured update-candidates for everything else, then auto-invokes the `Corpus` agent in the same run to apply those candidates wit…"
---
# Corpus Closeout Delegation

## Purpose

At the **end of implementation and verification, before the PR is opened**, close the corpus loop. The developer applies the writes it owns, files structured update-candidates for everything else, then auto-invokes the `Corpus` agent in the same run to apply those candidates within `Corpus`'s ownership.

Corpus writes are **batched at closeout**, not dripped during implementation. The corpus is left consistent before the task ends.

## When to use

In **Step 10** of the developer lifecycle. Step 8 (implement) and Step 9 (verify) must be complete. Step 10 must complete before Step 11 (PR readiness).

## Critical timing rule

**During Step 8 (implementation), the developer MUST NOT:**

- Edit feature files (`BUSINESS_RULES.md`, `WORKFLOWS.md`, `OPERATIONS.md`, `AI_AGENT_GUIDE.md`).
- File update-candidates in `doc/_meta/update-candidates.md`.
- Invoke the `Corpus` agent.
- Edit any file in the `Hand off to Corpus` column of the routing matrix below.

**What the developer MAY do during Step 8:**

- Update the spec package's own `SPECIFICATION.md` (deviations) and `CHANGELOG.md` (one-line per material change). The spec package is the developer's working journal.
- Add a `SUGGESTIONS.md` entry for out-of-scope findings as they surface.

**All other corpus writes happen at Step 10.** This avoids leaving the corpus inconsistent mid-flight if the implementation changes course.

## 10.1 — Routing matrix

| Finding / artefact | Target | Who writes |
|---|---|---|
| Implementation notes, deviations, test results | `doc/spec/<version>/<jira>/SPECIFICATION.md` + `CHANGELOG.md` | **Developer (direct)** |
| Out-of-scope ideas surfaced during the change | `doc/spec/<version>/<jira>/SUGGESTIONS.md` | **Developer (direct)** |
| Behavior / business rule confirmed by the code change | `doc/project/features/<feature>/BUSINESS_RULES.md` | **Developer (direct)** — set `confidence: confirmed`, `source: code` |
| Workflow / state transition confirmed | `doc/project/features/<feature>/WORKFLOWS.md` | **Developer (direct)** |
| Operations / runtime behavior confirmed | `doc/project/features/<feature>/OPERATIONS.md` | **Developer (direct)** |
| `AI_AGENT_GUIDE.md` recipe found wrong / outdated during implementation | feature `AI_AGENT_GUIDE.md` | **Developer (direct)** — fix what you verified |
| New recurring bug observed in prod | `doc/prod/known-bugs/BUG-<id>-<slug>.md` | **Hand off to Corpus** |
| New structural risk discovered | `doc/prod/structural-risks/RISK-<id>-<slug>.md` | **Hand off to Corpus** |
| New playbook or monitoring signal | `doc/prod/root-cause-playbooks/` or `watchlist/` | **Hand off to Corpus** |
| Graph node / edge missing or wrong | `doc/_graph/nodes.yaml`, `edges.yaml`, `evidence.yaml` | **Hand off to Corpus** |
| Code ↔ corpus divergence (P9 reconciliation candidate) | `doc/_meta/reconciliation-ledger.yaml` | **Hand off to Corpus** |
| Index needs new entry | `doc/_indexes/*.md` | **Hand off to Corpus** |
| New feature folder / new prod knowledge category | new `doc/project/features/<slug>/` | **Hand off to Corpus** |
| Roadmap node touched / state should change | `doc/_roadmap/ROADMAP_STATE.md`, `CORPUS_ROADMAP.yaml`, `NEXT_BEST_ACTIONS.md` | **Hand off to Corpus** |
| Brick inventory entry needs status update | `doc/_meta/brick-inventory.yaml` | **Hand off to Corpus** |
| Run ledger entry for this consumption pass | `doc/_runs/RUN_LEDGER.md`, `doc/_runs/YYYY-MM-DD-<run-id>.md` | **Hand off to Corpus** |

## 10.2 — Direct corpus writes

Apply the developer-scope writes from the matrix:

- Update the spec package: `SPECIFICATION.md` (final notes + deviations), `TESTS.md` (results), `CHANGELOG.md` (one-line summary of the closeout), `SUGGESTIONS.md` (out-of-scope findings if any).
- Update the feature files whose claims the code change directly verified. Set frontmatter `confidence: confirmed`, `source: code` on the updated claims.

Do **not** touch any file marked "Hand off to Corpus" in the matrix.

## 10.3 — File structured update-candidates

For every "Hand off to Corpus" finding, append a YAML block to `doc/_meta/update-candidates.md`:

```yaml
- id: <jira-or-topic>-<n>
  date: <YYYY-MM-DD>
  source: developer
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

If `doc/_meta/update-candidates.md` doesn't exist, create it with a short preamble describing its purpose: a queue of structured proposals the developer files for the `Corpus` agent to consume.

## 10.4 — Auto-invoke `Corpus` to apply the candidates

**Mandatory whenever update-candidates were filed in this run.** No operator confirmation needed — the gates already happened upstream (Steps 5b and 7).

Invoke the `Corpus` custom agent via the `agent` tool with this prompt template:

```
Corpus — consume developer update-candidates from this run.

Source:        developer
Spec:          doc/spec/<version>/<jira>/
Run summary:   <one-line of what was implemented>

Candidates to consume (already in doc/_meta/update-candidates.md):
  - <id-1>
  - <id-2>
  - <id-3>

Goal:
  - Apply each candidate within your ownership: indexes (doc/_indexes/),
    graph (doc/_graph/nodes.yaml + edges.yaml + evidence.yaml),
    reconciliation ledger (doc/_meta/reconciliation-ledger.yaml),
    prod knowledge (doc/prod/...), brick inventory
    (doc/_meta/brick-inventory.yaml), roadmap state
    (doc/_roadmap/ROADMAP_STATE.md + CORPUS_ROADMAP.yaml + NEXT_BEST_ACTIONS.md),
    new feature folders if the proposal asks for one.
  - Mark each consumed candidate `status: consumed` (or `status: parked`
    with reason) in doc/_meta/update-candidates.md.
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

## 10.5 — Response handling

| Outcome | Developer action |
|---|---|
| All candidates applied | Surface the list in the closeout block as `Applied by Corpus` |
| Some candidates parked | Surface the parked IDs + reason |
| `Corpus` parked one or more blocking questions | List the question IDs in the closeout. Tell the operator a decision is required |
| `agent` tool not attached / invocation failed | Do **not** silently skip. State explicitly: "Auto-delegation skipped — `agent` tool not attached. Pending candidate IDs: \<list\>. Run `Corpus` manually to consume." |
| `Corpus` reports an error or partial run | Surface the error verbatim + the candidate IDs still `status: pending` |

If no candidates were filed in this run (everything was direct-edit only), skip 10.4 and state in the closeout: `Corpus delegation: not needed — no candidates`.

## 10.6 — Multi-repo sibling sync (when `multi_repo.status == declared`)

If the change touched a contract listed in `adjacent_repos[i].contracts` or `consumed_by[i].contracts`, append a sibling sync recommendation per `sync_policy`:

- `manual` — list affected siblings; the operator runs sibling sessions.
- `agent-suggested` (default) — list siblings + suggested run prompt for each.
- `agent-driven` — open sibling sessions through the configured driver tool; if no driver tool is connected, downgrade to `agent-suggested` and say so.

Sibling sync is independent of 10.4 — `Corpus` consumes candidates for the *current* repo's corpus; sibling sync is for the *other* repos' corpora.

## Required output: closeout block

End Step 10 with this block in the operator-visible response:

```
## Corpus closeout

Spec:                   doc/spec/<version>/<jira>/
Corpus files read:      <list>
Implemented:            <one-line summary>
Verification run:       <what + outcome>

Corpus updated directly (developer scope):
  - <feature file>: <one-line change>
  - <feature file>: <one-line change>

Corpus delegation (auto-invoked):
  - Candidates filed:           <ids>
  - Applied by Corpus:          <ids>
  - Parked by Corpus:           <ids + reason or none>
  - Blocking questions opened:  <ids or none>
  - RUN_LEDGER entry:           <run id or none>

Sibling sync (multi-repo): <recommendation or N/A>
Open questions remaining:  <list or none>
```

## Rules

- **No corpus writes during Step 8.** The implementation phase is code-only. The spec package's `SPECIFICATION.md` + `CHANGELOG.md` are the working journal — nothing else gets touched.
- **MUST auto-invoke `Corpus` when candidates were filed.** The operator does not have to run `Corpus` manually.
- **MUST NOT edit the `Hand off to Corpus` files directly.** Even if the change is trivial. Even if `Corpus` is unavailable. Use the candidate format and let the operator know.
- **Surface failure modes explicitly.** Silent skip is the worst outcome.
- **Set `confidence: confirmed`, `source: code` on direct feature-file updates.** The code change is rank-1 evidence.
