# Corpus model

← [Back to README](../README.md)

## Why this exists

Agents are effective on a codebase they understand — and weak on one they must re-derive every session. The real behavior of an application lives in its code; written documentation drifts; and in a multi-application landscape, how services actually talk to each other is mostly tribal knowledge.

This pack turns a repository into a **durable, code-true knowledge base that agents read instead of re-discovering** — and that **composes across applications** into a single ecosystem view. The corpus is owned by the team, lives alongside the code, and is built primarily from the code itself, so it stays true as the system evolves.

- **Code decides — everything else enriches.** Production, tickets, docs and dashboards feed the corpus through MCP, but every durable claim is reconciled against code, which wins when sources disagree.
- **A lasting asset, not a session.** The corpus is a versioned artefact maintained over many focused runs, not throwaway agent output.
- **One app, then the whole landscape.** Each application documents its own boundary; those boundaries recompose into a cross-application graph, and peer corpora are read across the org via MCP.

## Core principle: code is the source of truth

When two sources disagree about how the application behaves today, the higher-rank source wins:

```
1. Repository code (current main/default branch)
2. Migrations + runtime config
3. Production observability (Dynatrace/APM/logs)
4. Tests
5. Operator interview answers
6. Jira / PRs / commits
7. Confluence and other written documentation
8. Tribal knowledge
```

Confluence, Jira and dashboards are useful for intent, history and stakeholders — but they drift. They are reconciled against code before being treated as truth. The full ranking lives in `foundations/core-rules` and is enforced throughout the pack.

## Corpus layout

```text
doc/
  README.md
  CORPUS_MAP.md
  CORPUS_MANIFEST.md
  _meta/                                   # state, coverage, pipeline state, interviews
    code-pipeline-state.yaml               # P1 → P9 status
    brick-inventory.yaml                   # work bricks that must become actionable
    actionable-readiness.md                # adoption readiness gate
    code-interview/                        # per-brick interview transcripts
    discovery-coverage.md                  # what each lane actually covered
  _indexes/                                # rebuilt from P3–P5 catalogs
  _roadmap/                                # continuous enrichment roadmap
  _graph/                                  # repo-native knowledge graph
  _runs/                                   # continuous run ledger
  _handover/                               # adoption guide material
  project/
    architecture/
      diagrams/                            # mandatory mermaid diagrams
    apis/CATALOG.md
    domain/ENTITIES.md
    screens/
    integrations/
    services/MESSAGING.md
    technical/{CODE_STYLE,NAMING_CONVENTIONS,STRUCTURAL_ISSUES,CROSS_CUTTING}.md
    features/<slug>/{README,ARCHITECTURE,WORKFLOWS,BUSINESS_RULES,OPERATIONS,AI_AGENT_GUIDE}.md
  prod/
    snapshots/
    structural-risks/                      # includes RISK-CODE-* from P7
    known-bugs/
    root-cause-playbooks/
    watchlist/
  spec/
  mcp/
```

The corpus is not a static documentation site. It is a governed knowledge base for agents and humans.

## Design principles

- Stack-neutral by default.
- Code is the source of truth; Confluence and other docs are reconciled against code.
- Every kickstart on a primary application repository runs the full P1 → P9 pipeline. There is no opt-in "light" mode.
- The code analysis pipeline is **resumable, not restartable** — the agent always verifies state before generating.
- Only human-facing roles are exposed as agents; technical capabilities are skills.
- Corpus ownership is centralized in `Corpus`.
- Production knowledge is first-class.
- Every P4 feature has a per-feature interview log.
- Every important claim carries source and confidence metadata.
- Frontmatter `confidence: confirmed` requires evidence from a rank 1–3 source (or an interview corroborated by code).
- Corpus validation is deterministic through `scripts/validate-corpus.mjs`, with hard gates on the pipeline.
- Adoption guide claims are hard-gated on `code_analysis_status: covered`, `actionable_readiness_status: covered` and roadmap honesty.
- Architecture diagrams are mandatory and generated from code, never imported from Confluence.
