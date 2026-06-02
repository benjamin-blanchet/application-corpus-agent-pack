---
name: knowledge-capture
category: authoring
description: "At the end of any meaningful task, decide whether new durable knowledge should enter the corpus."
---
# Knowledge Capture

## Purpose

At the end of any meaningful task, decide whether new durable knowledge should enter the corpus.

## Durable knowledge examples

- A verified business rule.
- A known failure mode.
- A structural risk.
- A recurring production signal.
- A repository convention.
- A source/tool query that worked.
- A feature boundary or workflow.
- A decision that affects future changes.
- An adoption-relevant lesson for the AI champion or team.

## Non-durable examples

- One-off conversation phrasing.
- Temporary work-in-progress notes.
- Unverified speculation without value.
- Duplicate summaries already captured canonically.

## Process

1. Identify candidate knowledge.
2. Choose canonical target using `doc/CORPUS_MAP.md`.
3. Apply `governance/corpus-update`.
4. Reconcile related files.
5. Update indexes.
6. Update handover material if the knowledge changes the team adoption story.
7. State if no durable knowledge was found.
