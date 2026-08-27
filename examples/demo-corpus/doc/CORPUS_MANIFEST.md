---
type: corpus-manifest
status: active
confidence: confirmed
source: pack
last_validated:
title: "Corpus Manifest"
description: "This corpus turns an existing application repository into a knowledge base that can be used by agents and humans."
---

# Corpus Manifest

## Purpose

This corpus turns an existing application repository into a knowledge base that can be used by agents and humans.

It is not a generic documentation dump. It is a governed operating memory for the application team.

## Ownership

The `Corpus` agent owns corpus structure and consistency.

Other agents may create proposals, but durable changes to the corpus must be reconciled through `Corpus`.

The AI champion owns day-to-day team adoption when the operator decides the corpus is ready to show.

## Content principles

1. **Code is the source of truth.** Confluence and other written documentation are reconciled against code. Full source priority ranking lives in `foundations/core-rules`.
2. Verified facts over plausible prose.
3. Small atomic files over giant catalogues.
4. Cross-links over duplication.
5. Explicit uncertainty over fake certainty.
6. Reconciliation over append-only accumulation.
7. Production knowledge is first-class.
8. Stack-neutral language unless a technology is verified in the repository.
9. Adoption guide material is part of the corpus lifecycle, not an external slide deck.
10. Continuous enrichment is the default operating model; roadmap, graph and run ledger remain open.
10. Architecture diagrams are mandatory and generated from code (mermaid, inline). Confluence diagrams are referenced, not imported.

## Corpus-first development lifecycle

Development work must use the corpus as both input and output:

```text
read relevant corpus -> create/validate spec -> implement -> test -> update/reconcile corpus
```

This means:

- no significant implementation starts from a raw ticket alone;
- a `doc/spec/...` package must exist before code changes;
- implementation findings must update the spec package and affected project/prod corpus files;
- contradictions must be reconciled, not appended around;
- unresolved uncertainty belongs in `_meta/open-questions.md` or `_meta/update-candidates.md`.

## Metadata

Important corpus files should start with frontmatter:

```yaml
---
type: feature | architecture | workflow | business-rules | operations | agent-guide | incident | bug | risk | playbook | spec | mcp-reference | index | meta | handover-summary | handover-guide | adoption-plan | diagram | interview | production-snapshot | production-discovery | integrations-area | screens-area | corpus-roadmap | corpus-graph-index | corpus-run
status: draft | active | validated | deprecated | superseded | candidate | documented | merged | rejected
confidence: unknown | suspected | probable | confirmed
source: code | prod | jira | confluence | human | mixed | pack | unknown | human-agent-session
last_validated:
related_features: []
related_components: []
related_risks: []
related_bugs: []
---
```

**Confidence rule:** `confidence: confirmed` requires evidence from a rank 1–3 source (code, runtime config, production observability) per the source priority ranking in `foundations/core-rules`. Confluence-only or Jira-only claims must use `confidence: probable` at most. An operator interview answer corroborated by code may use `confirmed`; an operator interview answer alone uses `probable`.

## Feature folder standard

```text
project/features/<feature>/
  README.md
  ARCHITECTURE.md
  WORKFLOWS.md
  BUSINESS_RULES.md
  OPERATIONS.md
  AI_AGENT_GUIDE.md
```

A feature folder may omit a file only when there is genuinely nothing useful to say. If omitted, record the gap in `_meta/coverage-matrix.md`.

## Production knowledge standard

Production knowledge must be atomic:

```text
prod/known-bugs/BUG-<id>-<slug>.md
prod/structural-risks/RISK-<id>-<slug>.md
prod/root-cause-playbooks/PLAYBOOK-<slug>.md
prod/watchlist/WATCH-<slug>.md
prod/snapshots/YYYY-MM-DD-production-discovery.md
```

Indexes summarize. Atomic files carry the reasoning.

## Adoption guide standard

Operator-led kickstarts must prepare:

```text
_handover/HANDOVER_SUMMARY.md
_handover/AI_CHAMPION_GUIDE.md
_handover/TEAM_USAGE_GUIDE.md
_handover/NEXT_30_DAYS.md
_handover/OPEN_DECISIONS.md
_handover/KICKSTART_CLOSEOUT_CHECKLIST.md
```

Adoption guide material must clearly separate reliable knowledge, hypotheses, gaps, roadmap state and next actions.



## Initial production discovery

When a production source such as Dynatrace/APM is available during kickstart, `Corpus` should create a time-bounded production discovery snapshot. This is not an incident report. It is an evidence-backed runtime state review / rapport d'étonnement covering observed topology, key signals, surprising findings, unknowns and candidate durable knowledge.

If no production source is available, the corpus must say so explicitly instead of inventing production state.

## Adoption maturity model

| Stage | Label | Meaning |
|---|---|---|
| 0 | `pack_copied` | Pack copied, not initialized. |
| 1 | `operator_kickstart_started` | Operator is running the initial exploration. The deep code analysis pipeline (P1 → P9) is in progress. |
| 2 | `structural_baseline_generated` | P1 → P9 structural baseline exists. Not sufficient for adoption. |
| 3 | `source_discovery_baseline_generated` | Jira/Confluence/Dynatrace/source discovery covered or honestly blocked. |
| 4 | `actionable_corpus_ready` | Critical/high work bricks are actionable for developer, functional-analyst and reliability-analyst workflows. Required before strong adoption material. |
| 5 | `team_owned_maintenance` | Team maintains the corpus autonomously after adoption. |

Adoption guide confidence requires `corpus.actionable_readiness_status: covered`, not only `corpus.code_analysis_status: covered`, and must mention roadmap gaps.

## Code analysis maturity (corpus.maturity_level)

| Level | Requires | Meaning |
|---|---|---|
| 0 | — | Pack copied, no analysis yet. |
| 1 | P1–P3 covered | Repository inventoried, modules mapped, feature candidates identified. |
| 2 | P1–P9 covered | Full structural code baseline. The corpus is mapped, but not necessarily actionable. |
| 3 | Level 2 + production/source discovery covered or explicitly blocked | Discovery baseline added. Still not adoption-ready by itself. |
| 4 | Level 3 + actionable readiness covered | Critical/high bricks are detailed enough for normal agent work. Adoption guide can be useful if the operator asks. |

## Reconciliation rule

When a fact changes, update all affected summaries, indexes and related files.

If a contradiction cannot be resolved, mark it explicitly and add an entry to `_meta/open-questions.md`.


## Project activity governance

Project activity discovery may use Jira, Git, PR and CI data to understand the trajectory of the application and the adoption context. Do not use contributor activity to rank individual performance. Use contributor signals only to identify ownership, review paths, bus factor and knowledge transfer needs.

CI/CD discovery must separate live delivery paths from historical residue. Old Jenkins scripts, archived workflow files or unused pipeline definitions are useful evidence, but they must not be treated as active deployment truth unless recent commits, PR/check evidence, branch protection, release records or operator confirmation support that claim.

## Generic information sources

The pack supports more than predefined tools. Durable contracts live in `doc/_meta/information-sources.yaml`, historical evidence in `doc/_meta/source-coverage.yaml`, and runtime capability is observed per run.

## Safe operation guardrails

Agents are read-only by default for external systems and high-risk actions. Use `/governance/safe-operation-guardrails` before destructive, broad or external side-effect operations. Prefer dry-runs, diffs, SELECT-only queries, previews and corpus update candidates.
