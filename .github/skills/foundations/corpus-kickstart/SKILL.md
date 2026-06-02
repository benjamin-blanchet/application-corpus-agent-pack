---
name: corpus-kickstart
category: foundations
lifecycle: init-only
description: "Run the first corpus pass in a repository that has no agentic base of knowledge."
---
# Corpus Kickstart

## Purpose

Run the first corpus pass in a repository that has no agentic base of knowledge.

The kickstart is operator-led. It must produce a baseline and roadmap that are **deep enough to be trusted** — not a token first pass. Code analysis is the first vector and is governed by the mandatory 9-pass pipeline (P1 → P9). Other discovery lanes (Jira, Confluence, Dynatrace, custom) are run with their own coverage contracts. Adoption material is not generated unless the operator asks for it.

## Inputs

- Local repository files.
- Existing README/docs if any.
- Connected sources when configured (Jira, Confluence, Dynatrace, custom MCP, SQL, APIs).
- Human operator answers to interview questions and blocking questions.

## Outputs

```text
doc/_meta/app-profile.yaml
doc/_meta/repository-map.yaml
doc/_meta/source-inventory.md
doc/_meta/information-sources.yaml
doc/_meta/coverage-matrix.md
doc/_meta/discovery-coverage.md
doc/_meta/blocking-questions.md
doc/_meta/open-questions.md
doc/_meta/mcp-source-wizard.md
doc/_meta/mcp-readiness.md
doc/_meta/kickstart-progress.md
doc/_meta/kickstart-report.md
doc/_meta/code-pipeline-state.yaml
doc/_meta/brick-inventory.yaml
doc/_meta/actionable-readiness.md
doc/_meta/code-inventory.{md,yaml}
doc/_meta/logical-boundaries.yaml
doc/_meta/feature-candidates.yaml
doc/_meta/cross-cutting-state.yaml
doc/_meta/code-style-state.yaml
doc/_meta/structural-issues.yaml
doc/_meta/code-maturity.yaml
doc/_meta/reconciliation-ledger.yaml
doc/_meta/code-interview/<slug>.md                              # one per P4 feature interview
doc/_meta/interaction-history/YYYY-MM-DD-corpus-kickstart-session.md
doc/_indexes/*.md
doc/project/architecture/{MODULES,LAYERS,ARCH_STYLE,INTEGRATION_MAP,PERSISTENCE}.md
doc/project/apis/CATALOG.md
doc/project/domain/ENTITIES.md
doc/project/services/MESSAGING.md
doc/project/technical/{CODE_STYLE,NAMING_CONVENTIONS,STRUCTURAL_ISSUES,CROSS_CUTTING}.md
doc/project/features/<slug>/{README,ARCHITECTURE,WORKFLOWS,BUSINESS_RULES,OPERATIONS,AI_AGENT_GUIDE}.md  # one per documented feature
doc/project/activity/YYYY-MM-DD-project-activity-discovery.md   # when Jira/Git/source-control is available
doc/prod/snapshots/YYYY-MM-DD-production-discovery.md           # when production source is available
```

## Steps

1. Verify copied pack structure.
2. Initialize or update `doc/_meta/kickstart-progress.md`.
3. Create or update the active interaction history session using `governance/corpus-interaction-history`.
4. Initialize `doc/_meta/discovery-coverage.md` and apply `governance/discovery-coverage-contract`.
5. Initialize `doc/_meta/code-pipeline-state.yaml` with all 9 passes set to `not_started`.
6. Detect repository role: primary, secondary, library or unknown.
7. Run `sources/mcp-source-wizard` to inventory standard MCP, custom MCP and non-MCP sources before choosing discovery paths.
8. Before Jira, Confluence, Dynatrace or custom MCP consumption, run `sources/mcp-readiness-check` and update `doc/_meta/mcp-readiness.md`.
9. Register available information sources using `sources/information-source-onboarding`, including MCP, custom SQL/API/file sources.
10. Apply `governance/safe-operation-guardrails`: kickstart is read-only outside `doc/` and `.github/` pack files.
11. **Run the deep code analysis pipeline P1 → P9 in order, via `exploration/code-exploration`.** This is the first vector of corpus knowledge and is mandatory for any primary application repository. Do not start the next step until P9 marks `code_analysis_status: covered`.
    - P1 `pipeline/p1-code-tree-inventory`
    - P2 `pipeline/p2-logical-boundaries`
    - P3 `pipeline/p3-feature-candidates`
    - P4 `pipeline/p4-feature-silo-deep-dive` (per-feature interview required via `pipeline/per-brick-interview`)
    - P5 `pipeline/p5-cross-cutting-extraction`
    - P6 `pipeline/p6-code-style-naming`
    - P7 `pipeline/p7-structural-issues`
    - P8 `pipeline/p8-code-maturity`
    - P9 `pipeline/p9-code-reconciliation-gate`
