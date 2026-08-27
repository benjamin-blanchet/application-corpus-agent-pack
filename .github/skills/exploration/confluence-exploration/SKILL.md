---
name: confluence-exploration
category: exploration
description: "Read knowledge-base pages when available. Extract durable knowledge, mark stale or conflicting content, and **reconcile against code and production evidence**, which always outrank Confluence."
---
# Confluence Exploration

## Purpose

Read knowledge-base pages when available. Extract durable knowledge, mark stale or conflicting content, and **reconcile against code and production evidence**, which always outrank Confluence.

Confluence is documentation. Documentation drifts. The corpus must capture Confluence carefully — useful for history, intent, glossary, finding stakeholders, understanding trajectory and finding adjacent systems — but **never as ground truth for current behavior** until reconciled.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Scoped source-authority reminder

From `foundations/core-rules`:

```
1. Repository code
2. Migrations + runtime config
3. Production observability
4. Tests
5. Operator interview
6. Jira / PRs / commits
7. Confluence and other written documentation
8. Tribal knowledge
```

When code and Confluence differ, classify the claim first. Code at a named
revision anchors `implementation`; Confluence may provide `intent` or
`history`. Neither proves `runtime` without deployed-revision, configuration
and observation evidence. Preserve both scoped claims when both are valid.

## Required behavior

1. Run only after `governance/discovery-coverage-contract` Confluence section is initialized.
2. Run only after the code analysis pipeline (P1 → at least P3) is `covered`. Confluence search terms come from real feature/component slugs, not from a blank prior.
3. Read `doc/CORPUS_MAP.md` and `doc/CORPUS_MANIFEST.md` before writing.
4. Walk the relevant page tree (do not stop at search snippets). Use page IDs, not titles, for stable references.
5. For every page, capture: page ID, title, space, last-modified date, last-modified author, and a concise summary. **The age of the page is essential metadata** — old pages decay faster.
6. For every behavioral claim a page makes, attempt reconciliation with code/migrations/config. Record the result.
7. Distinguish:
   - **Intent claims** (why something exists, original requirements, history) → can stand on Confluence at `confidence: probable`.
   - **Behavior claims** (how the system runs today, contract details, error handling, performance limits) → require reconciliation with code; until reconciled, mark `confidence: unverified` and do not surface in indexes as canonical.
   - **Operational claims** (production topology, runbooks, deployment procedures) → reconcile with prod source (Dynatrace/runbooks) and current CI/CD config.
8. When a behavior claim contradicts code, **do not silently overwrite either side**:
   - Update the corpus with the code-backed version (the canonical truth).
   - Add a "Confluence-stated, does not match code" sub-section in the affected feature/architecture file with: the page ID, page title, last-modified date, the divergent claim, and the date of reconciliation.
   - Open a P9 reconciliation entry and an interview question via `pipeline/per-brick-interview` if the gap looks like a real defect (the team may want to fix the page or the code).
9. Record unresolved questions in `doc/_meta/open-questions.md`.
10. Update indexes only with verified entries — never from Confluence-only claims.
11. For serious kickstart or trajectory discovery, use `exploration/atlassian-project-trajectory` to search accessible spaces outside the declared app space for app aliases, repo names, service codes, APIs, batches, integrations, incidents, runbooks, roadmap and migration pages.

## Confluence trust scoring

For each page consumed, attach a trust score:

| Score | Criteria |
|---|---|
| `high` | Last-modified ≤ 6 months AND author still active AND key claims reconciled with code/prod. |
| `medium` | Last-modified ≤ 18 months AND at least one key claim reconciled with code. |
| `low` | Last-modified > 18 months OR major claims unreconciled OR known stale references. |
| `archival` | Explicitly historical page, kept for context only. |

A `low` or `archival` page must not feed `confidence: confirmed` claims anywhere in the corpus.

## Frontmatter rule for Confluence-sourced files

When a corpus file is built primarily from Confluence:

```yaml
source: confluence
confidence: probable          # never `confirmed` until reconciled with code/prod
confluence_pages:
  - id: "12345678"
    title: "Batchs d'intégration"
    space: "SOUSCR"
    last_modified: "2025-07-03"
    trust: "medium"
reconciled_with_code: false   # flip to true only after code-side reading confirms
```

## Coverage contract integration

This skill satisfies the Confluence row of `governance/discovery-coverage-contract`. The Confluence row in `doc/_meta/discovery-coverage.md` must record:

- spaces walked (with key);
- pages read (count);
- pages skipped (count + reason);
- behavior claims found (count);
- behavior claims reconciled with code (count);
- divergences recorded (count, with the file paths where they live).

A Confluence row marked `covered` without these numbers is non-compliant.

## Stack-neutral detection hints

Look for application/feature names from `doc/_meta/feature-candidates.yaml` (P3 output), module names from `doc/_meta/logical-boundaries.yaml` (P2), and entity names from `doc/project/domain/ENTITIES.md` (P5). Search Confluence by these terms — not by guesses.

Also look for adjacent application names from integration catalogs and production discovery. A page owned by another team can be highly relevant when it describes a dependency on this product.

## Output discipline

Prefer small canonical files and indexes over large monolithic documents.

## Anti-patterns

Do not:

- treat a Confluence page as truth without code-side check;
- copy Confluence prose into a feature folder verbatim;
- mark Confluence-sourced claims as `confidence: confirmed`;
- silently update either the code-side description or the Confluence-side description without recording the divergence;
- skip page age / author metadata (it is the cheapest staleness indicator);
- run Confluence search before P3 has produced real feature/component names.
- assume one declared Confluence space contains the whole project context when global/cross-space search is available.
