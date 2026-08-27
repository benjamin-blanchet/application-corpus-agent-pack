---
name: agent-handoff
category: development
description: "Artefact-driven gates from analyst and planner through bounded implementation, owner closeout, acceptance, release and the final human action. Each transition is independently checkable."
---

# Agent Handoff

## Purpose

Make transitions between roles explicit, artefact-driven and checkable, so no
work is lost between agents and each one starts from a validated state.

A handoff is not a message. It is a state the downstream role can verify
without asking the upstream role what they meant.

## The chain

```text
need
  -> clarify                          bounded interrogation, ≤5 questions
  -> complete specification
  -> briefing in chat
  -> ⛔ specification approval          human
  -> plan + machine plan
  -> ⛔ plan and allocation go-ahead    human
  -> controller event log + derived state
  -> reserved bounded lots + lot reviews
  -> integration + deterministic verification
  -> consolidated review in fresh context
  -> corpus closeout (delta merged)
  -> freeze candidate SHA
  -> acceptance + evidence on that candidate
  -> ⛔ release readiness
  -> authorised draft PR               delivery
  -> ⛔ review and merge                 human
```

Each arrow is a gate: the upstream role produces an artefact, the downstream
role validates it before starting.

## Gate 1 — analyst → developer

Upstream delivers: a complete, self-audited `SPECIFICATION.md` · `SUMMARY.md`
with the criteria listed · `TESTS.md` with cases enumerated · `IMPACTS.md` with
regression zones · `JOURNAL.md` started · the ticket or topic confirmed · **no
unresolved blocking question** · and no plan, no lots, no allocation.

The last one matters: producing a plan before the specification is approved
converts the approval into a formality, because the work already exists.

Downstream checks: the package is complete and briefing-ready · `TESTS.md` has
at least one case · `IMPACTS.md` lists regression zones · no blocking question
remains · the routing preflight is recorded.

## Gate 2 — implementation authorisation

Before any worker touches code: specification approval is recorded · plan,
machine plan exists · every criterion maps to a bounded lot **and** to
what will prove it · the DAG, exclusive paths, contracts, budgets and
escalation triggers validate · the allocation is operator-confirmed and
journaled · the capability contract is deny-by-default · the Controller
initialized the event log and derived state · the review budget fits the
remaining capacity, or the operator
accepted the queue explicitly.

## Gate 3 — verified integration + owner closeout → acceptance

Controller assembles: Developer's bounded results integrated and
deterministically verified · all lot reviews and the consolidated review clean
· Functional Analyst's spec reconciliation complete · Corpus closeout complete
with the durable delta reconciled · the exact full `candidate_sha` frozen and
recorded · `SPECIFICATION.md` reflecting the integrated behaviour · `TESTS.md`
enumerating the acceptance cases · a target non-production environment,
explicitly named · environment, build, schema, dataset and script
identities · declared expected mutations and side effects · current environment
and CI contracts · capability-limited acceptance work package.

Downstream checks: the full candidate SHA exists and matches what is deployed · the
application is reachable on the target · the case list is loaded.

**A missing, abbreviated or mismatched SHA blocks the handoff.** Never infer it
from a branch, a date or a pull request.

## Gate 4 — release readiness → Delivery → human

Evidence complete for one exact revision. Delivery may create/update only the
declared draft PR after explicit authority; a person still reviews, marks ready
and merges. Neither verdict nor draft creation authorises merge/deploy.

## Rules

- A gate is passed by an artefact, never by an assertion that the work is done.
- A downstream role that has to ask what an upstream artefact meant has found a
  gate defect, not a communication problem. Record it.
- Silence is not approval at any gate.
- No role skips a gate because the change is small. Proportionality shortens
  what each artefact contains; it never removes the transition.
