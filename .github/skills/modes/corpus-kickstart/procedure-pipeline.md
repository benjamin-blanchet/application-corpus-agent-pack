# Procedure — deep code analysis pipeline P1 → P9

Loaded by `modes/corpus-kickstart` for Step 5. **Mandatory** for any
primary application repository. Dispatched by `exploration/code-exploration`.

## Pass order and ownership

Between P1 and P2, also run `pipeline/code-activity-signals` (bounded
git-history scan, prioritization aid). It does not gate; P2 starts
immediately after, with or without this signal.

| # | Skill | What it does |
|---|---|---|
| P1 | `pipeline/p1-code-tree-inventory` | Walk every directory, classify every file, enumerate every CI/build system found (no silent picking) |
| — | `pipeline/code-activity-signals` *(between P1 and P2)* | Bounded git-history scan (200 commits / 180 days), writes per-file/folder/module activity scores to `doc/_meta/code-activity-signals.yaml`. Skips cleanly when git is unavailable or history is shallow. |
| P2 | `pipeline/p2-logical-boundaries` | Modules + layers + architectural style + **mandatory mermaid diagrams** (modules-deps, layers, arch-style) |
| P3 | `pipeline/p3-feature-candidates` | Enumerate every entry point, group into candidates, scaffold feature folders with `status: candidate` |
| P4 | `pipeline/p4-feature-silo-deep-dive` | Per-feature transitive read + **per-feature interview** via `pipeline/per-brick-interview` + non-stub companion files with mandatory diagrams |
| P5 | `pipeline/p5-cross-cutting-extraction` | API catalog, domain model (ER diagram), integrations (context + flow diagrams), messaging topology, persistence, cross-cutting |
| P6 | `pipeline/p6-code-style-naming` | Actual conventions per layer, lint vs. code reconciled |
| P7 | `pipeline/p7-structural-issues` | Coupling, parallel impls, dead code, smells; HIGH/CRITICAL → risk files |
| P8 | `pipeline/p8-code-maturity` | 12-dimension scorecard with evidence-citation |
| P9 | `pipeline/p9-code-reconciliation-gate` | Reconcile contradictions by claim scope, revision and environment; flip `code_analysis_status: covered` |

## Rules

- Never start P(N+1) until P(N).status == `covered`.
- Never silently skip a directory, an entry point, an entity, an integration or a category.
- Never write feature business prose at P1–P3.
- Each pass updates `doc/_meta/code-pipeline-state.yaml` with concrete metrics.
- Each pass updates `doc/_meta/discovery-coverage.md` repository row with the same metrics.
- For each P4 feature, an interview log lives at `doc/_meta/code-interview/<slug>.md` (or an explicit skip is recorded in the feature's `_evidence.yaml`).

## Architecture diagrams (mandatory)

Produced by the pipeline (sourced from code, never from Confluence):

```text
doc/project/architecture/diagrams/
  modules-deps.md             # P2
  layers.md                   # P2
  arch-style.md               # P2
  integration-context.md      # P5
  integration-flow.md         # P5
  messaging-topology.md       # P5
  domain-er.md                # P5
  persistence.md              # P5
```

Plus per-feature diagrams in `doc/project/features/<slug>/{ARCHITECTURE,WORKFLOWS}.md`
(and `BUSINESS_RULES.md` for state machines).

## Feature folder standard

```text
doc/project/features/<feature>/
  README.md                    # purpose + entry points + cross-refs
  ARCHITECTURE.md              # mandatory mermaid component diagram
  WORKFLOWS.md                 # mandatory mermaid sequence diagram
  BUSINESS_RULES.md            # rules with file:line citations
  OPERATIONS.md                # retries, errors, observability, tests
  AI_AGENT_GUIDE.md            # entry points, gotchas, change recipe
  _evidence.yaml               # files read in silo, interview ref, status
```

## Production knowledge standard (when prod sources available)

```text
doc/prod/known-bugs/BUG-<id>-<slug>.md
doc/prod/structural-risks/RISK-<id>-<slug>.md
doc/prod/structural-risks/RISK-CODE-<id>-<slug>.md   # P7-promoted code risks
doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md
doc/prod/watchlist/WATCH-<slug>.md
```
