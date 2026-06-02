---
name: corpus-run
category: continuous
description: "Run Corpus as a continuous enrichment agent: select or resume a roadmap node, gather read-only evidence through tools/MCP, ask high-value operator questions, consolidate durable knowledge and update roadmap, graph and run ledger."
---
# Continuous Corpus Run

## Purpose

Run Corpus as a continuous enrichment agent: select or resume a roadmap node, gather read-only evidence through tools/MCP, ask high-value operator questions, consolidate durable knowledge and update roadmap, graph and run ledger.

This is the default mode after the initial pack is copied. The agent should not optimize for "finish the corpus"; it should optimize for increasing durable project understanding over many short-to-medium sessions.

## When to use

Use this skill when the operator says:

- `continue`
- `analyse la prod`
- `regarde la memoire sur la semaine`
- `top features utilisees`
- `creuse cette feature`
- `brainstormons sur ce point`
- `reste haut niveau`
- `descends dans le detail`
- any request to improve, deepen, compare or capitalize corpus knowledge.

## Mandatory reads

1. `doc/_roadmap/ROADMAP_STATE.md`
2. `doc/_roadmap/CORPUS_ROADMAP.yaml`
3. `doc/_roadmap/NEXT_BEST_ACTIONS.md`
4. `doc/_runs/RUN_LEDGER.md`
5. `doc/_meta/corpus-state.yaml`
6. `doc/_meta/discovery-coverage.md`
7. `doc/_meta/blocking-questions.md`
8. Relevant corpus files for the selected node.

## Standard run loop

0. **State recompute (always run before any read)**
   - Run `node scripts/recompute-corpus-state.mjs --apply --json` from the repo root.
   - The script is deterministic, idempotent, and only touches the allowlist of derived fields (every `*_status`, `last_*`, `indexes_initialized`, `first_*_pass_done`, per-pass `p1…p9_*_status`, `corpus_inventory.bugs` / `risks`). Operator-set fields (`pack_version`, `kickstart_operator`, `ai_champion`, `maturity_level`, `adoption.maturity_stage`, custom fields) are preserved verbatim.
   - If `changed: true`, surface the corrected fields in the opening resume report (`before -> after`, one line per field). Do not silently apply.
   - This step exists because `corpus-state.yaml` is a direction-carrying file — reading a stale version locks the agent on a stale direction. See `corpus.agent.md` § Mandatory state load and the usage-log entry on direction-carrying files.

1. **Intent detection**
   - Identify whether the operator wants to resume, deepen, brainstorm, stay high-level, analyze prod, analyze code, analyze Jira/Confluence or inspect roadmap state.

2. **Roadmap node selection**
   - If `continue`, resume the active node.
   - If context is unclear, ask which active node to continue.
   - If the request is new, create or select the best matching node.

3. **Existing knowledge review**
   - Read the corpus files already linked to the node.
   - State what is already known before querying tools.

4. **Source readiness**
   - Use `sources/mcp-readiness-check` before Jira, Confluence, Dynatrace or custom MCP.
   - Read-only external access is allowed by default when tools are available.
   - Mutating external systems requires explicit operator request.

5. **Evidence gathering**
   - Use bounded queries and searches.
   - For VS Code/Copilot context health, prefer short-to-medium runs.
   - As a default, after roughly 5-8 substantial external/tool actions or one coherent evidence batch, summarize and decide whether to continue.

6. **High-value interaction**
   - If a surprising or high-leverage signal appears, ask the operator a targeted question.
   - If the question would block safe interpretation, pause for the answer.
   - If the question is useful but not blocking, record it and continue.

7. **Consolidation**
   - Update canonical corpus files, not only run notes.
   - Summarize logs/prod data by default; include anonymized examples only when useful and safe.

8. **Roadmap and graph update**
   - Use `continuous/roadmap-graph`.
   - Create obvious child nodes and declare them in the chat summary.

