---
name: roadmap-graph
category: continuous
description: "Maintain the persistent roadmap and repo-native knowledge graph used by continuous corpus enrichment."
---
# Corpus Roadmap Graph

## Purpose

Maintain the persistent roadmap and repo-native knowledge graph used by continuous corpus enrichment.

The corpus is not a one-shot deliverable. Initial discovery should create the most useful roadmap possible, then every later run should deepen or expand roadmap nodes based on code, production, Atlassian, custom sources and operator input.

## When to use

Use this skill:

- during initial corpus discovery, after source contracts are registered and historical coverage is initialized;
- whenever a run discovers a new feature, API, batch, integration, runtime service, signal, risk, question or trajectory theme;
- when the operator asks to deepen, brainstorm or continue a subject;
- at the end of every continuous run to update roadmap and graph state;
- when context was compacted and the agent needs to resume from persisted state.

## Mandatory reads

1. `doc/_roadmap/README.md`
2. `doc/_roadmap/CORPUS_ROADMAP.md`
3. `doc/_roadmap/CORPUS_ROADMAP.yaml`
4. `doc/_roadmap/ROADMAP_STATE.md`
5. `doc/_roadmap/NEXT_BEST_ACTIONS.md`
6. `doc/_graph/nodes.yaml`
7. `doc/_graph/edges.yaml`
8. `doc/_graph/evidence.yaml`
9. `doc/_runs/RUN_LEDGER.md`
10. `doc/_meta/brick-inventory.yaml`
11. `doc/_meta/discovery-coverage.md`

## Roadmap node model

Every significant node should have:

```yaml
id:
title:
type:
parent:
status: discovered # discovered | planned | in_progress | partial | deepened | parked
criticality: medium # low | medium | high | critical
depth_level: 0
interest_to_continue: 0 # 0-10
interest_justification:
analysis_energy:
  sessions_count: 0
  estimated_minutes: 0
  last_run:
coverage:
  code: not_started
  prod: not_started
  jira: not_started
  confluence: not_started
  user_input: not_started
linked_corpus_files: []
next_questions: []
next_actions: []
children: []
```

`interest_to_continue` is not the same as completion. It answers: "is it valuable to spend more analysis energy here?" A topic can be incomplete but low interest, or already well known but still worth deeper analysis because it carries traffic, risk or delivery value.

## Node creation rules

- Create child nodes automatically when the value is obvious.
- Mention newly created nodes in the chat/run summary.
- If node creation is debatable, ask the operator before expanding.
- Do not create unlimited children. In normal runs, prefer up to 10-20 new nodes unless the run is an initial cartography pass.
- Use stable ids such as:
  - `feature:<slug>`
  - `api:<slug>`
  - `batch:<slug>`
  - `integration:<slug>`
  - `runtime:<slug>`
  - `prod-signal:<slug>`
  - `jira-theme:<slug>`
  - `confluence:<space>:<page-id>`
  - `risk:<slug>`
  - `question:<slug>`
  - `roadmap:<slug>`

## Graph edge vocabulary

Use realistic relationships only. Common types:

| Type | Meaning |
|---|---|
| `implements` | Code implements a feature or mechanism. |
| `exposes` | Service exposes API/endpoint/screen. |
| `calls` | Component calls another component/system. |
| `depends_on` | Runtime or delivery dependency. |
| `observed_in_prod` | Production evidence observes the node. |
| `mentioned_by` | Jira/Confluence/source mentions the node. |
| `documented_by` | Corpus or Confluence doc describes the node. |
| `impacts` | Change/risk/signal impacts the node. |
| `evidenced_by` | Evidence supports node or edge. |
| `needs_deepening` | Roadmap says further analysis is useful. |
| `contradicts` | Two sources disagree. |

## Required updates

After a meaningful discovery or run:

1. Update `doc/_roadmap/CORPUS_ROADMAP.yaml` with node state.
2. Update `doc/_roadmap/CORPUS_ROADMAP.md` with human-readable tree or active branches.
3. Update `doc/_graph/nodes.yaml` for new or changed nodes.
4. Update `doc/_graph/edges.yaml` for new relationships.
5. Update `doc/_graph/evidence.yaml` for source evidence.
6. Update `doc/_roadmap/ROADMAP_STATE.md` with active node and resume hint.

## Cross-repo edges (multi-repo workspaces)

When `application.multi_repo.status == declared` (see `foundations/multi-repo-workspace-detection`), edges that cross a repository boundary follow a stricter convention so they can be resolved across sibling corpora.

Use the shape:

```yaml
- from: feature:checkout
  to: lib:api:payment-client
  type: depends_on
  cross_repo: lib                              # name from application.multi_repo.adjacent_repos[].name
  evidence: ../lib/doc/_indexes/by-api.md#payment-client   # path through corpus_path when has_pack: true
  evidence_kind: sibling_corpus                # sibling_corpus | sibling_code | operator_stated
```

Rules:

- The `to:` id is prefixed by the sibling name (`lib:`, `deploy:`) — never bare. This makes orphan detection possible.
- `cross_repo:` must match a `name` in `application.multi_repo.adjacent_repos` or `consumed_by`. An edge whose `cross_repo:` is not declared is an audit failure.
- `evidence:` resolves relative to the current repo root. When `has_pack: true` for the sibling, prefer a `corpus_path`-routed evidence; when `has_pack: false`, use a `relative_path`-routed source-code evidence and set `evidence_kind: sibling_code`.
- Never create a cross-repo edge before `multi_repo_status == declared`. Edges would be unverifiable.
- The reverse edge in the sibling's own graph is the sibling's responsibility. Do not write into a sibling's `doc/_graph/`.

## Resume behavior

When the operator says `continue`, resume the active node from `ROADMAP_STATE.md` and `RUN_LEDGER.md`.

If context is missing or ambiguous, ask which active node to continue. Do not invent continuity from the latest chat message alone.

## Anti-patterns

- Treat the roadmap as a static checklist.
- Mark a node complete only because one file exists.
- Create a large tree with no interest scores or next actions.
- Hide newly created child nodes from the operator.
- Rush to adoption/handover material before the roadmap shows enough high-value coverage.
