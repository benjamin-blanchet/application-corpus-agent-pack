---
name: corpus-run-audit
category: continuous
description: "Check whether a continuous corpus run actually increased durable knowledge, updated state honestly and left a useful next step."
---
# Corpus Run Audit

## Purpose

Check whether a continuous corpus run actually increased durable knowledge, updated state honestly and left a useful next step.

This is a lightweight audit after each run, not a blocker for every small exploration. It prevents the agent from producing fluent summaries with no capitalized value.

## When to use

Use this skill:

- at the end of every `continuous/corpus-run`;
- before declaring a roadmap node `deepened`;
- when the operator asks whether a run was useful;
- before generating or refreshing adoption guide material.

## Mandatory reads

1. Current run record under `doc/_runs/`
2. `doc/_runs/RUN_LEDGER.md`
3. `doc/_roadmap/CORPUS_ROADMAP.yaml`
4. `doc/_roadmap/ROADMAP_STATE.md`
5. `doc/_roadmap/NEXT_BEST_ACTIONS.md`
6. Files the run claims to have updated.

## Audit checks

| Check | Question |
|---|---|
| Intent captured | Did the run record the operator intent and selected roadmap node? |
| Sources consumed | Did it record which code/MCP/tool sources were actually consumed? |
| Bounds recorded | Were external queries bounded by window, filter or limit? |
| Findings separated | Are facts, hypotheses and questions distinguished? |
| Durable update | Did at least one canonical corpus file, roadmap file, graph file or run ledger entry change? |
| No-update reason | If nothing durable changed, is the reason explicit? |
| Node state updated | Did the roadmap node status/interest/energy change when appropriate? |
| Child nodes declared | Were created child nodes listed for the operator? |
| Sensitive data handled | Were logs/secrets/payloads summarized or anonymized as needed? |
| Next action exists | Is there a concrete recommended next run or operator question? |
| Control plane updated | If the run discovered durable knowledge, did it update indexes, graph, roadmap, coverage/source metadata when relevant? |
| Subagent trace | For broad scopes, were available subagents invoked or was a clear skip reason recorded? |
| Cross-repo edges valid | When `application.multi_repo.status == declared`: do all `cross_repo:` values in touched edges match a declared `adjacent_repos[].name` or `consumed_by[].name`? Do their `evidence:` paths resolve from the current repo root? Orphans are an audit failure, not a warning. |
| Sibling sync recommendation | When the run touched a node with cross-repo edges, did the end-of-run summary include a `Sibling sync recommendation` line per affected sibling, consistent with `application.multi_repo.sync_policy`? |
| Structural drift checked | If the run wrote anything under `doc/`, was `scripts/validate-corpus.mjs --json` executed and its P0/P1/P2 counts captured? |
| State recomputed at start | Was `node scripts/recompute-corpus-state.mjs --apply --json` invoked **before** any other read at run start (Step 0 of the standard run loop)? If `changed: true`, were the corrected fields surfaced in the opening resume report? |
| State recomputed at end | After every write under `doc/`, was `recompute-corpus-state.mjs --apply --json` invoked again as the safety net for per-run write-set discipline? |
| Corpus state synced | Was `doc/_meta/corpus-state.yaml` touched on this run — at minimum `corpus.last_continuous_run` advanced, and every `*_status` / `last_*` / `corpus_inventory.*` field whose underlying artefact actually changed on disk also flipped? Did the validator return zero `corpus-state-backward-drift-*` findings? |
| NEXT_BEST regenerated from scratch | Was `doc/_roadmap/NEXT_BEST_ACTIONS.md` regenerated end-of-run from the freshly-recomputed state + dominance rule + operator intent, **discarding** prior entries? Stale entries that no longer emerge from current scoring must not be carried forward by inertia. |
| Dashboard rebuilt | If the run wrote anything under `doc/`, was `scripts/build-corpus-site.mjs` executed and `doc/_site/corpus.html` refreshed so the dashboard stays synchronized with corpus state? |

## Deterministic drift check (mandatory when `doc/` was touched)

If the run wrote, edited or deleted anything under `doc/`, the audit must include a deterministic validation pass — this is the per-run drift guard, complementary to (not a replacement for) `governance/corpus-validation` and `governance/post-kickstart-completeness-audit`.

Steps:

1. From the repository root, run:
   ```bash
   node scripts/validate-corpus.mjs --json
   ```
2. Parse `summary.counts.P0`, `summary.counts.P1`, `summary.counts.P2`.
3. Compare against the previous run's counts recorded in `doc/_runs/RUN_LEDGER.md` (if known) to detect **new** findings introduced by this run (delta, not absolute).
4. Capture the new top P0/P1 codes (e.g. `p4-feature-arch-diagram-missing`, `broken-markdown-link`) — at most 5, with the file path.

Rules:

- **The drift check never blocks the run by itself.** Its job is to surface drift to the operator, not to gate writes — gating remains the responsibility of `governance/corpus-validation` (before adoption claims) and `governance/post-kickstart-completeness-audit` (before kickstart-completion claims).
- **However, if `summary.counts.P0 > 0`**, the audit result cannot be `useful`; it must be `needs_followup`, and the recap must surface the P0 count and at least the top code.
- **Same rule for `corpus-state-backward-drift-*` codes** (artefact present on disk but `corpus-state.yaml` still says `not_started` / `null` / `skeleton`, or `last_continuous_run` more than 3 runs behind `RUN_LEDGER.md`). When any such code appears at P0 or P1, the audit result cannot be `useful`; it must be `needs_followup`, and the recap must name the stale fields so the operator sees the drift. Backward-drift is the per-run guard against the slow, silent staleness pattern observed on real corpora — the corpus advances under `doc/` but `corpus-state.yaml` is left behind, and every later run trusts the stale value.
- If the run did not write anything under `doc/`, the drift check may be skipped; record `validation: skipped (read-only run)`.
- If the script fails (missing Node, missing pack files, exception), record `validation: error` with the first line of stderr and continue — never silently drop the check.
- Do not run the heavy `governance/post-kickstart-completeness-audit` here; that skill stays scoped to kickstart-completion claims. The script alone is enough to detect typical per-run drift (broken links, missing frontmatter, P4 fake-depth, incomplete feature folders, empty indexes, pipeline artifact gaps, secret patterns).

