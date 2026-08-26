---
name: draft-pr-delivery
category: development
description: "Plan and, when explicitly authorised, create or update one draft pull request after every factory gate is current. Delivery never pushes, approves, marks ready, merges or deploys."
---

# Draft Pull-Request Delivery

## Boundary

The factory may create or update a **draft** pull request; an operator still
reviews, marks ready and merges. Delivery does not create the remote branch and
does not own commits or push.

## Preconditions

Validate the current event-derived state: approvals, lots/reviews, integration,
corpus closeout, candidate freeze, acceptance/evidence (or explicit waiver),
release review and required checks all refer to current digests. Require a
full `candidate_sha`, existing remote head, approved base and operator authority
for the provider side effect.

Run `scripts/factory-pr.mjs plan` first. `create-draft` remains dry-run unless
explicitly enabled, is idempotent for the same head/base and records the
provider operation without credentials.

## PR body

Generate it from durable artefacts: summary, spec/TIP, criterion coverage,
implementation and corpus delta, checks, exact SHA, environment, evidence
manifest/run link, replay command, failures/waivers, residual risks and human
checklist. Do not claim PASS for blocked/skipped/flaky work.

## Forbidden

No commit, push, force-push, approval, review dismissal, ready-for-review,
merge, deployment, branch-protection or secret change exists in this skill or
provider adapter. A provider response asking for one is a policy failure.
