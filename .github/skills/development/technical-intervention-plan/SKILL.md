---
name: technical-intervention-plan
category: development
description: "Turn an approved specification into a human TIP and deterministic V3 plan: observable lots, exact/prefix path claims, contracts, model profiles, evidence mappings, DAG and review budget. Only after human approval."
---

# Technical Intervention Plan

## Purpose

Turn an approved specification into an executable, reviewable contract without
replacing the human decision-maker. V3 separates approved input, canonical
events and derived state:

| File | Carries |
|---|---|
| `TECHNICAL_PLAN.md` | rationale, lots, decisions, DAG, review plan |
| `factory/plan.v3.json` | approved machine-readable criteria, lots, exact/prefix claims, capabilities and verification |
| `factory/events.v3.jsonl` | append-only typed execution history; created after plan approval |
| `factory/state.v3.json` | reproducible projection; never edited to advance a gate |

Legacy `technical-plan.yaml` and `factory-state.yaml` are migration inputs, not
parallel V3 truth. Start from `doc/spec/template/`.

## When

Only after explicit human approval of the complete specification, and before
requesting implementation go-ahead.

```text
spec approved -> plan + machine plan + state -> concise plan in chat -> go-ahead -> lots
```

## Construction

### 1. Look for a recipe before partitioning

Check `.github/profiles/*/*/recipes/` and `doc/project/code/recipes/` for a
recipe matching this change type — adding an endpoint, a scheduled job, an
entity and its migration, a screen.

**A recipe is a deterministic program: it runs once and finishes. A freehand
partition is an inference that resolves differently every time.** Where a
recipe exists, the lot decomposition is derived from it and reviewable against
it, rather than reinvented and defended from scratch.

Recipes are mined from what the repository actually did — which files moved
together per change type, and what reviewers corrected — so a recipe encodes
the team's real practice rather than someone's model of it.

No recipe: partition by hand, and **record the decomposition as a recipe
candidate**. The second change of this type should not pay the same cost.

### 2. Partition by observable outcome

Never by repository layer. A data / service / interface / test split is
legitimate only when the contracts between them are already stable and
ownership is unambiguous; otherwise it yields four lots that cannot be
verified apart, which is four lots that are really one.

### 3. Declare each lot

Id and observable objective · criteria covered · technical scopes · `exact` or
`prefix` write claims and forbidden paths · exclusive ownership · dependencies and expected
inputs/outputs/invariants · **verification** (below) · risk, complexity and
model profile · execution budget including maximum attempts.

### 4. Verification is named, not improvised

A lot's verification names how **this application** is actually built, started
and checked — recorded once, referenced by every plan — rather than a command
list invented per change.

Two reasons, and the second matters more. A plan that reinvents how to run the
application is wrong the day the application changes how it runs. And a lot
whose verification cannot be expressed at all is telling you the change is not
observable yet: that surfaces during planning, which is the cheapest moment to
find it, rather than during acceptance, which is the most expensive.

### 5. Bind criteria to what will prove them

Each acceptance criterion names the test case that will demonstrate it, or is
explicitly marked as not behaviour-observable with a reason.

A criterion bound to nothing is a criterion somebody will have to interpret
under time pressure, at the gate, alone.

### 6. DAG and waves

Express dependencies as a DAG. A lot is ready only when its dependencies were
integrated and independently reviewed, and its preconditions hold. Waves group
ready, dependency-independent and **path-disjoint** lots. V3 forbids arbitrary
globs: repo-relative POSIX `exact` and `prefix` claims make overlap decidable.

### 7. Record

Plan creation, model metadata and the go-ahead go in the journal.

## Invariants

- Every accepted criterion is covered by at least one lot; every lot has
  verification. An uncovered criterion is a planning defect, not a later
  surprise.
- **One path has one owner per wave.** Overlap is a collision even when the
  workers promise to coordinate — a promise is not a lock.
- A worker cannot touch an unowned or forbidden path.
- The plan is immutable to workers. Only the orchestrator proposes an
  amendment, and an amendment that changes scope, criteria, risk, paths,
  contracts or budget needs renewed human approval.
- The plan carries **role profiles, not model names**. Runtime identities live
  in state and journal.

## Review budget — and it gates

State what this change costs to review: expected diff size, expected reviewer
effort, and the reviewers **named by code ownership**, not by availability.

Then check it against what remains. A change whose review cost exceeds the
capacity left in the period waits, or is split, or the operator explicitly
accepts the queue. The budget is a gate, not a field somebody fills in.

Generating changes faster than they can be reviewed converts a delivery gain
into a queue, and the queue is invisible until it exists. It is the documented
failure mode of every spec-driven pipeline that has published numbers — one
measured trial produced 2,577 lines of specification and three and a half hours
of human review for 689 lines of code. Teams operating at scale ended up
rate-limiting generation on purpose.

## Go-ahead

```markdown
## Technical Intervention Plan

- Plan: `doc/spec/<version>/<ticket>/TECHNICAL_PLAN.md`
- Lots and waves: <ids grouped by wave>
- Critical contracts and risks: <list>
- Runtime model allocation: <roles and selected identities>
- Parallel work: <none, or the path-disjoint lots>
- Review topology: lot · consolidated · release readiness
- Review budget: <diff size, effort, named reviewers>

Approve the plan and the allocation. No code execution starts before this
go-ahead is explicit.
```

The operator may change the allocation or the plan. Update state and journal
rather than silently substituting a model or a scope.

## Derived phases

```text
draft -> spec_approved -> plan_approved -> executing -> integrated
-> consolidated_reviewed -> corpus_closed -> candidate_frozen
-> acceptance_complete -> evidence_recorded -> release_ready
```

These are reducer outputs, never `state_changed` events. Typed events carry
their input digests; if an input changes, the reducer returns to the latest
still-valid phase. An escalation moves the affected lot to `blocked` without
advancing the phase.
A failed review returns only the necessary work to a bounded lot; it never
erases journal history.

## Proportionality

Every package keeps the human TIP, plan and controller artefacts, so tooling
stays uniform. A trivial or
small change may use one sequential lot, one wave and a minimal contract. It
may **not** omit approval, ownership, verification, model traceability or the
final candidate/tested-SHA gate — those are what make the record worth having.
