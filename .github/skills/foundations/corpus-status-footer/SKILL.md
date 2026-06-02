---
name: corpus-status-footer
category: foundations
description: "Keep the operator in control during corpus initialization and continuous enrichment by ending important `Corpus` responses with a compact status footer."
---
# Corpus Status Footer

## Purpose

Keep the operator in control during corpus initialization and continuous enrichment by ending important `Corpus` responses with a compact status footer.

The footer shows pipeline progression (the 9 code-analysis passes), corpus completeness by sector, generated artifacts, blockers, MCP readiness and the next bounded action.

## When to use

- During every corpus kickstart response.
- Whenever the operator says "continue", "init", "kickstart", "lance", "où en est-on", or any equivalent kickstart-mode trigger.
- After each pass completes (P1 → P9).
- After each MCP readiness, project activity or production discovery phase.
- Before pausing for operator input.
- Before any adoption readiness review.
- When a continuous run reaches a natural pause and roadmap state matters.

## Required footer

End each kickstart response with this structure. Both blocks are mandatory; no skipping rows.

```text
Corpus status
- Phase:                              # e.g. "P4 silo deep dive (3/12 features documented)"
- Adoption stage:                     # 0 pack_copied | 1 operator_kickstart_started | 2 initial_corpus_generated | 3 reviewed_with_ai_champion | 4 used_by_team_on_real_work | 5 team_owned_maintenance
- Maturity level:                     # 0 | 1 (P1–P3 covered) | 2 (P1–P9 covered) | 3 (P1–P9 + prod covered/blocked)
- Overall completeness:               # empty | started | partial | usable | strong | blocked
- Project knowledge:                  # empty | started | partial | usable | strong | blocked + one-line evidence
- Production knowledge:               # ditto
- Specs/change support:               # ditto
- MCP/source readiness:               # Jira:status Confluence:status Dynatrace:status Custom:status
- Indexes/navigation:                 # ditto
- Roadmap/graph/runs:                 # active node + roadmap/graph/run-ledger status
- Adoption guide:                     # empty unless operator requested adoption material
- Actionable readiness:               # not_started | partial | covered + brick metrics / failed gates

Code analysis pipeline
- P1 tree inventory:                  # not_started | started | partial | covered | blocked + one-line metric (e.g. "5,213 files / 7 modules / 2 CI systems")
- P2 logical boundaries:              # ditto + diagrams status (3/3 produced)
- P3 feature candidates:              # ditto + (e.g. "47 entry points → 14 candidates")
- P4 feature silo deep dive:          # ditto + (e.g. "3/14 documented, 11 pending, 0 interview skipped")
- P5 cross-cutting extraction:        # ditto + diagrams (5/5)
- P6 code style & naming:             # ditto
- P7 structural issues:               # ditto + (e.g. "3 critical, 12 high, 8 medium")
- P8 code maturity:                   # ditto + overall score
- P9 code reconciliation gate:        # ditto + (e.g. "0 pending contradictions")

- Generated/updated this step:        # comma-separated list of files written
- Blocking inputs:                    # list of active BQ-* with the action the operator should take
- Next action:                        # one bounded sentence
```

## Completeness scale

| Label | Meaning |
|---|---|
| `empty` | Skeleton only, no verified application knowledge. |
| `started` | First verified facts exist, but coverage is narrow. |
| `partial` | Useful for some tasks, but obvious gaps remain. |
| `usable` | Good enough for common agent tasks in this sector. |
| `strong` | Broad, verified, indexed and recently validated. |
| `blocked` | Cannot progress without missing access, mapping or human input. |

For the pipeline rows, use the discovery-coverage scale instead:

| Label | Meaning |
|---|---|
| `not_started` | Pass has not run. |
| `started` | First useful evidence collected. |
| `partial` | Useful evidence, target not met. |
| `covered` | Minimum target met, ready for next pass. |
| `blocked` | Cannot proceed without setup/input. |

## Sector definitions

