# Deep code analysis pipeline (P1 → P9)

← [Back to README](../README.md)

Code analysis is the first vector of corpus knowledge and is **mandatory** for every primary application repository. It runs as a 9-pass pipeline; each pass blocks the next.

| # | Skill | Output |
|---|---|---|
| P1 | `pipeline/p1-code-tree-inventory` | Exhaustive tree, classification of every file, enumeration of every CI/build system found |
| P2 | `pipeline/p2-logical-boundaries` | Modules + layers + architectural style + 3 mandatory mermaid diagrams (modules-deps, layers, arch-style) |
| P3 | `pipeline/p3-feature-candidates` | Every entry point classified, candidates with folder skeletons |
| P4 | `pipeline/p4-feature-silo-deep-dive` | Per-feature transitive read + per-feature interview + non-stub companion files (each with mandatory mermaid) |
| P5 | `pipeline/p5-cross-cutting-extraction` | API catalog, domain ER, integration map, messaging topology, persistence, cross-cutting + 5 mandatory diagrams |
| P6 | `pipeline/p6-code-style-naming` | Actual conventions per layer, lint vs. code reconciled |
| P7 | `pipeline/p7-structural-issues` | 11 categories of smells; HIGH/CRITICAL → risk files |
| P8 | `pipeline/p8-code-maturity` | 12-dimension scorecard with evidence-citation |
| P9 | `pipeline/p9-code-reconciliation-gate` | Reconcile contradictions by claim scope, revision and environment; flip `code_analysis_status: covered` |

The pipeline is **resumable, not restartable** — the agent always verifies state before generating.

P1 is backed by a deterministic helper:

```bash
node scripts/inventory-repo.mjs
```

It writes `doc/_meta/code-inventory.yaml`, `doc/_meta/code-inventory.md` and updates the P1 state block. The validator cross-checks covered P1 inventories against the current filesystem so stale or hand-written counts do not slip through.

## Per-brick interview

`pipeline/per-brick-interview` runs structured 5–15 question rounds tied to a specific brick (a feature in P4, a finding in P7, a contradiction in P9). The agent surfaces hypotheses inferred from code and asks the operator to confirm, correct or refer.

Transcripts live under `doc/_meta/code-interview/<slug>.md`. They are mandatory for each P4 feature unless explicitly skipped in `_evidence.yaml`.

For large repositories, the interview flow starts with triage/batch review before launching full per-feature rounds. This keeps the operator in control when P3 discovers many candidate features.

## Architecture diagrams

Mandatory mermaid diagrams produced by the pipeline:

```text
doc/project/architecture/diagrams/
  modules-deps.md             # P2 — declared module dependency graph
  layers.md                   # P2 — layer stack per module with real package names
  arch-style.md               # P2 — block diagram of the detected architectural pattern
  integration-context.md      # P5 — C4-context: app + neighbors
  integration-flow.md         # P5 — sequence diagrams per canonical flow
  messaging-topology.md       # P5 — producers/topics/consumers per broker
  domain-er.md                # P5 — erDiagram from migrations
  persistence.md              # P5 — DB engines/schemas/tables grouped
```

Plus per-feature diagrams in `doc/project/features/<slug>/{ARCHITECTURE,WORKFLOWS,BUSINESS_RULES}.md`.

All implementation diagrams are inline Mermaid and generated from the analyzed
code revision. External diagrams may be retained as dated intent/history, but
are not imported as implementation evidence.

## Actionable corpus readiness

P1 → P9 creates a structural baseline. It does **not** make the corpus ready for team adoption by itself.

Before strong adoption claims, the `Corpus` agent must run:

| Skill | Purpose |
|---|---|
| `actionable/brick-inventory` | Inventory all work bricks: features, APIs, screens, batches/jobs, consumers, integrations, entities, technical mechanisms, reliability scenarios and risks |
| `actionable/brick-deep-dive` | Deepen critical/high bricks until agents can work from the corpus |
| `actionable/closeout-consistency-pass` | Refresh indexes, prod routing, source registry, questions and state files |
| `actionable/readiness-gate` | Decide if the corpus is `baseline_created_not_actionable`, `partially_actionable`, `actionable_for_priority_scope` or `adoption_ready` |
| `actionable/subagent-coverage-orchestration` | Optionally use VS Code subagents to parallelize read-only coverage reports by brick family |
| `exploration/dynatrace-runtime-architecture` | Use Dynatrace to map runtime architecture, ecosystem, inbound/outbound flows, dependencies, logs, metrics and traces |
| `exploration/atlassian-project-trajectory` | Use Jira/Confluence cross-project and cross-space searches to understand roadmap, dependencies, incidents and ecosystem trajectory |

Adoption guide material is generated only when the operator asks for it. The target is not a demo script; the target is enough detail for `developer`, `functional-analyst` and `reliability-analyst` to perform normal work without rediscovering the repo.

## Corpus validation

After each pipeline pass, before adoption guide generation, and after significant corpus updates, run:

```bash
node scripts/validate-corpus.mjs
```

Hard gates (P0):

- Adoption/handover material with non-draft status when `code_analysis_status != covered` or `actionable_readiness_status != covered`.
- Pipeline passes marked `covered` out of order.
- Pipeline passes marked `covered` with missing artifacts or missing diagrams.
- P4-documented features missing companion files or per-feature interview.
- Mermaid blocks missing in mandatory diagram files.
- Any concept document missing a non-empty `type` (OKF conformance — see [Standards](standards.md)).
