---
name: pr-readiness
category: development
description: "Assemble the release package and draft-PR operation after every factory gate is current. A separate Delivery role may create/update the draft with explicit authority; only a human can mark ready, approve or merge."
---
# PR Readiness

## Purpose

Produce a release package at the end of the factory lifecycle: structured PR
description, exact candidate/evidence provenance, replay command, current gate
verdict and a validated draft-PR operation. A separate, capability-limited
Delivery role may create or update the draft after explicit authority. The
operator alone marks ready, approves and merges.

## When to use

In **Step 15**, after corpus closeout, candidate freeze, acceptance/evidence
and release review. All inputs must still match the digests reviewed by their
gates.

## Why this step exists

Without it, the PR loses the trail:

- Reviewers see code only — not the spec, not the regression reasoning, not the corpus updates.
- The corpus closeout becomes invisible to the team — they may approve the PR without realizing feature files / prod knowledge / graph were updated.
- The link between business rationale (spec) and shipped code is broken at the moment of review.

PR readiness reconnects all the artefacts into one operator-and-team-visible payload.

## Pre-PR checklist

Before producing the PR description, verify:

- [ ] All in-scope tests pass (unit + regression + any other required by `verify-by-change-type`).
- [ ] Static analysis / linter clean on touched files (or gap recorded in the spec).
- [ ] Schema change includes a rollback script (if applicable).
- [ ] Spec package up to date: `SPECIFICATION.md` reflects final state, `CHANGELOG.md` has the closing entry, `SUGGESTIONS.md` captures out-of-scope items.
- [ ] Feature files updated where behavior, workflow, rules or operations changed.
- [ ] `AI_AGENT_GUIDE.md` still accurate (or an update-candidate filed if it isn't).
- [ ] `doc/_meta/update-candidates.md` entries consumed by `Corpus` (status `consumed` or `parked` with reason).
- [ ] Multi-repo sibling sync recommendation produced (when `multi_repo.status == declared`).
- [ ] Full `candidate_sha` recorded; `tested_sha == candidate_sha` and the
      attested evidence manifest agrees.
- [ ] Every required case is passed or explicitly waived; no required failed,
      blocked, skipped or flaky case is hidden by aggregation.
- [ ] Lot, consolidated and release reviews cover the complete current
      changeset; no blocking finding remains.
- [ ] Event-derived state has no stale gate and matches its committed projection.
- [ ] Remote head branch already exists; Delivery does not create or push it.

If any item is unchecked, **do not hand off to Delivery**. Return to the
invalidated bounded phase, then re-enter this step.

## PR description template

```markdown
## Summary

<2–3 sentences: what changed, why, who asked>

## Spec

Validated spec: `doc/spec/<version>/<jira>/SPECIFICATION.md`
Acceptance criteria: `doc/spec/<version>/<jira>/SUMMARY.md`

## Scope (from triage)

- Class: <trivial | small | standard | large>
- Files touched: <count>
- Schema change: <yes/no — script ref if yes>
- Public API change: <yes/no — versioning note if yes>

## Regression coverage

For each regression zone (Step 4.1):
- <zone>: <test or rationale>

## Verification (Step 9)

- Tests run: <unit / regression / integration / contract / e2e / manual> — <pass | fail | partial>
- Performance: <budget vs. measured, or "no measurable impact expected — <evidence>">
- Verifications skipped: <list with reason, or "none">
- Candidate SHA: <full SHA>
- Tested SHA: <full SHA, equal to candidate SHA>
- Environment/build/schema/dataset: <identities>
- Evidence manifest: <run/ref + digest>
- Replay: `<one command>`

## Corpus updates

Direct writes (in this PR):
- `doc/spec/<version>/<jira>/`: spec package finalized
- `doc/project/features/<feature>/...`: <one-line per file touched>

Applied by `Corpus` (delegation outcome):
- <target>: <one-line per consumed candidate>
- Parked: <ids + reason, or "none">
- Blocking questions opened: <ids, or "none">

## Multi-repo sibling sync (when applicable)

<sibling repo>: <recommendation per sync_policy>

## Risks and follow-ups

- <residual risk>: <mitigation or owner>
- Out-of-scope (`SUGGESTIONS.md`): <one-liner — link to file>
- Blocking questions awaiting decision: <list, or "none">

## How to review

Suggested order:
1. `doc/spec/<version>/<jira>/SPECIFICATION.md` — what we agreed to build
2. Code changes — does the implementation match?
3. Feature file diff — does the corpus reflect the new behavior?
4. Tests — is regression coverage real?
```

Adapt sections to the triage class: a `trivial` PR may omit "Regression coverage" and "Multi-repo sibling sync" if not applicable.

## Branch and commit boundary

Implementation roles produce guidance but do not commit, push or deliver:

- **Branch name**: use the repo's existing convention if detectable from `doc/project/cicd/` or `doc/_meta/repository-map.yaml`. Otherwise propose `<type>/<ticket-or-topic>` (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`).
- **Commit messages**: follow the repo's convention if detectable (Conventional Commits, Gitmoji, plain). The agent never amends or force-pushes published commits.

## Required output and Delivery handoff

The skill emits:

1. A **delivery readiness verdict**: `ready_for_draft_pr` or
   `blocked — <reasons>`.
2. If ready: the PR description above, pre-filled from durable artefacts.
3. A validated operation contract: provider, `draft: true`, approved base,
   existing remote head, body path, required checks, `contents: read`,
   `pull_requests: write`, and forbidden actions.
4. An explicit handoff to `delivery`. It runs the full `factory-pr.mjs`
   invocation without `--execute`, then repeats those exact arguments with
   `--execute --authorization-receipt <external-file>` only with recorded
   external-action authority. `create-draft` is the returned operation name,
   not a subcommand.

## Rules

- **Implementation agents do not open the PR.** Draft creation is an external
  side effect owned only by `delivery`, subject to
  `governance/safe-operation-guardrails`, a valid capability contract and
  explicit operator authority. Delivery never pushes.
- **No draft PR without current closeout, acceptance/evidence and release
  review.** A stale basis blocks instead of producing a hopeful description.
- **No PR while blocking questions block the change.** If `Corpus` parked a blocking question that prevents the change from being safe, the verdict is `blocked` and the description is not produced.
- **The PR description references the spec, not the ticket alone.** The spec is the durable artefact; the ticket is the trigger.
- **Surface the `Corpus` delegation outcome.** Reviewers need to see what the corpus now says vs. what it said before.
- Draft creation never authorises approval, ready-for-review, merge or deploy.
