---
name: readiness-gate
category: actionable
description: "Decide whether the corpus is actionable enough for real team workflows and strong adoption material."
---
# Actionable Readiness Gate

## Purpose

Decide whether the corpus is actionable enough for real team workflows and strong adoption material.

This gate is stricter than P1 → P9. P1 → P9 means the structural baseline exists. This gate means the corpus is dense enough for `developer`, `functional-analyst` and `reliability-analyst` to perform normal team tasks with confidence.

## Required conclusion labels

Use one of:

| Label | Meaning |
|---|---|
| `baseline_created_not_actionable` | structural corpus exists, but agents still need too much rediscovery |
| `partially_actionable` | useful for some tasks and some bricks, not safe for broad team adoption |
| `actionable_for_priority_scope` | priority bricks are deep enough; adoption material may target that scope only |
| `adoption_ready` | broad enough for team adoption material when the operator asks |

Do not use “adoption ready” when the right label is `baseline_created_not_actionable`.

## Mandatory first reads

1. `doc/_meta/corpus-state.yaml`
2. `doc/_meta/code-pipeline-state.yaml`
3. `doc/_meta/brick-inventory.yaml`
4. `doc/_meta/actionable-readiness.md`
5. `doc/_meta/discovery-coverage.md`
6. `doc/_meta/open-questions.md`
7. `doc/_meta/blocking-questions.md`
8. `doc/_indexes/`
9. `doc/_roadmap/ROADMAP_STATE.md`
10. `doc/_roadmap/CORPUS_ROADMAP.yaml`
11. `doc/prod/`
12. `doc/project/`

## Hard gates for adoption-ready

All must pass:

| Gate | Requirement |
|---|---|
| Code baseline | P1 → P9 all `covered` |
| Brick inventory | `actionable/brick-inventory` covered |
| Critical bricks | 100% critical bricks `actionable` or explicitly `not_applicable` |
| High bricks | at least 80% high bricks `actionable`; remaining high bricks have bounded follow-up |
| No fake depth | no critical/high brick marked actionable with zero source/config/query evidence |
| Indexes | critical indexes populated: by-feature, by-api, by-business-entity, by-component, by-batch if batches exist, by-production-signal if prod evidence exists, by-risk/by-bug when files exist |
| Graph and roadmap | graph nodes/edges/evidence and roadmap child nodes are populated from existing corpus knowledge |
| Operational meta | repository map, coverage matrix, discovery coverage and source inventory reflect the completed work |
| Production routing | production snapshot findings routed to component map, infra state, baselines/watchlist/playbooks where applicable |
| Source registry | used sources have concrete status, mapping, query/tool evidence |
| Per-brick source discovery | every critical/high partial brick has been checked for missing custom MCP/non-MCP sources |
| Roadmap honesty | critical/high roadmap gaps and next best actions are represented in `doc/_roadmap/` |
| Questions | no active blocking question contradicts a resolved open question |
| Adoption files | generated only when the operator asks and this gate is represented honestly |

Before setting `adoption_ready` or `corpus.actionable_readiness_status: covered`, run `governance/post-kickstart-completeness-audit`. If the audit finds empty indexes, skeleton graph, stale coverage matrix, unknown repository map or thin source inventory, the maximum conclusion is `partially_actionable` unless the missing area is explicitly out of scope.

## Agent task readiness

Assess these workflows explicitly:

| Agent | Workflow | Required corpus support |
|---|---|---|
| `developer` | safe code change | actionable brick page, entry points, tests, impact notes, risks |
| `functional-analyst` | impact/spec analysis | workflows, business rules, entities, APIs, related Jira/Confluence evidence |
| `reliability-analyst` | incident/run investigation | runtime topology, production signals, known bugs, watchlist/playbooks, failure modes |

The gate passes only when the priority scope supports all three agent families.

## Output

Update:

```text
doc/_meta/actionable-readiness.md
doc/_meta/corpus-state.yaml
doc/_meta/kickstart-progress.md
doc/_meta/update-candidates.md
```

`doc/_meta/actionable-readiness.md` must contain:

- conclusion label;
- scope covered;
- brick metrics by criticality;
- agent task readiness table;
- failed gates;
- missing custom MCP/non-MCP source questions by brick;
- exact next actions.

## State updates

When the gate passes broadly:

```yaml
corpus:
  actionable_readiness_status: covered
  phase: actionable_corpus_ready
adoption:
  readiness_status: adoption_candidate
```

When it does not pass:

```yaml
corpus:
  actionable_readiness_status: partial
  phase: baseline_created_not_actionable
adoption:
  readiness_status: evolving
```

## Anti-patterns

Do not:

- equate file existence with actionable detail;
- let P1 → P9 alone imply adoption readiness;
- ignore empty index files;
- treat a production snapshot as routed knowledge when prod index/watchlist/component files are still templates;
- hide “not actionable” behind optimistic wording.
- mark a critical/high brick as a simple content gap before checking whether a custom source is required.