## Deterministic dashboard rebuild (mandatory when `doc/` was touched)

The dashboard at `doc/_site/corpus.html` is a **derived artefact**, not corpus content. It must stay synchronized with the corpus state so that:

- the Executive view (default landing) reflects the latest scale signals, surprises, known/unknown lists and next actions;
- a champion who shares the dashboard with their team or manager is sharing the current state, not a snapshot from N runs ago;
- the dashboard never has to be rebuilt manually by the operator — staleness is the failure mode this rebuild prevents.

If the run wrote, edited or deleted anything under `doc/`, the audit must rebuild the dashboard at the end of the run, **after** the drift check.

Steps:

1. From the repository root, run:
   ```bash
   node scripts/build-corpus-site.mjs
   ```
2. Verify the script exits cleanly. Note the one-line summary it prints (Nodes / Edges / Evidence / Sources / Indexes / Coverage / Anchoring) — this confirms which signals fed the rebuild.
3. Record the outcome in the audit block (see Output below) as `dashboard: rebuilt` plus the summary line, or `dashboard: error: <first line of stderr>` if the script failed.

Rules:

- **The rebuild never blocks the run by itself.** Like the drift check, it is a visibility guard, not a write gate. A build failure means the dashboard is stale, not that the run is invalid.
- However, if the rebuild fails, the recap must surface the failure in plain language so the operator knows the dashboard is out of date. Do not hide the error.
- If the run did not write anything under `doc/`, the rebuild may be skipped; record `dashboard: skipped (read-only run)`.
- If `node` is missing or the script is missing/outdated, record `dashboard: error: <reason>` and continue. The agent does not attempt to install or repair Node/scripts itself — surface for the operator.
- The dashboard rebuild runs **last** in the closeout sequence, after the validator drift check and after all corpus writes. It is the final step of the run audit.
- The output `doc/_site/corpus.html` is gitignored — it regenerates on every relevant run and is never committed.

## Output

Append a short audit block to the run record:

```text
Run audit
- Result: useful | exploratory_no_update | blocked | needs_followup
- Durable updates:
- Sources consumed:
- Roadmap changes:
- Sensitive data handling:
- Validation: P0=<n> P1=<n> P2=<n> (delta vs previous run: +/-x P0, +/-y P1) | skipped (read-only) | error: <reason>
- New top findings: <code> (<file>), <code> (<file>) ...  # up to 5, omit if no new findings
- Dashboard: rebuilt (<one-line summary from build script>) | skipped (read-only) | error: <reason>
- Next action:
```

The `Validation` and `New top findings` lines are mirrored into the high-level operator recap (block 1 of the run output, see `continuous/corpus-run`) whenever P0 > 0 or new P1 findings appeared, so the operator sees the drift signal in plain language without having to open the run file.

## Adoption gate behavior

Do not call the team adoption guide "ready" because a single run passed audit. Adoption readiness is a broader state based on roadmap coverage, critical/high node depth and operator judgment.

If a run or status report claims the kickstart is complete or adoption-ready, invoke `governance/post-kickstart-completeness-audit` first. Empty indexes, skeleton graph or stale metadata must be surfaced as blockers or explicit limitations.

For broad scopes, available subagents are expected. If `runSubagent`/`agent` was available and the run did not use `actionable/subagent-coverage-orchestration`, the audit result cannot be better than `needs_followup` until the skip reason is recorded.

## Anti-patterns

- Fail a run only because it did not discover something new.
- Hide that no durable knowledge was capitalized.
- Count chat text as corpus update.
- Treat the per-run drift check as a substitute for `governance/corpus-validation` or `governance/post-kickstart-completeness-audit` before adoption or kickstart-completion claims.
- Skip the deterministic drift check when the run wrote under `doc/` because the agent "is sure nothing is broken".
- Run the drift check but hide the P0/P1 counts from the recap when findings appeared.
- Skip updating `corpus-state.yaml` because "the run was read-only" or "no big state change happened". `corpus.last_continuous_run` advances on every run; `*_status` / `last_*` / `corpus_inventory.*` fields flip whenever the underlying artefact actually changed on disk. Leaving the file stale is the slow drift pattern this audit row is designed to catch.
- Treat `corpus-state-backward-drift-*` validator codes as cosmetic. They mean a downstream skill, the dashboard or the next agent's mandatory state load will silently read a stale fact.
- Skip `recompute-corpus-state.mjs --apply` at Step 0 because the agent is "confident the state is fresh". The script is deterministic, idempotent and ~50ms — there is no cost-justified reason to skip it, and skipping is exactly how direction lock-in survives across sessions.
- Preserve prior entries in `NEXT_BEST_ACTIONS.md` because "they still seem relevant". They re-emerge from the current scoring on their own if they are; carrying them forward by inertia is the second-most-common cause of direction lock-in. Regenerate from scratch.
- Skip the dashboard rebuild when the run wrote under `doc/`. The dashboard going stale is exactly the failure mode this step prevents — running it manually is not sustainable for the operator.
- Hide a dashboard rebuild error from the recap. If the dashboard could not be refreshed, the operator must know — otherwise they will share a stale artefact next time they open the file.
