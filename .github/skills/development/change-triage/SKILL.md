---
name: change-triage
category: development
description: "Classify a development task into a **size class** that determines how heavy the corpus-first lifecycle should be. Without triage, every change pays the same workflow cost — and small changes get bypassed."
---
# Change Triage

## Purpose

Classify a development task into a **size class** that determines how heavy the corpus-first lifecycle should be. Without triage, every change pays the same workflow cost — and small changes get bypassed.

## When to use

At the start of every developer task, after Step 0 (pre-flight) and before Step 1 (corpus read). The class chosen here drives the rest of the workflow.

## Triage criteria

Score the change against these criteria (use the highest class that matches any row):

| Class | Criteria — match any |
|---|---|
| **Trivial** | Rename, typo, dead-code removal, comment, log message, lint fix. No behavior change. 0 schema change. 0 public contract touch. ≤ 1 file. < ~20 LOC. 0 regression zone with >1 call site. |
| **Small** | Single feature behavior tweak, internal helper added/changed. No schema change with data backfill. No public API change. ≤ 5 files. < ~150 LOC. Regression zones limited to direct callers. |
| **Standard** | New feature or non-trivial change inside one feature folder. Up to 1 schema change without data backfill. No public API breaking change. Multiple regression zones manageable. |
| **Large** | > 5 files OR data backfill OR schema with downtime risk OR public API change OR cross-feature impact OR cross-repo contract change (multi-repo declared). |

When in doubt, **classify up** (trivial → small, small → standard). It is safer to over-spec a small change than to under-spec a real one.

## Lifecycle weights by class

| Step | Trivial | Small | Standard | Large |
|---|---|---|---|---|
| Step 0 pre-flight | Quick (pipeline-state + blocking-questions only) | Quick | Full | Full + multi-repo block |
| Step 1 corpus read | `app-profile` + the impacted feature folder only | + P5 catalogs if crossed | Full | Full |
| Step 3 graph use | Optional | Direct callers only | Full graph fan-out | Full + transitive |
| Step 4 risk analysis | Mental check only — no table | 4.1 regression only | 4.1 + 4.2 + 4.3 | All four (4.1–4.4) |
| Step 5 spec package | `SPECIFICATION.md` only (≤ 10 lines) + `CHANGELOG.md` | `SPECIFICATION` + minimal `IMPACTS` + minimal `TESTS` + `CHANGELOG` | Full 7 files | Full 7 files + extra rigor (perf budget, sibling sync) |
| Step 5b active validation | Gate only (no self-audit, no question loop) | Self-audit, ≤ 2 questions | Full (self-audit + ≤ 5 questions + gate) | Full + escalate ambiguity to `functional-analyst` if needed |
| Step 6 implementation plan | Single-line plan | Table with ≤ 3 rows | Full table | Full + explicit rollout plan |
| Step 8 implementation | Same caution rules apply | Same | Same | Same |
| Step 9 verification | Unit tests + lint | Unit + regression for direct callers + lint | Full matrix per change type | Full matrix + perf measurement |
| Step 10 consolidated review | Focused fresh review | Focused fresh review | Full fresh review | Full fresh review + ownership/security emphasis |
| Step 11 owner closeout | Developer returns minimal `spec_delta`/`corpus_delta`; Functional Analyst and Corpus reconcile | Same, proportional to affected claims | Full owner reconciliation + mandatory Corpus invocation by Controller | Full owner reconciliation + Corpus + sibling sync |
| Step 12 candidate freeze | Exact SHA + minimal bundle | Exact SHA + declared bundle | Full immutable bundle | Full immutable bundle + sibling contract identities |
| Steps 13–15 acceptance/release/draft PR | Proportional cases; no gate skipped | Proportional cases | Full campaign and evidence | Full campaign + rollout/rollback + sibling-repo links |

## Required output

After triage, emit a single line to the operator:

```
Change triage: <trivial | small | standard | large>
Reason: <one short justification citing the criteria that matched>
Lifecycle weight: <list of steps that are abbreviated or full per the table>
```

## Rules

- **Triage is mandatory** — every task is classified, even trivial ones.
- **Classify up when in doubt.** Better to over-spec a small change than under-spec a real one.
- **Triage is not a gate.** The operator does not need to validate the class — but they can override ("treat this as standard").
- **The class can be revised in-flight.** If during Step 1–3 the change turns out larger than expected, re-triage and announce the new class before continuing.
- **Trivial does not skip Step 11.** The corpus loop still closes — just
  lighter. Developer returns evidence-backed deltas; Functional Analyst and
  Corpus decide and apply any spec, feature, graph or candidate update within
  their own write boundaries.
- **Large always involves the operator more.** No autonomous large change — always confirm scope after triage.
