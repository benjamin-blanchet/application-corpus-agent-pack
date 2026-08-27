---
type: spec
status: draft
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Draft PR Description — Software Factory V3"
description: "Draft pull-request body scaffold enriched by factory evidence at delivery time."
---

# Software Factory V3

This draft PR turns the pack's documented development lifecycle into an
executable, event-derived software-factory workflow.

## Scope

- add the V3 event log, reducer, scheduler, invalidation and bounded work
  packages;
- route implementation, independent review, corpus closeout, acceptance and
  Delivery through distinct roles and model profiles;
- replace persistent MCP readiness with durable source contracts plus
  run-local adapter probes;
- ship environment, CI, command and conditional Playwright acceptance
  contracts, evidence generation and draft-only Delivery;
- package the reusable agents, skills, schemas, workflows and templates as
  version 1.2.0.

## Security and delivery boundary

Protected acceptance and Delivery use a controller checkout and trust root
separate from candidate code. Candidate dependency installation receives no
protected credential. Per-campaign scoped acceptance credentials are declared
by the environment contract but **are not implemented**: the pack ships no
isolated executor, so `factory-acceptance.mjs` raises its execution-boundary
finding unconditionally and every campaign exits blocked. The acceptance,
release and draft-PR chain has therefore never completed end to end, by design
rather than by omission — see "What these proofs do not establish" in
`docs/software-factory.md`.
Privileged Acceptance, Release and draft Delivery definitions are loaded from
the protected default branch through exact `repository_dispatch` event types;
their jobs fail closed unless that workflow SHA is the pinned controller SHA.
Acceptance attestation V2 binds that workflow SHA separately from the tested
candidate SHA and is a Delivery gate rather than a candidate branch check.
Declared branch checks run only after the draft exists and protect its later
review/merge lifecycle; Delivery never treats a spoofable check display name
as provenance and does not wait for `pull_request_target` before creating the
draft that triggers it.
Supported roles cannot widen their declared factory operation, while effective
isolation also relies on workflow permissions, tools and credentials. Delivery
can create or update draft PR metadata only: it cannot push, approve, mark
ready, merge or deploy.

## Candidate-preparation verification

- Runtime source regressions: 24/24.
- Control-plane regressions: 102/102 plus validator self-test 8/8.
- Delivery regressions: 54/54.
- Factory learning regressions: 12/12.
- Complete npm suite and the corpus and Delivery validators pass on the
  current tree.

These counts say the suite is green. They do not say the delivery chain works:
it is blocked at the execution boundary described above, and `factory-policy`
has not run on this branch either, because `pull_request_target` loads its
definition from the base branch and the workflow does not exist on `main` yet.
Its first real execution will be on the next pull request after this one
merges. Treat it as a gate only once it has been seen to run.

<!-- factory-evidence -->

## Factory evidence — none claimed

This pull request carries no factory evidence, and claims none. The V3 run that
produced the engine was removed from the tree during review: a package under
`doc/spec` is walked by `validate-factory` on every run and asserts its lot
digests against the working tree, so the pack was governing its own source with
the control plane it was building, and the file judging a change was the file
being changed. The authored specification documents stay; the event log, derived
state, evidence manifest and verification receipts do not.

No `candidate_frozen` event, acceptance result, evidence manifest or release
verdict is claimed. Dogfooding moves to an example application in CI, which is
not part of this pull request.

## Review outcome

A full security and engineering review was run against this branch. Five
findings are fixed with regression tests verified in both directions:

- **SEC-1 (critical)** — `factory-policy` runs on `pull_request_target` and
  checked out the fork head, and corpus closeout validation spawned the
  *candidate's* `validate-corpus.mjs`. Verify-after-execute, both sides of the
  comparison candidate-supplied, and the child inheriting `GITHUB_PATH`. Closeout
  is now verified by digest; execution survives only in the local controller.
- **ENG-2** — the scheduler blocked on any blocker not `resolved` while the
  reducer produced `superseded` with no path back, so a review that failed then
  passed froze scheduling permanently.
- **ENG-3** — a worker dying on its last attempt made the attempt budget
  unextendable, because the escape required a diff digest the lot could not have.
- **ENG-7** — an unrecognised artifact class invalidated more gates but no lots,
  so a typo produced a state greener than the one requested.
- **SEC-3** — a run whose jobs were all skipped is reported `conclusion: success`;
  the three verifiers tested only that conclusion. They now require at least one
  job to have actually executed.

Four further findings were answered by correcting what the documentation
promises rather than by adding machinery: the event chain is tamper-evident and
not authenticated, workspace observation is bounded to a lot, gate invalidation
is declarative, and the acceptance chain is deliberately blocked. Those limits
are now stated in `docs/software-factory.md`.

Known and open: ENG-6 (the reducer reads a policy YAML at import, outside any
digest, so replay is not reproducible), ENG-9 (`lot_blocked` has no role check),
ENG-4/5/10 (the journal-and-state transaction is not atomic and a truncated line
has no repair path), and the low-severity hygiene list.
