# Corpus model

← [Back to README](../README.md)

## Why this exists

Agents are effective on a codebase they understand — and weak on one they must re-derive every session. Application structure lives primarily in code, while deployed behavior also depends on revision, configuration and environment; written documentation and intent can drift independently.

This pack turns a repository into a **durable, evidence-backed knowledge base that agents read instead of re-discovering** — and that **composes across applications** into a single ecosystem view. The corpus is owned by the team, lives alongside the code, and is built primarily from the code itself.

- **Authority follows the claim.** Code anchors implementation, deployed evidence anchors runtime, approved specifications anchor intent, and dated records anchor history.
- **A lasting asset, not a session.** The corpus is a versioned artefact maintained over many focused runs, not throwaway agent output.
- **One app, then the whole landscape.** Each application documents its own boundary; those boundaries recompose into a cross-application graph, and peer corpora are read across the org via MCP.

## Core principle: authority follows claim scope

Claims are classified before sources are reconciled:

| Scope | Best evidence |
|---|---|
| `implementation` | Code, migrations, configuration and tests at an explicit revision. |
| `runtime` | Deployed revision, effective configuration/flags and dated observation in a named environment. |
| `intent` | Approved specification, acceptance criteria, tests and explicit product/operator decisions. |
| `history` | Dated tickets, PRs, commits, decision records, interviews and documentation. |

A main-branch implementation and an older deployed revision can legitimately
differ. The corpus preserves both instead of forcing one false universal
answer. Time-sensitive claims carry `claim_scope`, `revision`, `environment`
and `observed_at` where applicable. Full rules live in
`foundations/core-rules`.

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
- Code is the structural spine; source authority is evaluated by claim scope,
  revision, environment and observation time.
- Every kickstart on a primary application repository runs the full P1 → P9 pipeline. There is no opt-in "light" mode.
- The code analysis pipeline is **resumable, not restartable** — the agent always verifies state before generating.
- Only human-facing roles are exposed as agents; technical capabilities are skills.
- Corpus ownership is centralized in `Corpus`.
- Production knowledge is first-class.
- Every P4 feature has a per-feature interview log.
- Every important claim carries source and confidence metadata.
- Frontmatter `confidence: confirmed` requires direct evidence appropriate to
  the declared claim scope.
- Corpus validation is deterministic through `scripts/validate-corpus.mjs`, with hard gates on the pipeline.
- Adoption guide claims are hard-gated on `code_analysis_status: covered`, `actionable_readiness_status: covered` and roadmap honesty.
- Architecture diagrams are mandatory and generated from code, never imported from Confluence.
