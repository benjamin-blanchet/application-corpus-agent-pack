---
type: corpus-roadmap
status: draft
confidence: unknown
source: pack
last_validated:
title: "Corpus Roadmap"
description: "This roadmap is split in two parts to avoid desynchronization between cheap per-run updates and expensive structural refreshes:"
---

# Corpus Roadmap

This roadmap is split in two parts to avoid desynchronization between cheap per-run updates and expensive structural refreshes:

1. **Active zones** — updated **every run**, low cost. Tracks which zones are live, their status, brick count, interest and next action.
2. **Recently Expanded Nodes** — updated **every run** that creates child nodes. One line per run.
3. **Full tree** — updated **only after a major milestone** (full kickstart, P1→P9 covered, broad subagent sweep, or operator-requested full refresh). Read-only between major passes; do not edit it on a normal `continue` run.

The two-mode contract is defined in `continuous/corpus-run`. See `doc/_roadmap/README.md` for the per-file frequency/cost matrix.

## Active Zones (updated every run)

One row per active zone. A "zone" is a top-level branch of the tree (Repository code, Production and reliability, Jira/Confluence trajectory, Actionable work bricks, Adoption guide, or any explicitly created top-level theme).

| Zone | Status | Bricks | Interest | Last touched | Next action |
|---|---|---:|---:|---|---|
| Repository code | not_started | 0 | 0 | | Run P1 inventory. |
| Production and reliability | not_started | 0 | 0 | | Run `exploration/production-discovery`. |
| Jira and Confluence trajectory | not_started | 0 | 0 | | Run `exploration/jira-exploration` / `exploration/confluence-exploration`. |
| Actionable work bricks | not_started | 0 | 0 | | Run `actionable/brick-inventory`. |
| Adoption guide | not_started | 0 | 0 | | Blocked until actionable readiness covered. |

Status values: `not_started`, `discovered`, `planned`, `in_progress`, `partial`, `deepened`, `parked`.
Interest values: 0–10, same scale as `interest_to_continue` in `CORPUS_ROADMAP.yaml`.

Update on every run: the row for the zone(s) the run actually touched. Do not rebuild this table from scratch on a normal run.

## Recently Expanded Nodes (append one line per run that creates children)

| Date | Run id | Parent | Created children | Reason |
|---|---|---|---|---|
| | | | | |

Append-only. Never rewrite past rows. If a run created no children, do not add a row.

## Full Tree (read-only between major passes)

> Refreshed only during a major pass: full kickstart completion, P1→P9 covered, broad subagent coverage sweep, or operator-requested full refresh. Between major passes this section may lag the live state — the Active Zones table and `CORPUS_ROADMAP.yaml` are authoritative.

```text
Corpus knowledge
├── Repository code
│   ├── Architecture and modules
│   ├── Features and workflows
│   ├── APIs and endpoints
│   ├── Batches, jobs and consumers
│   ├── Integrations and external systems
│   ├── Persistence and data model
│   └── Code quality, risks and conventions
├── Production and reliability
│   ├── Runtime architecture
│   ├── Top used features and endpoints
│   ├── Errors and incidents
│   ├── Latency and performance
│   ├── Memory, saturation and resources
│   ├── Batch and async health
│   ├── Dependencies and service flows
│   └── Watchlists, bugs and playbooks
├── Jira and Confluence trajectory
│   ├── Current project activity
│   ├── Cross-project Jira references
│   ├── Cross-space Confluence references
│   ├── Roadmap, migration and release signals
│   ├── Historical mining
│   └── Documentation/code/prod reconciliation
├── Actionable work bricks
│   ├── Critical bricks
│   ├── High-value features
│   ├── High-risk batches
│   ├── High-traffic integrations
│   └── Reliability scenarios
└── Adoption guide
    ├── Team usage guide
    ├── AI champion guide
    ├── Newcomer orientation
    └── Open decisions
```

Tree last refreshed: `<date of last major pass>`.
