---
name: model-routing
category: development
description: "Allocate models for one task from the runtime catalogue, with operator confirmation, light-worker eligibility rules, and a planned/requested/used audit trail. Never creates permanent model defaults."
---

# Model Routing

## Purpose

Allocate models for a single task without creating permanent defaults. The
runtime catalogue is authoritative for availability; the operator chooses the
mode and confirms the identities.

**No model name is a durable fact.** A model named in a repository file records
what was available once. Availability is a runtime property, and inferring it
from a document is how a task silently runs on something nobody chose.

## When

At preflight, and again after an approved plan when allocation affects the
lots.

## Protocol

1. Present the models the current runtime actually exposes. Do not infer
   availability from repository files, templates or a previous task.
2. Ask the operator for one execution mode:
   - `balanced` — fewest roles that still keep review independent;
   - `maximum_quality` — favour advanced reasoning and independent review;
   - `economical` — a light worker only for eligible bounded lots;
   - `manual` — the operator allocates each role, or declines delegation.
3. Present the role needs the mode produces:
   - `advanced` — specification interpretation, plan, integration,
     architecture, security, migration, consolidated review;
   - `light` — bounded implementation, only when eligible;
   - `reviewer` — independent lot or consolidated review.
4. Record the identities, requested effort and context tier in
   `factory-state.yaml`; append planned/requested/used to `JOURNAL.md` for
   every task, lot, review, acceptance execution, replacement and escalation.
5. If a requested identity is absent, **stop and ask for a replacement**. Never
   fall back silently.

## Reviewer independence

The reviewer must not come from the same model family as the author. Models
recognise their own output and prefer it, measurably — the effect is
mechanistic, not a matter of prompting. A same-family review is a second
opinion from the same opinion.

## Light-worker eligibility

A light worker is eligible only when **every** condition holds:

- the lot has one observable, bounded outcome;
- allowed paths and exclusive ownership are unambiguous;
- inputs, outputs, invariants, expected change and tests are explicit;
- no business, architecture, security, migration or open contract decision is
  required;
- risk is within the approved budget;
- maximum attempts are set and the orchestrator can review the diff.

Otherwise route to `advanced`, or split the lot until it qualifies. A model's
general capability does not override these rules — eligibility is a property of
the *task*, not of the model.

## Audit schema

```yaml
agent: "<role or worker id>"
execution_id: "<runtime execution id, or unknown>"
model:
  planned: "<role profile from the plan>"
  requested: "<operator-confirmed runtime identity, or null>"
  used: "<runtime-reported identity, or unknown>"
reasoning_effort: "<requested value, or unknown>"
context_tier: "<requested value, or unknown>"
```

`planned` is a role profile. `requested` and `used` are task-specific runtime
identities and belong in state and journal — never in a skill or template as a
default.

## Escalation and replacement

A worker stops when the code contradicts the plan, an out-of-scope path is
required, a contract is incomplete, tests contradict the requested behaviour,
risk rises, the diff budget is exceeded, or two attempts fail.

The escalation carries the blocked lot, evidence, impact and options. The
orchestrator records it and either resolves it inside the approved plan or asks
the operator. **No worker upgrades its own role, widens scope, or picks its
replacement.**

## Rules

- Routing is task state, not configuration.
- A missing, unavailable or substituted model is a traceability event, not a
  detail.
- Model output never replaces deterministic tests, independent review or human
  approval.
- Journals stay PII-minimised: a session or operator reference, never a full
  transcript or a personal address.
