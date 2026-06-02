---
name: corpus-quality-check
category: governance
description: "Audit the corpus for deployability and maintainability."
---
# Corpus Quality Check

## Purpose

Audit the corpus for deployability and maintainability.

## Checks

- Run `governance/corpus-validation` first when `scripts/validate-corpus.mjs` is available.
- Canonical root files exist: `doc/README.md`, `doc/CORPUS_MAP.md`, `doc/CORPUS_MANIFEST.md`.
- Metadata lives under `doc/_meta/`.
- Indexes live under `doc/_indexes/`.
- Adoption guide material lives under `doc/_handover/`.
- No obsolete references to legacy project-scoped metadata or index locations.
- No obsolete feature-file layout from earlier corpus experiments.
- Feature folders use the six-file standard when applicable.
- Prod knowledge is atomic.
- Links resolve inside the copied pack when they target corpus files.
- Frontmatter is present on important files.
- Open questions are explicit.
- Contradictions are reconciled or listed.
- Adoption guide status in `doc/_meta/corpus-state.yaml` is consistent with `doc/_handover/` content.

## Output

Produce a quality report with P0/P1/P2 findings and concrete fixes. Include deterministic validator output when available, then add human judgment for stale assumptions, weak claims, duplication and missing domain knowledge that a script cannot reliably detect.


## Project activity checks

If `corpus.project_activity_discovery_status` is `done` or `partial`, verify that `doc/project/activity/YYYY-MM-DD-project-activity-discovery.md` exists, source windows are recorded, limitations are stated, and contributor information is not used for individual performance scoring.
