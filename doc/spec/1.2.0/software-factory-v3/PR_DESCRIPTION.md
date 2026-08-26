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
protected credential; acceptance credentials are scoped to the campaign step.
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
- Control-plane regressions: 98/98 plus validator self-test 8/8.
- Delivery regressions: 54/54.
- Factory learning regressions: 12/12.
- Complete npm suite, Delivery/corpus validators and npm package dry-run passed
  on the recorded reviewed snapshot.
- The canonical two-commit replay is closed at `corpus_closed`; its protected
  suffix contains only integration verification, consolidated review and
  Corpus closeout.

<!-- factory-evidence -->

## Factory evidence — pending protected CI

Implementation and local factory control are closed at `corpus_closed`. No
`candidate_frozen` event, acceptance result, evidence manifest or release
verdict is claimed before protected CI processes the published commit. The
existing draft PR remains a collaboration surface, not yet a proven V3
Delivery.

After an authorized publisher commits and pushes the closed tree, protected CI
freezes that exact SHA and runs acceptance. `scripts/factory-pr.mjs` replaces
this pending block with the evidence manifest produced from those results once
the external Delivery authorization receipt is also available.
