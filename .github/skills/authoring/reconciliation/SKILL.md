---
name: reconciliation
category: authoring
description: "Keep the corpus coherent when new information contradicts or supersedes old information."
---
# Reconciliation

## Purpose

Keep the corpus coherent when new information contradicts or supersedes old information.

## Non-negotiable rule

No append-only corpus.

When a fact changes, update or flag every impacted location:

- canonical file;
- feature summaries;
- `OPERATIONS.md`;
- prod bug/risk/playbook/watchlist files;
- indexes;
- spec impact notes when relevant;
- open questions.

## Process

1. Identify the new claim.
2. Identify its source and confidence.
3. Search existing corpus for related claims.
4. Classify each relation: confirms, refines, contradicts, supersedes, duplicates.
5. Update canonical files.
6. Update indexes.
7. Record unresolved conflicts in `doc/_meta/open-questions.md`.

## Output

State clearly what was changed, what remains uncertain, and where the canonical truth now lives.