9. **Run audit**
   - Use `continuous/corpus-run-audit`.
   - A run may produce little durable knowledge, but it must say so honestly.
   - When the run wrote under `doc/`, the audit runs the deterministic drift check (`node scripts/validate-corpus.mjs --json`) and captures P0/P1/P2 counts plus new findings — see `continuous/corpus-run-audit`. `P0 > 0` forces `needs_followup` and a drift line in the recap.
   - When the run wrote under `doc/`, the audit also rebuilds the dashboard (`node scripts/build-corpus-site.mjs`) so `doc/_site/corpus.html` stays synchronized with corpus state — see `continuous/corpus-run-audit` § Deterministic dashboard rebuild. The operator must never have to rebuild manually.

10. **Next best action**
   - Use `continuous/next-best-corpus-actions`.

## Two run modes

A run is either a **per-run light update** (the default) or a **major pass** (occasional, explicit). They update different files; mixing them is the source of roadmap desynchronization.

### Per-run light update (default — every `continue`, every short/medium run)

Cheap, mandatory, applied at the end of every run. Keeps the lightweight state in sync with what just happened. Never rebuild the full node graph or the full ASCII tree here.

Update on every run:

- `doc/_meta/corpus-state.yaml` — **mandatory on every run**. Touch `corpus.last_continuous_run` with the run timestamp. Flip every `*_status` field the run actually advanced (e.g. `indexes_initialized: true` when an index was created, `code_analysis_status: in_progress` / `covered` when the pipeline moved, `brick_inventory_status: in_progress` / `covered` when the inventory was started or completed, `discovery_coverage_status` / `repository_coverage_status` / `jira_coverage_status` / `confluence_coverage_status` / `dynatrace_coverage_status` when a source pass advanced, `roadmap_status` / `graph_status` when the skeleton became `in_progress` / `covered`). Stamp every `last_*` field the run touched (e.g. `last_prod_discovery`, `last_project_activity_discovery`, `last_cicd_activity_discovery`, `last_source_registry_review`, `last_adjacent_sync_check`, `last_external_peer_pull`, `last_multi_repo_interview`). Append to `corpus_inventory.bugs` / `risks` / `features` / `apis` / `batches` / `production_signals` / etc. when a new artefact was captured under `doc/prod/` or `doc/<scope>/`. Update `open_questions_count` / `active_blocking_questions_count` when those files changed.
- `doc/_roadmap/ROADMAP_STATE.md` — active node, last run, resume hint, coverage snapshot row touched by the run.
- `doc/_roadmap/NEXT_BEST_ACTIONS.md` — top recommendations re-ranked.
- `doc/_roadmap/CORPUS_ROADMAP.yaml` **header only** — `active_node_id`, `last_completed_node_id`, `node_count` if changed, `last_run` timestamp. Touch the impacted node's `status`, `interest_to_continue`, `analysis_energy.last_run` and `coverage.*` when relevant. Do not rebuild the `nodes:` list.
- `doc/_roadmap/CORPUS_ROADMAP.md` — update the **Active zones table** row(s) for the zone touched by this run; append one line to **Recently Expanded Nodes** if child nodes were declared. Do not edit the ASCII tree.
- `doc/_runs/RUN_LEDGER.md` and `doc/_runs/YYYY-MM-DD-<run-id>.md`.
- `doc/_graph/nodes.yaml`, `doc/_graph/edges.yaml`, `doc/_graph/evidence.yaml` — append/patch only the entries the run actually touched.

**`corpus-state.yaml` n'est jamais "read-only".** Même un run purement
lectures avance au minimum `corpus.last_continuous_run`. Laisser ce
fichier en arrière du réel (indexes existants mais `indexes_initialized: false`,
P9 covered mais `code_analysis_status: not_started`, 20 runs faits mais
`last_continuous_run: null`, des bugs sous `doc/prod/known-bugs/` mais
`corpus_inventory.bugs: {}`) est le pattern de drift observé en réel sur
plusieurs corpora. Le validator (`scripts/validate-corpus.mjs`) détecte
maintenant ce drift dans le sens "artefact présent mais state en
retard" en plus du sens "state dit oui mais artefact absent".

### Major pass (explicit, after a milestone)

High-cost, only when the operator asks for a full refresh, after the deep code pipeline P1→P9 flips to `covered`, after a kickstart milestone, or after a broad subagent coverage sweep.