| Sector | What to include |
|---|---|
| Project knowledge | App profile, repo map, stack, entry points, features (from P3/P4), APIs/entities/messaging (from P5), architecture diagrams. |
| Production knowledge | Observability, incidents, known bugs, risks (including RISK-CODE-* from P7), playbooks, watchlist, runtime topology. |
| Specs/change support | Spec templates, existing specs, implementation guidance. |
| MCP/source readiness | Jira, Confluence, Dynatrace, GitHub, custom sources, source registry, smoke tests. |
| Indexes/navigation | `_indexes`, corpus map, source inventory, links, discoverability. |
| Roadmap/graph/runs | Active roadmap node, next best actions, graph updates, run ledger. |
| Adoption guide | AI champion, team guide, next 30 days, open decisions, operator closeout. **Empty until the operator asks for adoption material.** |
| Actionable readiness | Brick inventory, critical/high brick depth, agent task readiness, closeout consistency. **Required before adoption material can be presented as strong.** |

## Required behavior

1. Read `doc/_meta/code-pipeline-state.yaml` before producing the footer — the pipeline rows must reflect its content exactly.
2. Read `doc/_meta/discovery-coverage.md` for the source-coverage rows.
3. Read `doc/_meta/corpus-state.yaml` for adoption stage and maturity level.
4. Read `doc/_meta/blocking-questions.md` for active questions.
5. Use `doc/_meta/coverage-matrix.md` when available.
6. Mention every newly generated or updated file from this step.
7. The Next action must be **bounded and concrete** (e.g. "Run P3: enumerate entry points across myapp-webapp + myapp-api"), not vague ("continue exploration").
8. Keep the footer short enough to scan in under 30 seconds.
9. **Never report Adoption guide as `usable` or above when `code_analysis_status != covered` or `actionable_readiness_status != covered`.** This is a hard rule.
10. For continuous runs, include active roadmap node and next recommended run if known.
11. **Always precede this footer with the end-of-run operator recap** described in `corpus.agent.md` ("End-of-run operator recap") and in `continuous/corpus-run` (Chat output shape, block 1). The structured footer never closes the run on its own — the high-level plain-language recap, ending with an explicit invitation to confirm or enrich, must come first.

## Example

```text
Corpus status
- Phase: P4 silo deep dive (3/14 features documented)
- Adoption stage: 1 operator_kickstart_started
- Maturity level: 1
- Overall completeness: partial
- Project knowledge: partial - P1–P3 covered, P4 in progress, 3/14 features non-stub
- Production knowledge: started - Dynatrace 24h snapshot done, 7d errors pending
- Specs/change support: template only
- MCP/source readiness: Jira:available Confluence:available Dynatrace:available Custom:not_applicable
- Indexes/navigation: started - by-feature populated from P3, others pending P5
- Roadmap/graph/runs: started - active node `feature:duplicate`, run ledger updated
- Adoption guide: empty - not requested
- Actionable readiness: not_started - starts after P1→P9 and source discovery

Code analysis pipeline
- P1 tree inventory: covered - 5,213 files / 7 modules / 2 CI systems (Jenkins legacy + GitHub Actions active)
- P2 logical boundaries: covered - 7 modules mapped, layered style, 3/3 diagrams produced
- P3 feature candidates: covered - 47 entry points → 14 candidates
- P4 feature silo deep dive: started - 3/14 documented, 11 pending, 0 interview skipped
- P5 cross-cutting extraction: not_started
- P6 code style & naming: not_started
- P7 structural issues: not_started
- P8 code maturity: not_started
- P9 code reconciliation gate: not_started

- Generated/updated this step: doc/project/features/duplicate/{README,ARCHITECTURE,WORKFLOWS,BUSINESS_RULES,OPERATIONS,AI_AGENT_GUIDE}.md, doc/_meta/code-interview/duplicate.md, doc/_meta/code-pipeline-state.yaml
- Blocking inputs: BQ-007 (confirm whether OldArchiveService is still alive in prod or dead code) — operator answer needed
- Next action: P4 — silo deep dive on `archive` feature (next in candidate list)
```

## Anti-patterns

Do not:

- end with a vague "tell me if you want me to continue";
- hide blockers inside long prose;
- report Adoption guide green when the pipeline is incomplete (validator hard-rejects this);
- omit pipeline rows ("we are in P4" without showing P1–P9);
- omit generated files after writing corpus artifacts;
- use exact percentages without evidence.
