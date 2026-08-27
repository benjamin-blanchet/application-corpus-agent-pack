---
type: agents-reference
status: stable
source: pack
title: "Write boundaries — hard rule"
description: "The `corpus` agent **never modifies application source code**."
---

# Write boundaries — hard rule

The `corpus` agent **never modifies application source code**. This is
non-negotiable and applies in every mode: kickstart, continuous enrichment,
reconciliation, validation, audit, exploration, adoption-guide work.
Internal subagents inherit the same constraint.

## Corpus agent write surface

The `corpus` agent's write surface is strictly:

- `doc/**` — the corpus content it owns;
- `.github/agents/**` and `.github/skills/**` — pack-owned agent and skill artefacts, only when explicitly enriching or correcting the pack;
- `scripts/` files shipped with the pack — only when the user explicitly asks for a pack tooling change.

Everything else in the repository is **read-only** to `corpus`:
application source files, build descriptors, dependency manifests,
configuration files, migrations, tests, CI/CD definitions, runtime
configs, infrastructure-as-code, secrets, fixtures.

## When a corpus run uncovers a needed source change

1. Write the precise suggestion to `doc/_meta/update-candidates.md`; if it
   warrants a specification, return a structured handoff to
   `functional-analyst` instead of writing that package as `corpus`.
2. Surface it in the end-of-run recap.
3. Hand off to `developer` for implementation.

Never edit source code, even for "a tiny fix", even at the operator's
request mid-run. If the operator explicitly asks the corpus agent to write
code, the agent declines and reroutes to `developer`.

## Other agents

| Agent | Write surface |
|---|---|
| `developer` | only application/source/test paths reserved by its approved work package after Step 7; no `doc/**` writes |
| `functional-analyst` | functional spec package files and pre-candidate `acceptance-plan.yaml`; never factory controller state, acceptance run results or general corpus surfaces |
| `planner` | `TECHNICAL_PLAN.md` and `factory/plan.v3.json` inside one approved spec package |
| `reliability-analyst` | `doc/prod/known-bugs/`, `doc/prod/structural-risks/`, `doc/prod/root-cause-playbooks/`, `doc/prod/watchlist/`, reliability analyses |
| `acceptance` | generated results/evidence/factual report under the selected run output (`acceptance/runs/<run-id>/` only in evidence-only mode); plans and replay scripts are frozen read-only inputs, never factory plan/events/state |
| `factory-controller` | typed factory event log, derived state and controller lock/recovery records only |
| `code-reviewer` | structured review result only; no repository content changes |
| `delivery` | draft PR metadata through the declared provider operation; no repository file changes |

Cross-boundary writes are declined and rerouted via update-candidates or a
validated factory handoff. Neither a prompt nor a worker can widen its own
write surface.

## Corpus ownership

Only the `corpus` agent owns structural corpus changes:

- new feature folders;
- new prod knowledge files;
- index updates;
- metadata updates;
- adoption-guide updates;
- reconciliation after contradictions;
- quality checks.

Other agents may propose durable knowledge, but capture goes through
`corpus` using `governance/corpus-update` or `authoring/knowledge-capture`.
