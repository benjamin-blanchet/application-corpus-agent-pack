---
name: subagent-implementation-orchestration
category: development
description: "Execute an approved plan through bounded workers: dependency waves, exclusive path ownership, a complete worker contract, escalation triggers, integration and independent review. The orchestrator stays accountable."
---

# Bounded Implementation Orchestration

## Purpose

Execute an approved plan with bounded workers while the orchestrator remains
accountable for interpretation, scope, allocation, integration, verification
and the result. **Delegation does not transfer responsibility.**

## Why bounded

Compliance decays as output grows within a session — measurably, across models
and codebases. Long single-context implementation runs lose the plan, ignore
tasks and drift, usually around the point where context is compacted. Bounded
lots are not a stylistic preference; they are the only lever that has been
shown to work.

## Preconditions

Before any worker touches code, confirm: the specification has explicit human
approval · plan, machine plan and state exist · the operator approved the plan
and the allocation · the lot is ready in the DAG and owns its paths
exclusively for this wave · the role is permitted by `development/model-routing`
· no blocking escalation or review finding applies.

If one is missing, do not delegate.

## Waves

1. Validate the DAG has no cycle.
2. A lot is ready only when its dependencies completed and its outputs are
   available.
3. Group ready lots into a wave only when their owned path sets are disjoint.
4. Reserve the owned paths for the whole wave before launching anything.
5. Sequential by default. Parallelism is permitted, never assumed.
6. Complete the lot review before releasing dependent lots that consume the
   reviewed output.

Path collisions are resolved by the orchestrator — replanning, sequencing, or
an amendment — never by workers agreeing between themselves.

## Worker contract

Every worker receives a complete, bounded prompt:

```markdown
You own LOT <id> only.

Authoritative artefacts:
- Specification: <path>
- Plan: <path>
- Machine plan / state: <paths>

Objective: <observable outcome>
Allowed paths: <exclusive list>
Forbidden paths: <list>
Inputs / outputs / invariants: <contract>
Expected change and non-goals: <bounded statement>
Verification to run: <commands or evidence>
Budget: <attempt and diff limits>

Do not modify the specification, the plan, the state, the journal, or any
unowned path. Do not commit, push, widen scope, choose another model, or
resolve an ambiguity silently. Stop and escalate with evidence when a trigger
is met.

Return: changed paths, diff summary, verification results, unresolved issues,
and the runtime model metadata actually used.
```

## Escalation triggers

A worker stops immediately when: repository evidence contradicts the plan · an
unowned or forbidden path is required · an input, output, invariant or
criterion is incomplete · tests contradict the required behaviour · risk rises
or the diff budget is exceeded · two attempts fail · a business, architecture,
security or migration decision is needed.

The report carries the trigger, evidence, affected paths, attempt count,
blocked outcome and alternatives. **It never contains a silent scope change** —
an escalation that quietly widened the lot is the failure it was meant to
prevent.

## Integration record

After each lot and wave, record: wave and lot status, owner, changed paths,
contract outputs · planned/requested/used models · verification and independent
lot-review outcome · escalation, retry, replacement or amendment reasons · the
resulting integration revision.

Run transverse deterministic verification once all lots are integrated. Only a
verified integration enters consolidated review.

## Rules

- Lots are outcome-oriented, never a mechanical split by layer.
- One path, one owner, per wave.
- Workers cannot commit or push.
- The orchestrator keeps responsibility.
- Pull request and merge remain human actions, outside this workflow.
