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
corpus closeout, candidate freeze, an attested `ready` acceptance/evidence
manifest, release review and required checks all refer to current digests.
Case-level waivers are valid only when the completed campaign contains their
structured proofs and still derives `ready`; the shipped path has no global
acceptance bypass. Require a full `candidate_sha`, existing remote head,
approved base and operator authority for the provider side effect.

Run the complete `scripts/factory-pr.mjs` invocation from the protected draft
workflow first without `--execute`. The returned operation is named
`create-draft`; neither `plan` nor `create-draft` is a CLI subcommand. Re-run
the same validated arguments with `--execute --authorization-receipt
<external-file>` only after explicit authority. The operation is idempotent for
the same head/base and records the provider result without credentials.

## PR body

Generate it from durable artefacts: summary, spec/TIP, criterion coverage,
implementation and corpus delta, checks, exact SHA, environment, evidence
manifest/run link, replay command, failures/waivers, residual risks and human
checklist. Do not claim PASS for blocked/skipped/flaky work.

## Forbidden

No commit, push, force-push, approval, review dismissal, ready-for-review,
merge, deployment, branch-protection or secret change exists in this skill or
provider adapter. A provider response asking for one is a policy failure.