Additionally rebuild:

- `doc/_roadmap/CORPUS_ROADMAP.yaml` **full `nodes:` list** — rebuild from `doc/_meta/brick-inventory.yaml`, P3 features, integrations and prod signals.
- `doc/_roadmap/CORPUS_ROADMAP.md` **ASCII tree** — refresh the read-only tree section to reflect the new node set; reset Active zones table accordingly.
- `doc/_graph/*.yaml` — full sweep to remove stale nodes/edges.

Announce in the chat which mode the run used. A run that claims durable knowledge but did neither is an audit failure (`continuous/corpus-run-audit`).

## End-of-run mandatory housekeeping

Before the final chat status, every run **must** confirm — line by line — that the following files reflect the run, even if the run was short or read-only. Skipping any of these is the root cause of roadmap desynchronization.

Mandatory write set on **every** run (per-run light mode):

```text
doc/_meta/corpus-state.yaml        # last_continuous_run + every *_status / last_* / corpus_inventory.* field the run advanced
doc/_roadmap/CORPUS_ROADMAP.yaml   # header + impacted node only
doc/_roadmap/CORPUS_ROADMAP.md     # Active zones row + Recently Expanded log line if applicable
doc/_roadmap/ROADMAP_STATE.md      # active node, last run, resume hint
doc/_roadmap/NEXT_BEST_ACTIONS.md  # top 5 re-ranked
doc/_runs/RUN_LEDGER.md            # one row for the run
doc/_runs/YYYY-MM-DD-<run-id>.md   # run record with audit block
```

Rules:

- If a run produced no durable knowledge, the housekeeping files are still updated to record that explicitly (`corpus.last_continuous_run` advanced, `*_status` unchanged, NEXT_BEST_ACTIONS regenerated, RUN_LEDGER entry with `useful=false`).
- `corpus-state.yaml` must never be left out of the write set, even on read-only runs. At the very minimum, `corpus.last_continuous_run` advances on every run; flipping `*_status` / `last_*` / `corpus_inventory.*` is mandatory whenever the underlying artefact on disk has actually changed.
- `CORPUS_ROADMAP.yaml` must never be left out of the write set under "the YAML is only for major passes". The **header fields** (`active_node_id`, `last_completed_node_id`, `last_run`) and **the touched node's state** are per-run light updates.
- The full `nodes:` block of `CORPUS_ROADMAP.yaml` and the ASCII tree of `CORPUS_ROADMAP.md` are **only** rebuilt during a major pass.
- `continuous/corpus-run-audit` must verify this write set; an incomplete housekeeping makes the audit `needs_followup` at best. If the validator reports `corpus-state-backward-drift-*` codes after the run, the audit result also cannot be `useful`.

**End-of-run recompute + NEXT_BEST_ACTIONS regeneration (always, in this order):**

1. After every write under `doc/` (corpus files, roadmap, graph, run record), re-run:
   ```bash
   node scripts/recompute-corpus-state.mjs --apply --json
   ```
   This catches any state field the agent forgot to flip during the run (the per-run write-set discipline + deterministic recompute are complementary — the script is the safety net for the discipline).

2. Then **regenerate `doc/_roadmap/NEXT_BEST_ACTIONS.md` from scratch**. Discard the prior file content; rebuild it from the freshly-recomputed `corpus-state.yaml` + the dominance rule of `continuous/next-best-corpus-actions` + the current operator intent. Prior entries do not carry by inertia — if a recommendation was on the list 5 runs ago and is still relevant today, it re-emerges from the current scoring on its own; if it does not re-emerge, it is stale and must disappear. This is the second direction-carrying file: stale carried-forward recommendations are the second-most-common cause of direction lock-in. See `continuous/next-best-corpus-actions` § Regeneration discipline.

3. Run the audit (`continuous/corpus-run-audit`) — it verifies that both the recompute and the regeneration happened.

## Chat output shape

Every run ends with **two blocks, in this order**:

1. A high-level operator recap (plain language, conversation opener).
2. The structured run status.

### 1. Operator high-level recap (mandatory)

