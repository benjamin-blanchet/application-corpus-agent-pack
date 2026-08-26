---
type: agents-reference
status: active
confidence: confirmed
source: pack
last_validated: 2026-08-26
title: "Software factory — role and gate model"
description: "Repository-native control plane from an approved specification to a draft pull request with SHA-bound evidence."
---

# Software factory — role and gate model

The factory starts with a complete, approved specification and stops after a
draft pull request. It does not replace specification workshops, human
arbitration, approval, merge or deployment.

```text
approved spec → approved plan → bounded lots → independent review
→ verified integration → corpus closeout → frozen candidate
→ acceptance + evidence → release review → draft PR → human merge
```

## Authority split

| Role | Authority | Durable output |
|---|---|---|
| Factory Controller | scheduling and typed state transitions | event log + derived state |
| Functional Analyst | business specification, criteria and pre-candidate acceptance mapping | spec package + acceptance plan |
| Planner | decomposition and work-package contracts | plan V3 |
| Implementer | one reserved change outcome | structured lot result |
| Code Reviewer | independent verdict | structured review result |
| Corpus | reconcile durable application knowledge | closed corpus delta |
| Acceptance | execute cases on one candidate | results + evidence manifest |
| Delivery | create/update one draft PR | provider operation result |
| Operator | approvals, exceptions, refactor, final merge | gate/waiver decisions |

No role owns the full chain. The Controller owns coordination, not semantic
work. Workers cannot edit plan/events/state or perform repository delivery.
The capability contract under
`.github/templates/software-factory/roles/role-capabilities.yaml` is deny by
default. Shipped executors/providers validate it before their side effects and
require effective host-control receipts for dangerous capabilities. The YAML
does not sandbox arbitrary IDE tools: without host filesystem/credential/egress
isolation those actions are ineligible, and the independently recomputed Git
delta is post-action detection of source writes, not prevention.

The shipped V3 Controller therefore records Acceptance with only `read` and
`execute`. Its `capability_grants` field is reserved and must be empty:
operator approval, a GitHub Environment gate, a receipt string or a
`protected` label is not machine evidence of an isolated executor. Network,
secrets and data mutation stay blocked until an external executor and trust
verifier are integrated as one enforcement boundary.

Accordingly, the shipped `factory-acceptance.mjs` validates inputs but emits
`acceptance-execution-boundary-unavailable` before starting the candidate
lifecycle or an adapter, even when network policy is `deny_by_default`. Only a
machine-verified external process/filesystem/egress boundary can replace this
honest blocker.

## Truth and invalidation

`factory/events.v3.jsonl` is the canonical history. `factory/state.v3.json` is
a reproducible projection. Approvals and reviews are attestations over input
digests, not booleans. A changed input makes downstream gates stale
automatically; a Controller cannot restore them without the required typed
event and evidence.

## Adoption

1. Fill source, environment and CI contracts from repository evidence.
2. Copy the V3 spec template for one real, bounded change.
3. Run the controller and validators locally in dry-run.
4. Configure protected acceptance and the draft-PR identity separately.
5. Make the policy check required only after a real PR proves it runs.

The application-specific corpus owns how to build/start/reset the application,
which non-production datasets may be changed and which checks are mandatory.
The pack owns the contract shape and fail-closed rules.
