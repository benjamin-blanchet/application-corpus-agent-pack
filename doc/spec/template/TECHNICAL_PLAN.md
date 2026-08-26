---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Technical Intervention Plan — `<ticket-or-topic>`

<!--
Created only AFTER explicit human approval of the complete specification, and
before any implementation change. Four coherent artifacts in this package:

  TECHNICAL_PLAN.md          this file — rationale, lots, decisions, DAG, review plan
  factory/plan.v3.json       approved machine plan and bounded work packages
  factory/events.v3.jsonl    canonical append-only event history
  factory/state.v3.json      deterministic projection rebuilt by the controller

Partition by observable technical outcome, not by repository layer. A lot that
cannot be verified on its own is not a lot.
-->

## Approved acceptance criteria

<!-- Copy the IDs from the approved SPECIFICATION.md. Every one must be covered
     by at least one lot, and the coverage is checked, not asserted. -->

| ID | Criterion | Covered by |
|---|---|---|
| `AC-001` | `<...>` | `LOT-n` |

## Lots

### `LOT-n` — `<observable objective>`

| Field | Value |
|---|---|
| Covers | `AC-001, AC-003` |
| Read paths | `<minimum repository/corpus paths needed>` |
| Owned paths | `<paths this lot may write, exclusively, for its wave>` |
| Forbidden paths | `<paths it must not touch>` |
| Depends on | `<lot ids, or —>` |
| Risk | `low | medium | high` |
| Complexity | `bounded | reasoning` |
| Agent role | `implementer | migration` |
| Model role | `economy | standard | expert` |
| Capabilities | `read, write, execute` plus the minimum explicitly justified additions |
| Verification | `<what proves this lot done>` |
| Max attempts | `2` |
| Stop rules | `<contradiction, out-of-claim path, missing input, rising risk, failed attempt>` |

**Contract.** Inputs `<...>` · Outputs `<...>` · Invariants `<...>` · Non-goals `<...>`

**Digest-bound handoff.** Name every input artefact with its path and current
SHA-256, and every expected output with its owned path. Never include private
reasoning or a conversation transcript.

If the observed implementation conventions make the outcome unsafe or
impossible, stop the lot and request the smallest evidenced refactor from the
operator. Do not broaden the claim or redesign the repository silently.

## Execution DAG

<!-- Lots group into a wave only when they are dependency-ready AND their owned
     path sets are disjoint. One file has one owner per wave. Sequential by
     default; parallelism is an option, never an assumption. -->

```mermaid
graph LR
  LOT-1 --> LOT-2
```

| Wave | Lots | Rationale |
|---|---|---|
| 1 | `LOT-1` | `<...>` |

## Decisions and rejected alternatives

<!-- What was considered and deliberately not done. A legacy codebase accrues
     legitimate exceptions; recording why one was taken is what stops the next
     pass from "fixing" it. -->

| Decision | Why | Simpler alternative rejected because |
|---|---|---|
| `<...>` | `<...>` | `<...>` |

## Review plan

| Level | When | Reviewer |
|---|---|---|
| Lot review | after each lot verifies, before its result is integrated or consumed | not the implementing worker |
| Consolidated review | after integration verification, before corpus closeout | fresh context; receives spec, TIP, contracts, diff and test results — not the author's reasoning |
| Release readiness | after corpus closeout and acceptance | binds every artifact to the frozen tested SHA |

Review and acceptance are typed events owned by fresh-context roles. They are
not implementation lots and never receive write claims.

## Verification budget

<!-- Reviewer throughput is a real constraint and the usual cause of failure:
     generating changes faster than anyone can review them converts a delivery
     gain into a queue. State what this change costs to review. -->

| Field | Value |
|---|---|
| Expected diff size | `<lines / files>` |
| Expected review effort | `<...>` |
| Reviewer(s) | `<named, by code ownership>` |
