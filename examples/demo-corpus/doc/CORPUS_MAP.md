---
type: corpus-map
status: active
confidence: confirmed
source: pack
last_validated:
title: "Corpus Map"
description: "Use indexes for navigation, not for long-form knowledge."
---

# Corpus Map

## Global directories

| Directory | Purpose |
|---|---|
| `_meta/` | Corpus state, repository map, inventory, open questions, coverage, kickstart report. |
| `_indexes/` | Cross-corpus indexes by feature, component, API, batch, risk, bug and production signal. |
| `_roadmap/` | Continuous enrichment roadmap, active node, next best actions and roadmap decisions. |
| `_graph/` | Repo-native knowledge graph nodes, edges and evidence. |
| `architecture/` | **Sanctuarized boundary contract** — the machine-readable inbound/outbound integration surface (`boundary.yaml`) and its derived views. |
| `_runs/` | Continuous run ledger and per-run records. |
| `_handover/` | Adoption guide material for the AI champion and broader team. |
| `project/` | Stable application knowledge extracted from code, repo layout, team input and architecture material. |
| `prod/` | Operational knowledge from incidents, logs, metrics, traces, support and reliability analysis. |
| `spec/` | Work packages for changes, tickets, impact analyses and implementation support. |
| `mcp/` | Usage notes for connected tools and data sources such as GitHub, Jira, Confluence, Dynatrace or ServiceNow. |

## Where to put knowledge

| Knowledge | Location |
|---|---|
| What the app does | `project/README.md` |
| Feature behavior | `project/features/<feature>/README.md` |
| Actionable work brick inventory | `_meta/brick-inventory.yaml` and `_indexes/by-brick.md` |
| Actionable readiness gate | `_meta/actionable-readiness.md` |
| Continuous corpus roadmap | `_roadmap/CORPUS_ROADMAP.md` and `_roadmap/CORPUS_ROADMAP.yaml` |
| Roadmap state and resume point | `_roadmap/ROADMAP_STATE.md` |
| Next recommended corpus runs | `_roadmap/NEXT_BEST_ACTIONS.md` |
| Knowledge graph | `_graph/nodes.yaml`, `_graph/edges.yaml`, `_graph/evidence.yaml` |
| Continuous run ledger | `_runs/RUN_LEDGER.md` |
| Feature architecture | `project/features/<feature>/ARCHITECTURE.md` (mandatory mermaid component diagram) |
| Feature workflows | `project/features/<feature>/WORKFLOWS.md` (mandatory mermaid sequence diagram) |
| Inbound/outbound integration contract (source of truth) | `architecture/boundary.yaml` (machine-readable, sanctuarized; via `governance/boundary-contract`) |
| Boundary contract human view + ecosystem topology | `architecture/BOUNDARY.md`, `architecture/ECOSYSTEM.md`, `_graph/ecosystem.yaml` (derived, regenerated) |
| Ecosystem app-identity registry | `_meta/ecosystem-map.yaml` (via `sources/ecosystem-corpus-discovery`) |
| Application-level architecture diagrams | `project/architecture/diagrams/{modules-deps,layers,arch-style,integration-context,integration-flow,messaging-topology,domain-er,persistence}.md` |
| Feature business rules | `project/features/<feature>/BUSINESS_RULES.md` |
| Feature production behavior | `project/features/<feature>/OPERATIONS.md` |
| Guidance for agents | `project/features/<feature>/AI_AGENT_GUIDE.md` |
| API deep dive | `project/apis/<api-group>/README.md` |
| Screen deep dive | `project/screens/<screen>/README.md` |
| Batch/job deep dive | `project/batchs/<batch-or-job>/README.md` |
| Integration deep dive | `project/integrations/<system-or-flow>/README.md` |
| Entity deep dive | `project/domain/<entity>.md` |
| CI/CD pipelines and delivery automation | `project/cicd/PIPELINES.md` |
| Recent repository activity and changed areas | `project/cicd/RECENT_ACTIVITY.md` |
| Known production bug | `prod/known-bugs/BUG-<id>-<slug>.md` |
| Structural risk | `prod/structural-risks/RISK-<id>-<slug>.md` |
| Incident analysis | `prod/incidents/YYYY-MM-DD-<slug>/ANALYSIS.md` |
| Initial production discovery | `prod/snapshots/YYYY-MM-DD-production-discovery.md` |
| Runtime architecture observed in production | `prod/RUNTIME_ARCHITECTURE.md` |
| Runtime service flows observed in production | `prod/SERVICE_FLOWS.md` |
| Project trajectory and roadmap signals | `project/activity/PROJECT_TRAJECTORY.md` |
| Cross-project Jira / Confluence references | `project/activity/CROSS_ATLASSIAN_REFERENCES.md` |
| Root cause method | `prod/root-cause-playbooks/PLAYBOOK-<slug>.md` |
| Monitoring focus | `prod/watchlist/WATCH-<slug>.md` |
| Change specification | `spec/<release-or-context>/<ticket-or-topic>/` |
| External tool usage | `mcp/<tool>.md` |
| Adoption / handover summary | `_handover/HANDOVER_SUMMARY.md` |
| AI champion guide | `_handover/AI_CHAMPION_GUIDE.md` |
| Team usage guide | `_handover/TEAM_USAGE_GUIDE.md` |
| Post-kickstart adoption plan | `_handover/NEXT_30_DAYS.md` |

