---
type: meta
status: draft
confidence: unknown
source: pack
last_validated:
title: "Kickstart Progress"
description: "Use this file as the live operator cockpit during corpus initialization."
---

# Kickstart Progress

Use this file as the live operator cockpit during corpus initialization.

It should stay short enough to read in under one minute.

## Current Status

| Field | Value |
|---|---|
| Current phase | pack copied |
| Last completed step | none |
| Current agent | Corpus |
| Last update | |
| Overall maturity | stage 0 - pack copied |

## Corpus Completeness By Sector

Use this table to power the status footer at the end of every `Corpus` kickstart response.

| Sector | Completeness | Evidence | Blockers |
|---|---|---|---|
| Project knowledge | empty | Skeleton only. | Repository not explored yet. |
| Production knowledge | partial | Historical demo evidence exists. | Refresh according to the source contract. |
| Specs/change support | started | Spec template exists. | No real spec package yet. |
| Source contracts and coverage | strong | Durable contracts and historical demo coverage exist. | Runtime capability is checked per run. |
| Indexes/navigation | started | Corpus map and index skeleton exist. | Indexes not populated from app evidence yet. |
| Roadmap/graph/runs | started | Roadmap, graph and run ledger skeletons exist. | Not expanded from app evidence yet. |
| Adoption guide | empty | Adoption guide templates exist. | Operator has not requested adoption material. |

Completeness scale: `empty`, `started`, `partial`, `usable`, `strong`, `blocked`.

Coverage source of truth: `doc/_meta/discovery-coverage.md`.

## Phase Checklist

| Phase | Status | Evidence / output |
|---|---|---|
| Pack structure verified | not started | |
| Repository role detected | not started | |
| Stack detected | not started | |
| Entry points mapped | not started | |
| App profile updated | not started | `doc/_meta/app-profile.yaml` |
| Repository map updated | not started | `doc/_meta/repository-map.yaml` |
| Source inventory updated | not started | `doc/_meta/source-inventory.md` |
| Discovery coverage contract updated | not started | `doc/_meta/discovery-coverage.md` |
| Blocking questions asked/resolved | not started | `doc/_meta/blocking-questions.md` |
| Deep analysis plan updated | not started | `doc/_meta/deep-analysis-plan.md` |
| Information sources registered | not started | `doc/_meta/information-sources.yaml` |
| MCP source wizard completed | not started | `doc/_meta/mcp-source-wizard.md` |
| Historical source coverage updated | covered | `doc/_meta/source-coverage.yaml` |
| Indexes initialized | not started | `doc/_indexes/` |
| Project activity discovery assessed | not started | `doc/project/activity/` or open question |
| Production discovery assessed | not started | `doc/prod/snapshots/` or open question |
| Continuous roadmap initialized | not started | `doc/_roadmap/` |
| Knowledge graph initialized | not started | `doc/_graph/` |
| Run ledger initialized | not started | `doc/_runs/` |
| Kickstart report produced | not started | `doc/_meta/kickstart-report.md` |
| Corpus validation run | not started | `node scripts/validate-corpus.mjs` |
| Adoption guide readiness assessed | not started | `doc/_handover/` |

## Generated Or Updated Artifacts

| Path | Status | Notes |
|---|---|---|
| `doc/_meta/app-profile.yaml` | template | Fill from evidence. |
| `doc/_meta/repository-map.yaml` | template | Fill from repository exploration. |
| `doc/_meta/source-inventory.md` | template | Fill from inspected sources. |
| `doc/_meta/discovery-coverage.md` | template | Track repo/Jira/Confluence/Dynatrace/custom source coverage. |
| `doc/_meta/blocking-questions.md` | template | Track active questions that should be asked interactively. |
| `doc/_meta/deep-analysis-plan.md` | template | Coordinate multi-disciplinary deep analysis lanes. |
| `doc/_meta/information-sources.yaml` | template | Register available sources. |
| `doc/_meta/mcp-source-wizard.md` | template | Inventory standard MCP, custom MCP and non-MCP source candidates. |
| `doc/_meta/source-coverage.yaml` | active | Historical source evidence only. |
| `doc/_meta/kickstart-report.md` | template | Produce after first useful pass. |
| `doc/_roadmap/CORPUS_ROADMAP.yaml` | skeleton | Expand during early discovery. |
| `doc/_roadmap/NEXT_BEST_ACTIONS.md` | skeleton | Keep recommended next runs current. |
| `doc/_graph/nodes.yaml` | skeleton | Add graph nodes as knowledge is discovered. |
| `doc/_runs/RUN_LEDGER.md` | skeleton | Record continuous enrichment runs. |

## Operator Inputs Needed

| Need | Why it matters | Status |
|---|---|---|
| Application name / product context | Helps label the corpus and adoption material. | unknown |
| Repository role | Confirms primary, secondary, library or unknown. | unknown |
| Work tracking source | Enables project activity discovery. | unknown |
| Production observability source | Enables production discovery. | unknown |
| MCP tools attached in IDE | Required before consuming Jira/Confluence/Dynatrace. | unknown |
| Custom MCP sources | Prevents missing internal sources during kickstart. | unknown |
| AI champion / team owner | Useful for adoption material. | unknown |

## Current Agent Plan

1. Verify pack structure.
2. Detect repository role and stack from local evidence.
3. Fill the first metadata files.
4. Run the MCP source wizard.
5. Apply the discovery coverage contract.
6. Use the deep analysis plan for serious/full kickstarts.
7. Ask blocking questions that could unlock better coverage.
8. Run point-in-time source probes before consuming connected sources; never persist global availability.
9. Initialize indexes with verified entries.
10. Initialize roadmap, graph and run ledger.
11. Record missing source access as open questions only when unresolved or deferred.

## What Is Reliable

- The pack has been copied.
- The corpus skeleton is available.

## What Is Unknown

- The target application identity.
- The repository role.
- The actual stack.
- Available project activity and production sources.
- Which Jira/Confluence/Dynatrace capabilities this runtime exposes when needed.
- Whether custom MCP servers or non-MCP evidence sources exist.
- Answers to active blocking questions in `doc/_meta/blocking-questions.md`.

## Next Checkpoint Message

The next `Corpus` response should state:

- current phase;
- completed step;
- generated or updated files;
- open questions;
- next bounded action.

It should also end with:

```text
Corpus status
- Phase:
- Overall completeness:
- Project knowledge:
- Production knowledge:
- Specs/change support:
- Source contracts / historical coverage:
- Indexes/navigation:
- Adoption guide:
- Generated/updated this step:
- Blocking inputs:
- Next action:
```
