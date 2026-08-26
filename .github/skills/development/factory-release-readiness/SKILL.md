---
name: factory-release-readiness
category: development
description: "The final evidence gate before draft-PR delivery. Binds plan, reviews, corpus, acceptance and artefacts to one immutable candidate, rejects stale bases, and authorises no merge or deployment."
---

# Release Readiness

## Purpose

The last gate between successfully attested acceptance and bounded
draft-pull-request delivery.

It verifies **provenance and completeness**. It does not authorise a commit, a
push, a deployment or a merge. Its machine phase is `release_ready`; the
following handoff verdict is `ready_for_draft_pr`. Neither means anyone may
approve, mark ready, merge or deploy.

## When

After all lots are integrated and deterministically verified · consolidated
review has no unresolved blocking finding · corpus closeout is complete ·
a `candidate_sha` was frozen after corpus closeout · acceptance completed
against that candidate · an evidence manifest was generated and verified.
Structured case/provenance waivers may contribute to a `ready` manifest, but
the shipped Release path has no waiver that skips the acceptance run itself.

This is the third review level, distinct from lot and consolidated review.

## Candidate and evidence protocol

`candidate_sha` is mandatory for every delivery, including documentation-only
or acceptance-waived work.

1. Freeze revision C only after code, tests, acceptance scripts, spec and corpus
   closeout are complete; record it as `candidate_sha`.
2. Resolve the deployed revision independently and record it as `tested_sha`;
   require `tested_sha == candidate_sha`.
3. Record acceptance environment identity, build or image identity where
   applicable, schema and dataset identity, test-script identity, the cases
   executed, the result, and every declared side effect.
4. Hash each evidence artefact and bind the manifest to C, the environment
   contract and run id. Large evidence stays in CI by default.
5. If evidence is committed after C, verify the evidence-only range changes no
   candidate source path. Record its commit separately; do not claim it was the
   revision under test.
6. Compare all current input digests with their review/gate bases. **A changed
   source, plan, script, corpus or evidence basis is not release-ready** — the
   reducer invalidates the affected gates and the applicable work repeats.
7. Never infer provenance from a branch name, timestamp or worker claim.

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
- [ ] Full `candidate_sha` present for every delivery.
- [ ] `tested_sha` equals `candidate_sha`.
- [ ] Acceptance evidence names the same candidate/tested SHA, environment, build, schema,
      dataset, scripts, cases, outcomes and side effects.
- [ ] Model audit records planned, requested and used for lots, reviews and
      acceptance; replacements and escalations carry reasons.
- [ ] Evidence manifest checksums resolve; no secret/avoidable PII finding and
      every required artefact is present.
- [ ] Cleanup complete; zero failed, blocked, skipped or flaky required case.
- [ ] The current event-derived state matches its projection and no approval,
      review, corpus or evidence basis is stale.
- [ ] No unresolved gate, escalation, security, migration or acceptance issue.

Verdict: <ready_for_draft_pr | blocked>
Blocking reasons: <none, or list>
Human action required: <authorise draft delivery, review/merge, or resolve blocker>
```

## Decision rules

- A missing candidate SHA always blocks. A missing, inconsistent or stale
  tested SHA always blocks.
- A case/provenance waiver is an explicit human decision with a scope and a
  rationale inside the attested acceptance result. **It does not bypass the
  campaign, rewrite failed evidence or remove history** — a waiver that edits
  history is not a waiver, it is a deletion.
- Never hide unavailable evidence. Mark it blocked and name the exact action
  needed to unblock it.

## Executable gate

The checklist is guidance, not an authority token. The shipped protected
`factory-release` workflow rebuilds the V3 state from the committed candidate
control artefacts, verifies the successful Acceptance workflow and exact
artifact attestation, requires a separately signed fresh-context review bound
to candidate/spec/plan/evidence/model provenance, then emits the canonical
`release_ready` envelope. Missing or stale attestations block; prose cannot
synthesize this state.

## Proportionality

Trivial and small changes use the same provenance rules and the same human
final gate, with concise evidence. Standard and large work additionally carries
the full lot, DAG, review and acceptance trace.
