# Continuous enrichment

← [Back to README](../README.md)

## Enrichment model

This pack is designed for an operator-assisted rollout:

```text
1. A corpus operator kickstarts the corpus for a team application.
2. The first runs build a deep initial map: code, prod, Atlassian, custom sources and unknowns.
3. `doc/_roadmap/`, `doc/_graph/` and `doc/_runs/` become the persistent control plane.
4. The operator launches many focused continuous runs: prod, memory, top features, batch health, Jira trajectory, code/prod reality.
5. Critical/high and high-interest roadmap nodes are deepened until the corpus creates a strong adoption effect.
6. When the operator asks, adoption guide material is generated under `doc/_handover/`.
```

## Roadmap, graph and run ledger

```text
doc/_roadmap/CORPUS_ROADMAP.md
doc/_roadmap/CORPUS_ROADMAP.yaml
doc/_roadmap/ROADMAP_STATE.md
doc/_roadmap/NEXT_BEST_ACTIONS.md
doc/_graph/nodes.yaml
doc/_graph/edges.yaml
doc/_graph/evidence.yaml
doc/_runs/RUN_LEDGER.md
```

The roadmap lets the operator run `Corpus` in a loop. `continue` resumes the active roadmap node. Nodes can go deep when it is worth it, with `interest_to_continue` scored from 0 to 10 and justified.

## Continuous enrichment skills

| Skill | Purpose |
|---|---|
| `continuous/roadmap-graph` | Maintain roadmap nodes, graph nodes, edges and evidence |
| `continuous/corpus-run` | Execute focused read-only enrichment runs |
| `continuous/corpus-run-audit` | Check whether the run capitalized durable knowledge |
| `continuous/next-best-corpus-actions` | Recommend high-value next runs |
| `continuous/domain-run-recipes` | Recipes for prod, memory, top features, feature deep dives, batch health, Atlassian trajectory and code/prod reality |
| `governance/post-kickstart-completeness-audit` | Block premature completion/adoption claims when indexes, graph, coverage or source metadata are still skeletons |
| `exploration/production-temporal-correlation` | Compare production signals across recent time slices and cross-reference them with code/catalog evidence |
| `exploration/ci-cd-activity-discovery` | Discover CI/CD pipelines, separate active from legacy/stale files, scan recent commits, map changed areas to corpus bricks |

## Parallel coverage with subagents

When VS Code exposes the `agent` / `runSubagent` tool, `Corpus` accelerates broad coverage by default with internal read-only subagents:

- `corpus-brick-feature-subagent`
- `corpus-brick-runtime-subagent`
- `corpus-brick-data-integration-subagent`
- `corpus-brick-reliability-subagent`
- `corpus-control-plane-subagent`

Subagents return coverage reports. The main `Corpus` agent remains the only writer and gate owner. If subagents are available but skipped on a broad scope, the run ledger must explain why.

## Visibility and governance

**Kickstart visibility.** During initialization, `Corpus` maintains `doc/_meta/kickstart-progress.md`, `doc/_meta/code-pipeline-state.yaml`, `doc/_meta/interaction-history/` and `doc/_meta/code-interview/`. The `governance/corpus-interaction-history` skill makes the process visible: current phase, generated artifacts, open inputs, next action, friction points and prompt improvements.

**Status footer.** `foundations/corpus-status-footer` ends every `Corpus` response with a scan-friendly state summary: adoption stage and maturity level, completeness by sector, **the 9 pipeline passes line-by-line**, durable source coverage plus any current-run probe impact, generated files, blocking inputs and the next bounded action.

**Discovery coverage.** `governance/discovery-coverage-contract` records how much evidence was actually collected in `doc/_meta/discovery-coverage.md`. It defines minimum coverage targets for repository source, Jira, Confluence, Dynatrace and custom sources. Available sources should be used to the maximum reasonable read-only extent; unavailable sources must be marked blocked or partial with reasons.

**Blocking questions.** `governance/blocking-question-loop` prevents passive blocker parking. If a missing answer would unlock better corpus coverage, `Corpus` asks the operator directly and tracks the exchange in `doc/_meta/blocking-questions.md`. For deeper rounds tied to a specific brick, it uses `pipeline/per-brick-interview` and stores transcripts under `doc/_meta/code-interview/`.

**Deep analysis squad.** `governance/deep-corpus-analysis-squad` coordinates lanes during a serious kickstart in `doc/_meta/deep-analysis-plan.md`. The source-code lane is the P1 → P9 pipeline. The squad cannot mark that lane covered until `code_analysis_status: covered` in `corpus-state.yaml`, and cannot claim adoption readiness until `actionable_readiness_status: covered` and roadmap state is honestly represented.
