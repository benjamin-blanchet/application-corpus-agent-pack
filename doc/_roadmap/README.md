---
type: corpus-roadmap-index
status: active
confidence: confirmed
source: pack
last_validated:
---

# Corpus Roadmap

This directory is the persistent work map for continuous corpus enrichment.

The corpus is not expected to become complete in one initialization. The roadmap records what is known, what deserves deeper analysis, what was parked and what the next valuable runs are.

## Files

| File | Purpose |
|---|---|
| `CORPUS_ROADMAP.md` | Two-part: Active Zones table + Recently Expanded log (per run) and Full Tree (major pass only). |
| `CORPUS_ROADMAP.yaml` | Structured roadmap state for agents. Header is per-run; full `nodes:` list is major pass only. |
| `ROADMAP_STATE.md` | Current mode, active node, resume hint and coverage snapshot. |
| `NEXT_BEST_ACTIONS.md` | Top 5 recommended next runs, re-ranked every run. |
| `ROADMAP_DECISIONS.md` | Operator/agent decisions that shape the roadmap. |

## Two-level update model

To stay in sync without paying for a full graph rebuild on every `continue`, this directory follows a two-level model. The agent (`Corpus`) and skills (`continuous/corpus-run`, `continuous/roadmap-graph`, `continuous/corpus-run-audit`) enforce it.

| File / Section | Update frequency | Cost | Content updated |
|---|---|---|---|
| `ROADMAP_STATE.md` | Every run | Low | Active node, last run, resume hint, coverage snapshot row touched. |
| `NEXT_BEST_ACTIONS.md` | Every run | Low | Top 5 actions re-ranked. |
| `CORPUS_ROADMAP.yaml` — header | Every run | Very low | `active_node_id`, `last_completed_node_id`, `last_run`, `node_count` if changed. |
| `CORPUS_ROADMAP.yaml` — touched node | Every run | Low | Status, interest, `analysis_energy.last_run`, `coverage.*` for the node the run worked on. |
| `CORPUS_ROADMAP.md` — Active Zones table | Every run | Low | Row for the impacted zone (status, bricks, interest, last touched, next action). |
| `CORPUS_ROADMAP.md` — Recently Expanded log | Every run that creates children | Low | One appended line; never rewritten. |
| `CORPUS_ROADMAP.yaml` — full `nodes:` list | Major pass only | High | Full rebuild from `doc/_meta/brick-inventory.yaml`, P3 features, integrations, prod signals. |
| `CORPUS_ROADMAP.md` — Full Tree | Major milestone only | Medium | Refreshed ASCII tree to reflect the new node set. |

**Major pass triggers:**

- Full kickstart completion.
- `corpus.code_analysis_status` flips to `covered` (P1→P9 done).
- A broad subagent coverage sweep via `actionable/subagent-coverage-orchestration`.
- Operator explicitly asks for a roadmap rebuild or "full refresh".
- `governance/post-kickstart-completeness-audit` finds the structural state has drifted from reality.

Between major passes, the Full Tree may lag; the Active Zones table and `CORPUS_ROADMAP.yaml` are authoritative.

## Operating Model

- Initial runs should maximize roadmap quality, not rush to adoption material.
- Later runs choose or create roadmap nodes, gather evidence, ask useful questions and consolidate durable knowledge.
- A node can create children when deeper analysis is clearly valuable.
- `interest_to_continue` is scored from `0` to `10` and must include a short justification.
- `continue` means resume the last active node unless context is lost.
- Every run must complete the **end-of-run housekeeping** write set defined in `continuous/corpus-run`. Forgetting `CORPUS_ROADMAP.yaml` is the root cause of roadmap desynchronization and is an audit failure under `continuous/corpus-run-audit`.
