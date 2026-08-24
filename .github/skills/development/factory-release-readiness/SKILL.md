---
name: factory-release-readiness
category: development
description: "The final evidence gate between completed acceptance and a human pull request or merge. Binds every artefact to one frozen tested SHA. Verifies provenance and completeness; authorises nothing."
---

# Release Readiness

## Purpose

The last gate between completed — or explicitly non-applicable — acceptance and
a human pull request or merge.

It verifies **provenance and completeness**. It does not authorise a commit, a
push, a deployment or a merge. `ready_for_human_pr_merge` means the evidence is
complete for one exact revision; it does not mean anyone may merge.

## When

After all lots are integrated and deterministically verified · consolidated
review has no unresolved blocking finding · corpus closeout is complete ·
acceptance completed against a frozen SHA, or was approved as `not_applicable`
with a written reason, an approver and a timestamp in `factory-state.yaml`.

This is the third review level, distinct from lot and consolidated review.

## Tested-SHA protocol

Mandatory whenever acceptance applies.

1. Freeze the exact revision submitted to acceptance as `tested_code_sha`.
2. Record it in `factory-state.yaml`, `JOURNAL.md` and the acceptance evidence.
3. Record acceptance environment identity, build or image identity where
   applicable, schema and dataset identity, test-script identity, the cases
   executed, the result, and every declared side effect.
4. Compare the release candidate revision with `tested_code_sha`. **A different
   SHA is not release-ready** — repeat the applicable verification, review and
   acceptance for the new revision.
5. Never infer provenance from a branch name, a timestamp or a worker's claim.

A proof is only a proof of the revision it was produced against. Everything
else in this gate follows from that.

## Checklist

```markdown
## Release readiness

- [ ] Specification and approved plan match the integrated result.
- [ ] Every acceptance criterion maps to a lot and a completed verification.
- [ ] All lot reviews recorded; no blocking finding remains.
- [ ] Consolidated review clean, or with documented accepted non-blocking
      outcomes.
- [ ] Deterministic integration verification recorded for this candidate.
- [ ] Corpus closeout complete; the declared delta is merged — every ADDED,
      MODIFIED and REMOVED entry landed, or is explicitly still open.
- [ ] Any claim whose witness changed is recorded; a REMOVED claim whose
      witness still passes means the removal is wrong.
- [ ] `tested_code_sha` present and equal to the candidate SHA — or the
      approved `not_applicable` rationale is recorded.
- [ ] Acceptance evidence names the same SHA, environment, build, schema,
      dataset, scripts, cases, outcomes and side effects.
- [ ] Model audit records planned, requested and used for lots, reviews and
      acceptance; replacements and escalations carry reasons.
- [ ] No unresolved gate, escalation, security, migration or acceptance issue.

Verdict: <ready_for_human_pr_merge | blocked>
Blocking reasons: <none, or list>
Human action required: <review, merge, or resolve the listed blocker>
```

## Decision rules

- A missing, inconsistent or stale tested SHA blocks the verdict whenever
  acceptance applies.
- A waiver is an explicit human decision with a scope and a rationale. **It
  does not rewrite failed evidence or remove a journal entry** — a waiver that
  edits history is not a waiver, it is a deletion.
- Never hide unavailable evidence. Mark it blocked and name the exact action
  needed to unblock it.

## Proportionality

Trivial and small changes use the same provenance rules and the same human
final gate, with concise evidence. Standard and large work additionally carries
the full lot, DAG, review and acceptance trace.
