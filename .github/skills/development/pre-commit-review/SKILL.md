---
name: pre-commit-review
category: development
description: "Two independent review levels before corpus closeout: a lot review of each worker diff, and a consolidated review of the integrated result in a fresh context. The third level, release readiness, runs later."
---

# Independent Lot and Consolidated Review

## Purpose

Provide two independent review levels **before** corpus closeout, rather than
one late review just before repository operations.

1. **Lot review** — each delegated result, before it is integrated or consumed
   by a dependent lot.
2. **Consolidated review** — the integrated result, after deterministic
   verification passes.

`development/factory-release-readiness` is the third level. It runs after
corpus closeout and acceptance, so that late specification, corpus and
acceptance artefacts cannot escape review.

## Independence

**The implementing worker cannot review its own diff.** The consolidated
reviewer works in a fresh context and receives:

- the approved specification;
- the plan, machine plan and lot contracts;
- the exact diff and changed-path list;
- deterministic verification results;
- known escalations and their recorded resolution.

It does **not** receive the author's reasoning transcript. Evidence, contracts
and outcomes — not the story of how the author got there, which is precisely
what makes a second reader agree too easily.

The reviewer comes from a different model family than the author
(`development/model-routing`).

## Mechanical hygiene pre-scan

Before semantic review, scan the changed files deterministically for byte-level
corruption: a byte-order mark, mojibake from a lossy encoding round-trip, and
truncated or split tokens in changed documentation.

These are blocking, and they are worth a mechanical pass because a human
reviewer reads past them — the rendering usually looks fine.

Confirm a suspicious byte sequence is not deliberate documentation before
classifying it as corruption.

## Lot review

Check: observable objective and mapped criteria · allowed and forbidden paths
and exclusive ownership · inputs, outputs and invariants · diff budget and
scope · required tests and their results · logic, security, error paths and
regression risk · contradictions between implementation and specification or
plan.

Blocking findings return the work to the **same bounded lot**. A worker cannot
widen scope or quietly change a contract to make a finding go away; a material
plan change needs the applicable human re-approval.

## Consolidated review

After integration verification, an independent reviewer examines the complete
integrated changeset: every implementation and test change from every lot ·
configuration, data migrations, contracts and control-plane code · the
specification and plan artefacts as they stand · cross-lot interactions and
transverse regression zones · criterion → lot → verification traceability ·
artefact hygiene.

This happens **before** corpus closeout, and it does not claim to cover
acceptance evidence or corpus artefacts that do not exist yet. That is what the
third level is for.

## Retried lots

When a lot needed more than one attempt, the reviewer sees the attempt count.

A lot that passed on the third try is not a lot anyone can leave unattended,
and the figure that matters is **all attempts passing, not at least one**.
Retries are not independent either — a failed attempt contaminates the next
one's context — so a lot that keeps needing them is a lot whose contract is
incomplete, and the fix belongs in the plan rather than in another attempt.

## Findings

| Priority | Meaning | Blocking |
|---|---|---|
| P0 | corruption, logic or security failure, unsafe data behaviour | yes |
| P1 | specification or plan deviation, broken contract, uncovered regression | yes |
| P2 | advisory maintainability or clarity | no |
| P3 | out of scope | no — route to `SUGGESTIONS.md` |

For each finding: acknowledge it · fix P0/P1 inside an authorised bounded lot ·
rerun the applicable verification · re-review the changed scope independently ·
record a false-positive rationale or advisory disposition · stop for the
operator only when resolution needs a business decision, a material amendment,
new risk authorisation or a model replacement.

**No corpus closeout starts while a P0 or P1 finding remains.**

## Record

```markdown
## Lot review — <LOT-ID>

- Scope: <owned changed paths>
- Reviewer execution: <id>
- Model: planned=<profile>; requested=<identity>; used=<identity>
- Effort / context: <values>
- Verification: <commands or evidence>
- Findings: <ids and disposition, or none>
- Verdict: <accepted for integration | blocked>

## Consolidated review

- Scope: <complete integrated changeset>
- Reviewer execution: <id>
- Model: planned=<profile>; requested=<identity>; used=<identity>
- Integration verification: <evidence>
- Findings: <ids and disposition, or none>
- Verdict: <cleared for corpus closeout | blocked>
```

## Rules

- The implementing agent never self-reviews.
- Review exact diffs and contracts, never a worker's summary alone.
- P0 and P1 are blocking; P3 never widens the current change.
- Consolidated review authorises neither a pull request nor a merge.
- Once corpus and acceptance artefacts exist, always run
  `development/factory-release-readiness` against the frozen-SHA evidence.
