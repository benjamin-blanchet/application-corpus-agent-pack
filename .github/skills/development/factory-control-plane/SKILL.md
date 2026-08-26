---
name: factory-control-plane
category: development
description: "Operate the deterministic V3 factory event log, reducer, scheduler, path reservations and gate invalidation. The controller coordinates typed artefacts and delegates every semantic task."
---

# Factory Control Plane

## Purpose

Turn an approved plan into mechanically valid work without asking an agent to
remember the workflow. `factory/events.v3.jsonl` is the canonical append-only
history; `factory/state.v3.json` is a derived cache and never an input humans
edit to move a gate.

## Controller loop

1. Validate plan and event chain; rebuild state and compare the committed view.
2. Observe contractual input digests. Append a typed change event when one
   differs; let the reducer invalidate every dependent attestation.
3. Once dependencies are integrated, delegate a read-only repository
   observation. The controller re-hashes its convention rules and committed
   example bytes in `lot_conventions_observed`; this must precede reservation.
4. Ask the scheduler for ready lots. It checks the current convention contract,
   approval basis, dependencies, attempt budgets, blockers and path claims.
5. Append `wave_reserved` with exact/prefix claims **before** spawning workers.
6. Issue one work package plus one capability contract per role.
7. Validate returned changed paths, outputs, verification and model provenance.
8. Obtain independent structured review, then integrate or return the same
   bounded lot for correction.
9. Release reservations only through an event. Never use clock expiry; recovery
   is an explicit operator decision.

Only the controller CLI appends events. Workers cannot edit plan, events or
state. The controller does not write specs, code, reviews, corpus or acceptance
results — it delegates those outcomes and validates their envelopes.

## Candidate control transition

The reviewed application snapshot precedes the controller's own final
`integration_verified`, `consolidated_reviewed` and `corpus_closed` appends.
Freezing a later commit is therefore valid only with a V2 candidate binding:
the committed candidate log must be a byte-for-byte extension of the reviewed
commit log by exactly those three events, and its committed state must be the
exact reducer projection at `corpus_closed`. The binding content-addresses both
logs, both states and the appended suffix. It permits no other excluded control
path and no non-corpus application change. Rewrite, reorder, extra event or
stale state fails closed.

## Result proof envelope

A `lot_result_reported` result is content-addressed, not a worker assertion. It
contains the full base revision, exact changed paths, one file observation per
path, every planned handoff output, verification evidence and an empty blocker
list. It binds the preimplementation convention-contract digest and reattests
the same rule IDs/rules with post-implementation byte examples. A present file
carries the SHA-256 of its current bytes; a deleted file
carries `status: deleted` and no digest. The result digest covers the complete
envelope except its own digest field.

`lot_conventions_observed` is a pre-execution handoff, not prose in the final
result. It binds the approved plan, exact Git source revision, sorted rules and
regular committed example files (`path`, byte SHA-256 and byte count). The
controller rejects examples outside the lot's read claims, modified examples,
an outdated source revision, reservation without this contract, or a
`lot_started` baseline different from the observation revision.

Handoff outputs may be files or directories. A file is hashed from its bytes;
a directory is hashed from a recursively sorted inventory of relative file
paths and byte digests. The CLI recomputes all file, deletion and output proofs
both before append and during package validation. Symlinks, repository escapes,
unsupported nodes, missing outputs and stale bytes fail closed.

An exhausted lot never gains attempts implicitly. `attempt_budget_extended`
records one additional operator-authorized attempt, only after the current
budget is consumed, with its reason, approver, approval time and exact
plan/diff basis. A second extension cannot be banked before using the first.

## Path claims

V3 uses repository-relative POSIX claims only:

- `exact`: one file;
- `prefix`: one directory and its descendants.

Absolute paths, `..`, repository root and arbitrary globs are invalid. Two
claims conflict when equal, when a prefix contains another prefix, or when an
exact file is inside a prefix.

## Fail closed

An unknown event, broken hash chain, stale approval basis, projection drift,
unreserved change, missing review or unresolved blocker stops scheduling. Do
not repair state by editing JSON; append a valid recovery/correction event or
ask the operator for the authority that is missing.