12. Initialize / refresh indexes from the catalogs produced by P3–P5 (no speculative entries).
13. If Jira is available, cover the Jira contract from `governance/discovery-coverage-contract` in full. If Confluence is available, walk the relevant page tree, not only search snippets.
14. If Dynatrace/APM, a log database, an API, an export or another production source is available, run `exploration/production-discovery` and produce an initial production snapshot / fresh-eyes report. If Dynatrace is available, run `exploration/dynatrace-runtime-architecture` as part of the same production lane: map runtime architecture, ecosystem, inbound/outbound flows, dependencies, logs, metrics and traces over bounded 24h/7d/30d windows when supported.
15. If CI/CD files, local Git history, PR/check data or workflow-run evidence are available, run `exploration/ci-cd-activity-discovery`: classify active/legacy/stale/unknown pipelines and scan recent commits to identify active bricks.
16. If Jira/Confluence/Dynatrace or custom MCP sources are expected but not available to the current IDE agent session, report this clearly and do not silently fall back.
17. If project or production source access is unavailable, use `governance/blocking-question-loop` before parking the issue: ask the operator for missing source names, keys, spaces, entity mapping or IDE tool attachment.
18. If production source access remains unavailable, record this explicitly in `open-questions.md`, `blocking-questions.md`, `mcp-readiness.md`, `discovery-coverage.md`, `coverage-matrix.md`, `kickstart-progress.md` and `kickstart-report.md`.
19. Record unknowns rather than blocking the run only after asking when the operator could answer.
20. Set adoption state to `operator_kickstart_started` when the kickstart begins.
21. **Maturity level rules:**
    - `maturity_level: 1` requires P1–P3 covered (inventory + boundaries + candidates).
    - `maturity_level: 2` requires P1–P9 covered (full code analysis baseline).
    - `maturity_level: 3` requires `maturity_level: 2` AND production discovery either covered or explicitly blocked with reason.
22. Run `continuous/roadmap-graph` and initialize/expand `doc/_roadmap/`, `doc/_graph/` and `doc/_runs/`.
23. Run `actionable/brick-inventory`, `actionable/brick-deep-dive`, `actionable/closeout-consistency-pass`, `governance/post-kickstart-completeness-audit` and `actionable/readiness-gate` before any strong adoption claim.
24. When `runSubagent` or `agent` is available, use `actionable/subagent-coverage-orchestration` by default for broad brick coverage and post-kickstart completeness. If subagents are available but skipped, record why in `doc/_runs/RUN_LEDGER.md`.
25. **Do not prepare adoption guide material unless the operator asks for it.** Generating adoption material from a structural baseline while hiding gaps is a hard violation; the validator refuses overclaiming.

## Operator visibility

The operator should never have to say "continue" blindly.

Before continuing a long pass, provide a concise checkpoint:

```text
Kickstart checkpoint
- Phase:                    # e.g. P4 feature silo deep dive (3/12 features documented)
- Done:                     # e.g. P1, P2, P3 covered
- Generated/updated:
- Open inputs:              # blocking questions waiting for the operator
- Next:                     # bounded next action
```

Update `doc/_meta/kickstart-progress.md` with the same state.

End every kickstart response with `foundations/corpus-status-footer`, including completeness by sector and the next bounded action.

The footer must reflect `doc/_meta/discovery-coverage.md` and `doc/_meta/code-pipeline-state.yaml`: repository, Jira, Confluence, Dynatrace, custom sources and each pass P1–P9 should never be hidden behind a generic "in progress".

The footer must also reflect `doc/_meta/actionable-readiness.md` and `doc/_roadmap/ROADMAP_STATE.md`: whether the corpus is only a structural baseline, partially actionable, actionable for a priority scope, and what the active roadmap node is.

Before MCP-backed phases, include an MCP readiness checkpoint:

```text
MCP readiness checkpoint
- Jira:
- Confluence:
- Dynatrace:
- Required IDE action:
- Discovery impact:
```

## Quality bar

The kickstart is not a "small but true" first sketch. It is the **trusted baseline** the team will rely on.

Code analysis must be exhaustive — every directory walked (P1), every entry point classified (P3), every feature interviewed (P4), every contradiction reconciled (P9). A project activity snapshot is valuable only when grounded in verified Jira/Git/PR/CI data. A production discovery snapshot is valuable only when grounded in verified observability data. When Dynatrace is available, a single health query is not enough: the corpus must also capture production architecture, inbound/outbound flows, dependency graph, representative logs/metrics/traces and observability blind spots. If sources are unavailable or mapping is unclear, say so plainly with the source row marked `blocked` or `partial` and a reason.

A short, candid corpus is acceptable when sources are missing. A short, **confident** corpus is not.

P1 → P9 covered is not enough for strong team adoption. It only means the structural baseline exists. The corpus becomes adoption-worthy only when important work bricks and roadmap branches are actionable: detailed enough for downstream delivery, spec analysis and reliability analysis workflows without forcing the consumer to rediscover the application from scratch.

The kickstart is also not complete while generated knowledge is invisible through skeleton control-plane files. If feature, batch, API, entity, integration, production or risk files exist, their indexes, graph nodes/edges/evidence, coverage matrix, repository map and source inventory must be refreshed before the agent says it has reached the end of kickstart.

## Serious / full kickstart coordination

For multi-disciplinary kickstarts that go beyond code (functional, architecture, production, project, adoption), `governance/deep-corpus-analysis-squad` coordinates the lanes. The code-analysis lane in the squad **is** the P1 → P9 pipeline; the squad does not replace it.

## Destructive action policy

Kickstart must not change application behavior, application source, database state, tickets, CI/CD, runtime state, external tools or shared repositories. It may edit the corpus and pack files only. For anything else, use `governance/safe-operation-guardrails` and produce a plan or open question instead of executing.
