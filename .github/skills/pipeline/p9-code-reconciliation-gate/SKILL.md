---
name: p9-code-reconciliation-gate
category: pipeline
description: "Final gate before code analysis can be marked `covered`. Surface every contradiction P1–P8 collected, force a resolution (re-read, ask the operator, or accept-and-record), then update the master discovery coverage."
---
# Code Reconciliation Gate (Pass 9 / 9)

## Purpose

Final gate before code analysis can be marked `covered`. Surface every contradiction P1–P8 collected, force a resolution (re-read, ask the operator, or accept-and-record), then update the master discovery coverage.

Without this pass, the corpus may pass earlier gates while still containing silent contradictions like "CI is Jenkins" / "CI is GitHub Actions".

## Prerequisite

`p8_code_maturity.status == covered`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/_meta/feature-candidates.yaml`
4. `doc/_meta/cross-cutting-state.yaml`
5. `doc/_meta/code-style-state.yaml`
6. `doc/_meta/structural-issues.yaml`
7. `doc/_meta/code-maturity.yaml`
8. `doc/_meta/code-pipeline-state.yaml`
9. `doc/_meta/blocking-questions.md`
10. `doc/_meta/discovery-coverage.md`

## Required behavior

1. Walk every output file from P1–P8 and **collect contradictions** into a single ledger.
2. For each contradiction, attempt resolution in this order:
   a. Re-read the source files cited on each side. Often one side is stale.
   b. Apply the **source priority ranking** from `foundations/core-rules`: code (rank 1) > migrations + runtime config (rank 2) > production observability (rank 3) > tests (rank 4) > operator interview (rank 5) > Jira/PRs/commits (rank 6) > **Confluence and other written documentation (rank 7)** > tribal knowledge (rank 8). When two sides come from different ranks, the higher-rank source wins by default; record the rank that won.
   c. If both sides come from the same rank (e.g. two code-level claims), open a blocking question via `governance/blocking-question-loop` or a structured round via `pipeline/per-brick-interview`.
   d. If the operator cannot decide, record `accepted_unresolved` with the reason and move it to `doc/_meta/open-questions.md` with high priority.
3. Update every output file affected so they no longer contradict each other. When the loser is Confluence, preserve the Confluence claim under a "Confluence-stated, does not match code" sub-section with page ID, last-modified date and the date of reconciliation — do not delete it; it is historical evidence and may indicate a documentation defect the team should fix.
4. Update `doc/_meta/discovery-coverage.md` to reflect the post-reconciliation truth.
5. Refuse to mark `code_analysis: covered` until **every contradiction is resolved or `accepted_unresolved` with a reason**.

## Contradiction sources to scan

| Where | Typical contradictions |
|---|---|
| P1 inventory | Multiple build systems / CI systems / package managers; conflicting Dockerfile content. |
| P2 boundaries | Build manifest declares module X; no source files for X. |
| P3 candidates | Two candidates with overlapping entry points still both `documented`. |
| P4 features | Feature folder claims an entry point that P5 catalog does not list. |
| P5 catalogs | Entity in ENTITIES with no table; table with no entity; topic with no consumer; endpoint without auth contradicting CROSS_CUTTING auth section. |
| P6 style | Lint rule declared but evidence shows it is not respected. |
| P7 issues | Risk file references a class that no longer exists; structural finding references a path renamed in P5. |
| P8 maturity | Score cites a file that has been moved/renamed. |
| Cross-pass | Feature folder says "Kafka path is canonical"; INTEGRATION_MAP says "JMS path active in prod". |
| Frontmatter | `confidence: confirmed` on a file whose evidence chain has gaps. |

For the legacy/migration case (e.g. Jenkins + GitHub Actions): the gate must produce a sentence like *"Both `Jenkinsfile` and `.github/workflows/build.yml` exist. Operator confirmed GitHub Actions is the active CI as of <date>; Jenkins is legacy and scheduled for removal in <ticket>."* — and update P1 inventory + P5 CROSS_CUTTING accordingly.

## Output files

```text
doc/_meta/reconciliation-ledger.md          # human-readable list of all contradictions and resolutions
doc/_meta/reconciliation-ledger.yaml        # machine-readable
doc/_meta/discovery-coverage.md             # updated repository row + code section
doc/_meta/code-pipeline-state.yaml          # P9 status, code_analysis_status flipped
doc/_meta/corpus-state.yaml                 # code_analysis fields updated
```

### `reconciliation-ledger.yaml` schema

```yaml
contradictions:
  - id: "RECON-001"
    discovered_in: ["doc/_meta/code-inventory.yaml", "doc/project/technical/CROSS_CUTTING.md"]
    summary: "Two CI systems present (Jenkinsfile + .github/workflows/)"
    evidence:
      side_a: { source: "Jenkinsfile", claim: "CI is Jenkins" }
      side_b: { source: ".github/workflows/build.yml", claim: "CI is GitHub Actions" }
    resolution:
      method: "operator_confirmation"
      result: "GitHub Actions active since 2025-11; Jenkins legacy, removal tracked in TICKET-123"
      operator_question_ref: "BQ-042"
      files_updated:
        - "doc/_meta/code-inventory.yaml"
        - "doc/project/technical/CROSS_CUTTING.md"
        - "doc/project/technical/STRUCTURAL_ISSUES.md"
    status: "resolved"
  - id: "RECON-002"
    summary: "ENTITIES lists `Customer` entity; no `CUSTOMER` table in migrations"
    resolution:
      method: "code_re_read"
      result: "Customer is a value object, not persisted; ENTITIES corrected"
      files_updated: ["doc/project/domain/ENTITIES.md"]
    status: "resolved"
  - id: "RECON-004"
    summary: "Confluence page 12345678 says 'archiving uses JMS'; code shows Kafka is the active path"
    evidence:
      side_a: { source: "confluence:12345678", rank: 7, claim: "Archiving via JMS ActiveMQ", last_modified: "2024-09-12" }
      side_b: { source: "code:ArchiveKafkaListener.java", rank: 1, claim: "Kafka @KafkaListener active in prod" }
    resolution:
      method: "source_priority_rank"
      winner_rank: 1
      result: "Code wins. Kafka is canonical. JMS path documented as legacy in feature folder."
      files_updated:
        - "doc/project/features/archive/README.md"
        - "doc/project/features/archive/ARCHITECTURE.md"
      confluence_claim_preserved_at: "doc/project/features/archive/README.md#confluence-stated-does-not-match-code"
    status: "resolved"
  - id: "RECON-003"
    summary: "..."
    resolution:
      method: "accepted_unresolved"
      reason: "Operator unsure whether the legacy SOAP endpoint is consumed externally; needs business owner; tracked as OQ-019"
    status: "accepted_unresolved"
