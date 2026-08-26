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
3. Ask the scheduler for ready lots. It checks approval basis, integrated and
   reviewed dependencies, attempt budgets, blockers and path claims.
4. Append `wave_reserved` with exact/prefix claims **before** spawning workers.
5. Issue one work package plus one capability contract per role.
6. Validate returned changed paths, outputs, verification and model provenance.
7. Obtain independent structured review, then integrate or return the same
   bounded lot for correction.
8. Release reservations only through an event. Never use clock expiry; recovery
   is an explicit operator decision.

Only the controller CLI appends events. Workers cannot edit plan, events or
state. The controller does not write specs, code, reviews, corpus or acceptance
results — it delegates those outcomes and validates their envelopes.

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