The recap is a very rough, plain-language sketch of the run. Its declared purpose is to **open a confirmation/enrichment conversation with the operator** on what was just done — do not leave that purpose implicit, state it in the closing invitation.

```text
Récap du run (haute maille)
- 3 à 6 phrases courtes, langage naturel, sans jargon de pipeline ni liste de fichiers.
- Dire ce qui a été regardé, ce qui est retenu comme acquis, ce qui surprend ou semble fragile.
- Nommer les zones du corpus touchées (features, prod, specs, indexes, roadmap…) sans tout citer.
- Si la validation a relevé du P0 ou des P1 nouveaux, le dire en clair (zone touchée, type de drift), pas seulement dans le bloc structuré.
- Terminer par une invitation explicite à confirmer ou enrichir, du type :
  "Dis-moi si ça colle à ta vision, ce qu'il faut corriger, et sur quel point tu veux qu'on creuse ensuite."
```

The recap is required even when the run produced little or no durable update — in that case, say so plainly and ask the operator how to redirect. Use the operator's working language (French if the operator writes in French).

### 2. Run status (mandatory, after the recap)

```text
Run status
- Node:
- Sources used:
- Capitalized:
- Created roadmap nodes:
- Validation: P0=<n> P1=<n> P2=<n> | skipped (read-only) | error: <reason>
- New top findings:                # up to 5 codes+files when P0>0 or new P1 appeared, else omit
- Dashboard: rebuilt | skipped (read-only) | error: <reason>
- Open question:
- Recommended next:
```

**`Recommended next` est toujours une prochaine action de corpus** —
prochain nœud roadmap à approfondir, prochaine analyse à lancer,
prochaine source à enrichir, prochaine question opérateur. Ce n'est
**jamais** un hand-off d'implémentation, de spec, de ticketing ou de
remédiation, ni un bug "à corriger". Un bug capturé dans
`doc/prod/known-bugs/` est du travail terminé côté corpus ; il n'a pas
sa place dans cette ligne. Ne nomme jamais un autre agent du pack ni
un skill `authoring/*` / `development/*` dans cette ligne — ces zones
sortent du scope corpus. Voir `corpus.agent.md` § Scope boundaries pour
la liste des formulations interdites.

The `Validation` and `New top findings` lines are produced by the deterministic drift check in `continuous/corpus-run-audit` (the audit step runs `node scripts/validate-corpus.mjs --json` whenever the run wrote under `doc/`). They are mirrored into the high-level recap (block 1) whenever `P0 > 0` or new P1 findings appeared, so the operator notices drift in plain language without opening the run file.

Do not always dump the full roadmap. Show it when the operator asks or when an exploration branch reaches a natural pause.

### Order and anti-patterns

- The recap comes **first**, then the structured status. Never close the run with the structured block alone.
- The recap does **not** replace `foundations/corpus-status-footer` when a kickstart/structural footer is required — both are produced (recap first, then footer).
- Never end the run without an open question or explicit invitation to confirm/enrich.

## Continue convention

`continue` means resume the interrupted active node.

If the agent cannot determine the active node, ask:

```text
I do not know what to continue. Which node should I resume?
```

and list a few active/recommended nodes from `ROADMAP_STATE.md` and `NEXT_BEST_ACTIONS.md`.

## Anti-patterns

- Treat a run as a path toward adoption material instead of durable corpus improvement.
- Produce text without updating corpus, roadmap, graph or run ledger.
- Use broad external queries without MCP readiness and bounds.
- Keep talking when a high-value human question should be asked.
- Lose the user's guidance when context compacts; resume from persisted state.
- Frame `Recommended next` (or the recap) as an implementation task, a
  spec to write, a ticket to open, a "to fix" bug, or a hand-off to
  another role. A captured finding is corpus knowledge, not a backlog
  item to dispatch — the operator decides any downstream work, never
  the agent in the recap.
- Nommer un autre agent du pack ou un skill `authoring/*` /
  `development/*` dans la recap ou dans `Recommended next`. Ces zones
  sortent du scope corpus ; les nommer ouvre la porte à les suggérer.