counts:
  total: <int>
  resolved: <int>
  accepted_unresolved: <int>
  pending: <int>          # MUST be 0 to mark code_analysis covered
```

## Coverage targets (gate for P9 → covered AND code_analysis → covered)

| Metric | Target | Hard gate |
|---|---|---|
| `pending` contradictions | 0 | yes |
| Every `accepted_unresolved` has a reason and an `OQ-*` reference | 100% | yes |
| Every resolution lists `files_updated` | 100% | yes |
| `discovery-coverage.md` repository row updated with reconciliation outcome | yes | yes |
| `corpus-state.yaml` code analysis fields flipped to reflect P1–P9 covered | yes | yes |

## Final gate effect

When P9 finishes successfully:

```yaml
# doc/_meta/corpus-state.yaml
corpus:
  first_code_pass_done: true
  code_analysis_status: covered
  code_analysis_pipeline_version: 1
  code_analysis_completed_at: "..."
```

```yaml
# doc/_meta/code-pipeline-state.yaml
pipeline:
  overall_status: covered
  passes:
    p1_tree_inventory: { status: covered, ... }
    p2_logical_boundaries: { status: covered, ... }
    p3_feature_candidates: { status: covered, ... }
    p4_feature_silo_deep_dive: { status: covered, ... }
    p5_cross_cutting_extraction: { status: covered, ... }
    p6_code_style_naming: { status: covered, ... }
    p7_structural_issues: { status: covered, ... }
    p8_code_maturity: { status: covered, ... }
    p9_code_reconciliation_gate: { status: covered, ... }
```

The validator (`scripts/validate-corpus.mjs`) refuses strong adoption/readiness claims if `code_analysis_status != covered`.

## Anti-patterns

Do not:

- mark a contradiction `accepted_unresolved` because resolution is tedious;
- silently update one side of a contradiction without recording in the ledger;
- close the ledger while pending contradictions exist;
- promote `code_analysis: covered` while interview-driven blocking questions remain unanswered;
- skip the ledger because P1–P8 "all said covered".

### Field-name drift in `resolution`

The `resolution` block has a closed vocabulary. Do **not** invent fields outside this list:

| Variant (don't write) | Canonical (write this) |
|---|---|
| `winner: "side_b — GitHub Actions"` (free text) | `winner_rank: 1` (int, only when `method: source_priority_rank`) + put narrative in `result:` |
| `winner: "side_a"` (string sentinel) | drop — the narrative belongs in `result:` |
| `confidence: "probable"` at `resolution.` level | drop — confidence claims live in the underlying corpus files updated by the resolution, not in the ledger |
| `reason:` for `method: source_priority_rank` or `code_re_read` | use `result:` (the narrative). `reason:` is reserved for `method: accepted_unresolved`. |

`result:` is the single narrative field. It is always populated. `winner_rank:` is the only structured indicator of which side won, and only meaningful when `method: source_priority_rank`.
