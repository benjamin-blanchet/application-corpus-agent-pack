---
type: agents-reference
audience: operator
status: stable
source: pack
title: "Operator onboarding — kickstart, outputs, dashboard, rollout"
description: "Any kickstart-mode trigger works:"
---

# Operator onboarding — kickstart, outputs, dashboard, rollout

> Detailed companion to `AGENTS.md`. Read when you bring the pack into a
> new repo or when reviewing what a kickstart actually produces.

## First run — invoke the corpus agent

Any kickstart-mode trigger works:

- "init le corpus", "kickstart", "lance le corpus"
- "where are we on the corpus", "continue", "resume kickstart"
- "fais l'analyse complète du repo", "run the deep analysis"

The agent verifies state first (reads `corpus-state.yaml`,
`code-pipeline-state.yaml`, `discovery-coverage.md`, `kickstart-progress.md`,
`blocking-questions.md`) and produces a resume report before generating
anything.

## What kickstart runs

The kickstart runs the **deep code analysis pipeline P1 → P9** as the first
vector of corpus knowledge. It is mandatory for every primary application
repository — no opt-in light mode.

P1 starts with `node scripts/inventory-repo.mjs`. The script produces
measured inventory files and updates the P1 block; the validator later
compares covered P1 counts with the current filesystem.

P1 → P9 is a structural baseline, not team adoption readiness. After the
baseline, `Corpus` runs actionable readiness:

```text
.github/skills/actionable/brick-inventory/SKILL.md
.github/skills/actionable/brick-deep-dive/SKILL.md
.github/skills/actionable/closeout-consistency-pass/SKILL.md
.github/skills/actionable/readiness-gate/SKILL.md
.github/skills/actionable/subagent-coverage-orchestration/SKILL.md
```

Adoption-guide material is generated only when the operator asks for it.
Continuous enrichment remains open. `governance/post-kickstart-completeness-audit`
must pass before the agent says kickstart reached a natural end.

## Expected outputs (incremental, pass by pass)

```text
doc/_meta/code-pipeline-state.yaml                                            # P1 → P9 status
doc/_meta/code-inventory.{md,yaml}                                            # P1
doc/_meta/logical-boundaries.yaml                                             # P2
doc/project/architecture/{MODULES,LAYERS,ARCH_STYLE}.md                       # P2
doc/project/architecture/diagrams/{modules-deps,layers,arch-style}.md         # P2 mandatory mermaid
doc/_meta/feature-candidates.yaml                                             # P3
doc/project/features/<slug>/{README,ARCHITECTURE,WORKFLOWS,BUSINESS_RULES,OPERATIONS,AI_AGENT_GUIDE}.md  # P4
doc/_meta/code-interview/<slug>.md                                            # P4 per-feature interview
doc/_meta/cross-cutting-state.yaml                                            # P5
doc/project/{apis/CATALOG,domain/ENTITIES,architecture/INTEGRATION_MAP,architecture/PERSISTENCE,services/MESSAGING}.md  # P5
doc/project/architecture/diagrams/{integration-context,integration-flow,messaging-topology,domain-er,persistence}.md    # P5 mandatory mermaid
doc/project/technical/{CODE_STYLE,NAMING_CONVENTIONS,STRUCTURAL_ISSUES,CROSS_CUTTING}.md  # P6 + P7
doc/_meta/{code-style-state,structural-issues,code-maturity}.yaml             # P6 + P7 + P8
doc/_meta/reconciliation-ledger.yaml                                          # P9
doc/_meta/kickstart-report.md
doc/prod/snapshots/YYYY-MM-DD-production-discovery.md                         # only if production sources are available
```

## Subagent acceleration (when available)

If the IDE exposes the `agent` / `runSubagent` tool, `Corpus` parallelizes
broad read-only brick coverage with internal subagents by default:

```text
.github/agents/corpus-brick-feature-subagent.agent.md
.github/agents/corpus-brick-runtime-subagent.agent.md
.github/agents/corpus-brick-data-integration-subagent.agent.md
.github/agents/corpus-brick-reliability-subagent.agent.md
.github/agents/corpus-control-plane-subagent.agent.md
```

Subagents are helpers only: they return coverage reports; the main
`Corpus` agent writes corpus files and owns gates. If subagent tooling is
available but not used on a broad scope, the reason must be recorded in
`doc/_runs/RUN_LEDGER.md`.

## Operator-assisted rollout

1. A corpus operator kickstarts the corpus for a team application.
2. The operator builds and deepens the roadmap over many focused runs.
3. The operator prepares `doc/_handover/` adoption-guide material when the corpus is clean enough to show.
4. The operator reviews the corpus with the AI champion.
5. The broader team receives usage guidance.
6. The team maintains the corpus through real work.

## Corpus dashboard (auto-synchronized)

The dashboard at `doc/_site/corpus.html` is a derived artefact regenerated
automatically at the end of every Corpus run that wrote under `doc/`. The
operator never has to rebuild it by hand. Open the file directly in a
browser (self-contained — no server, no external assets).

The dashboard opens on the **Executive view** by default: scale signals,
top 5 surprises, what we know vs. don't know, next 3 actions. Print with
`Cmd/Ctrl+P` → save as PDF for a 1-page A4 summary.

Other tabs (About, Universe, Coverage, Sources, Trajectory, Indexes,
Graph) are champion-facing exploration surfaces. All views read from the
same corpus state — no drift between tabs.

`doc/_site/corpus.html` is gitignored: regenerates locally, never commits.
A rebuild failure is surfaced in the run recap (silent staleness is the
failure mode this contract prevents).

## Source contracts and runtime access

Before using Jira, Confluence, Dynatrace or any custom source, `Corpus` runs
`sources/mcp-source-wizard` when inventory is unclear, reads the durable source
contract, then uses `sources/runtime-source-probe` to make the point-in-time
capability explicit.

If a required source is unusable, the agent reports the exact runtime
observation and must not silently fall back to a weaker discovery path. The
observation is not global corpus state; only evidence and historical coverage
are capitalized in `doc/_meta/source-coverage.yaml`.

Attach only the source adapters needed for the active phase — see
`doc/_meta/agent-cache-discipline.md § Source adapters`.

## Kickstart visibility

The operator should never have to say "continue" blindly. During kickstart,
`Corpus` maintains `doc/_meta/kickstart-progress.md` and shows a checkpoint
before long continuations:

```text
Kickstart checkpoint
- Phase:
- Done:
- Generated/updated:
- Open inputs:
- Next:
```

Interaction history lives under `doc/_meta/interaction-history/` as
synthesized process notes, not raw transcripts.

Every `Corpus` response during kickstart ends with the
`foundations/corpus-status-footer` block (9 pipeline passes line-by-line,
adoption stage, maturity level, etc.).
