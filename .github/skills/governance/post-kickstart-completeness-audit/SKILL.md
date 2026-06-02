---
name: post-kickstart-completeness-audit
category: governance
lifecycle: init-only
description: "Audit whether the corpus has enough initialized navigation, graph, metadata and source-state artifacts to honestly say that kickstart reached a natural pause."
---
# Post-Kickstart Completeness Audit

## Purpose

Audit whether the corpus has enough initialized navigation, graph, metadata and source-state artifacts to honestly say that kickstart reached a natural pause.

This skill exists because a corpus can contain useful deep files while still being hard for agents to use: empty indexes, skeleton graph, stale coverage matrix, unknown repository map, thin source inventory or unrouted production findings.

## When to use

Use this skill:

- before saying "kickstart complete", "arrive au bout", "ready", `adoption_ready` or equivalent;
- after P1 -> P9 is covered;
- after source discovery lanes such as Dynatrace, Jira, Confluence or custom sources;
- before `actionable/readiness-gate`;
- when the operator asks for corpus state, completeness, empty files or untouched files;
- after any run that creates features, APIs, batches, entities, integrations, risks, bugs, production signals or project activity themes.

When `runSubagent` or `agent` is available, invoke `corpus-control-plane-subagent` as the first read-only audit pass for this skill. The main `Corpus` agent integrates its report and performs all writes.

## Mandatory reads

1. `doc/_meta/corpus-state.yaml`
2. `doc/_meta/code-pipeline-state.yaml`
3. `doc/_meta/brick-inventory.yaml`
4. `doc/_meta/actionable-readiness.md`
5. `doc/_meta/coverage-matrix.md`
6. `doc/_meta/discovery-coverage.md`
7. `doc/_meta/repository-map.yaml`
8. `doc/_meta/source-inventory.md`
9. `doc/_indexes/`
10. `doc/_roadmap/CORPUS_ROADMAP.yaml`
11. `doc/_roadmap/ROADMAP_STATE.md`
12. `doc/_graph/nodes.yaml`
13. `doc/_graph/edges.yaml`
14. `doc/_graph/evidence.yaml`
15. `doc/_runs/RUN_LEDGER.md`

## Audit gates

The agent must not claim `adoption_ready`, `maturity_level: 4`, or "kickstart complete enough for team use" while any of these gates are open:

| Gate | Requirement |
|---|---|
| Indexes | Cross-corpus indexes reflect generated catalogs and files. Empty index skeletons are allowed only when the corresponding area is genuinely absent or explicitly out of scope. |
| Graph | `nodes.yaml`, `edges.yaml` and `evidence.yaml` contain real project nodes, relationships and evidence, not only `roadmap:root`. |
| Roadmap | `CORPUS_ROADMAP.yaml` contains actionable child nodes with `interest_to_continue` scores and next actions. |
| Repository map | Repository name, role, description and related repositories are filled or explicitly unknown with an open question. |
| Coverage matrix | No row remains `empty` after the corresponding evidence exists. |
| Discovery coverage | Repository, Jira, Confluence, Dynatrace and custom source rows are `covered`, `partial`, `blocked` or `not_applicable` with reasons; not stale `not_started`. |
| Source inventory | Sources actually consumed are listed with location/query/window/tool and confidence. |
| Production routing | Dynatrace/log findings are routed to baselines, component map, service flows, watchlist, bugs, risks or playbooks where applicable. |
| Local prod indexes | `known-bugs`, `structural-risks`, `watchlist` and `root-cause-playbooks` local indexes reference real files. |
| Run ledger | The last run records sources consumed, durable updates, roadmap changes and recommended next action. |

## Required behavior

1. Scan `doc/_indexes/*.md` and identify indexes with only headers.
2. For every empty index, decide:
   - fill now from existing canonical files/catalogs;
   - mark the area explicitly `not_applicable`;
   - or add a follow-up item with the missing evidence.
3. Populate the graph from existing brick inventory, feature folders, APIs, batches, integrations, entities, risks, bugs, production signals and source evidence.
4. Update `doc/_meta/coverage-matrix.md`, `doc/_meta/repository-map.yaml`, `doc/_meta/source-inventory.md` and `doc/_meta/discovery-coverage.md` after the facts are known.
5. Update `doc/_roadmap/NEXT_BEST_ACTIONS.md` with the highest-value unfinished completeness items.
6. Run `node scripts/validate-corpus.mjs`.
7. If validation reports P0, do not claim readiness. Fix or report the blocking items.
8. Record subagent availability, invocations and skipped scopes in `doc/_runs/RUN_LEDGER.md`.

## Output

Update:

```text
doc/_meta/actionable-readiness.md
doc/_meta/coverage-matrix.md
doc/_meta/repository-map.yaml
doc/_meta/source-inventory.md
doc/_meta/discovery-coverage.md
doc/_meta/update-candidates.md
doc/_indexes/*.md
doc/_graph/nodes.yaml
doc/_graph/edges.yaml
doc/_graph/evidence.yaml
doc/_roadmap/NEXT_BEST_ACTIONS.md
doc/_runs/RUN_LEDGER.md
```

## Chat output

End with:

```text
Post-kickstart completeness
- Empty indexes:
- Graph state:
- Metadata state:
- Production routing:
- Validation:
- Readiness label:
- Next action:
```

Use a conservative readiness label:

| Label | Meaning |
|---|---|
| `baseline_useful_but_not_actionable` | Knowledge exists, but agents still need too much rediscovery. |
| `navigation_incomplete` | Important knowledge exists but indexes/graph/meta do not expose it reliably. |
| `partially_actionable` | Some priority scopes can be used by agents, with explicit limits. |
| `actionable_for_priority_scope` | Priority scope is ready for real work. |
| `adoption_ready` | Broad team adoption material can be prepared when the operator asks. |

## Anti-patterns

- Say the kickstart is finished because P1 -> P9 is covered.
- Treat empty index files as harmless hygiene when generated knowledge exists.
- Leave the graph skeleton after creating brick inventory or feature folders.
- Set `maturity_level: 4` while graph, indexes or metadata are still skeletons.
- Generate adoption guide material to hide incomplete navigation.