## Canonical indexes

Use indexes for navigation, not for long-form knowledge.

```text
_indexes/by-feature.md
_indexes/by-component.md
_indexes/by-api.md
_indexes/by-batch.md
_indexes/by-screen.md
_indexes/by-business-entity.md
_indexes/by-risk.md
_indexes/by-bug.md
_indexes/by-production-signal.md
_indexes/by-source.md
_indexes/by-brick.md
```

Each index should point to canonical files rather than duplicating their content.


## Project activity

`doc/project/activity/` contains time-boxed discovery snapshots built from Jira, Git/source-control, PR and CI evidence. Use it to understand current project themes, delivery pressure, changed areas and adoption risks. It is not a people-performance dashboard.

`doc/project/cicd/` contains CI/CD pipeline status, active-vs-legacy delivery path analysis and recent repository activity. Use it to avoid confusing old automation scripts with active delivery pipelines.

## Continuous enrichment

`doc/_roadmap/`, `doc/_graph/` and `doc/_runs/` make Corpus resumable across many short sessions. The roadmap guides where to spend analysis energy; the graph links knowledge objects; the run ledger records what was actually done and capitalized.

## Generic information sources

The pack supports more than predefined tools. Register SQL log databases, APIs, file exports, dashboards, CI/CD data, manual evidence and internal tools in `doc/_meta/information-sources.yaml`. Use `/sources/information-source-onboarding` before using a new source for durable corpus claims.

## Peer corpora (local workspace and remote git)

The corpus can read **other corpora** as secondary inputs — both **sibling repos opened in the same VS Code workspace** and **remote git repositories** the operator has access to (e.g. a peer application like a billing service, a shared platform corpus, a parent business-domain corpus). Both are declared in `application.multi_repo.adjacent_repos[]` / `consumed_by[]` inside `doc/_meta/app-profile.yaml`, each carrying a `source:` block (`type: path` or `type: git`).

The kickstart asks about external git peers at every run (Q5 of `foundations/multi-repo-workspace-detection`), independently of whether the repo is standalone, multi-repo or monorepo — remote peers are a separate axis. Remote peers are cached under `.corpus-cache/<peer-name>/` (gitignored) and pulled lazily per the entry's `refresh_policy`. Downstream skills resolve peers uniformly via the resolver in that skill; they never read raw paths or URLs.

## Safe operation guardrails

Agents are read-only by default for external systems and high-risk actions. Use `/governance/safe-operation-guardrails` before destructive, broad or external side-effect operations. Prefer dry-runs, diffs, SELECT-only queries, previews and corpus update candidates.
