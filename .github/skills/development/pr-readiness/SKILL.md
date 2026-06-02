---
name: pr-readiness
category: development
description: "Produce a PR-ready artefact at the end of the developer lifecycle: a structured PR description that references the spec, the corpus updates, the verification outcome and the `Corpus` delegation result. The agent **produces** the description and the readiness checklist; the **ope…"
---
# PR Readiness

## Purpose

Produce a PR-ready artefact at the end of the developer lifecycle: a structured PR description that references the spec, the corpus updates, the verification outcome and the `Corpus` delegation result. The agent **produces** the description and the readiness checklist; the **operator opens** the PR via their platform (GitHub, GitLab, Bitbucket, Azure DevOps, etc.).

## When to use

In **Step 11** of the developer lifecycle, after Step 10 (corpus closeout). All corpus writes (developer-owned and `Corpus`-delegated) must be done before this step.

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

If any item is unchecked, **do not produce the PR description**. Loop back to Step 10 (or earlier) to address it, then re-enter Step 11.

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

## Branch and commit guidance

The agent produces guidance but does not push or merge:

- **Branch name**: use the repo's existing convention if detectable from `doc/project/cicd/` or `doc/_meta/repository-map.yaml`. Otherwise propose `<type>/<ticket-or-topic>` (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`).
- **Commit messages**: follow the repo's convention if detectable (Conventional Commits, Gitmoji, plain). The agent never amends or force-pushes published commits.

## Required output

The skill emits:

1. A **PR readiness verdict**: `ready` or `blocked — <reasons>`.
2. If `ready`: the **PR description** above, pre-filled.
3. A **next-step prompt** for the operator: "Open the PR with the description above on <suggested branch>."

## Rules

- **The agent does not open the PR by default.** Opening a PR is an external side-effect action subject to `governance/safe-operation-guardrails`. The operator opens it unless they have explicitly authorized the agent to push and create PRs.
- **No PR without corpus closeout.** Step 10 must be complete (developer writes + `Corpus` delegation finished or explicitly fallback-stated) before this step.
- **No PR while blocking questions block the change.** If `Corpus` parked a blocking question that prevents the change from being safe, the verdict is `blocked` and the description is not produced.
- **The PR description references the spec, not the ticket alone.** The spec is the durable artefact; the ticket is the trigger.
- **Surface the `Corpus` delegation outcome.** Reviewers need to see what the corpus now says vs. what it said before.
