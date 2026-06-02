# Kickstart

Entry point for the **operator** right after copying this pack into an
existing repository. The full procedure lives in the `corpus` agent persona
and in [doc/_agents/operator-onboarding.md](doc/_agents/operator-onboarding.md) —
this file is the short "what to type, what to expect" guide.

## Goal

Build a deep, evidence-backed application corpus from a repository that had
no agentic structure, then maintain it through continuous enrichment. Code
is the source of truth; Jira, Confluence, Dynatrace and operator interviews
enrich it but never replace it.

Detail of source priority and pipeline: see `foundations/core-rules` and
[doc/_agents/operator-onboarding.md](doc/_agents/operator-onboarding.md).

## Trigger prompts

The agent recognises any kickstart-mode trigger — pick the phrasing that
fits, the agent verifies state before doing anything:

```text
init le corpus
kickstart this repo
lance le corpus
où en est-on sur le corpus
continue
fais l'analyse complète du repo
```

Or the explicit form, when you want to be precise:

```text
Initialize the application corpus for this repository. Verify state from
doc/_meta/corpus-state.yaml and doc/_meta/code-pipeline-state.yaml first,
then run the deep code analysis pipeline P1 → P9, plus Jira/Confluence/
Dynatrace lanes where available. Treat code as the source of truth. Do not
modify application source code.
```

First response from the agent is a **resume report** (where the corpus
currently stands, blockers, next bounded action) — never raw generation.

## Multi-repo workspace

If this repo is part of a multi-repo application opened together in your
IDE workspace (for example `front` + `lib` + `deploy`), install the pack in
**each** repo. The agent runs `foundations/multi-repo-workspace-detection`
as Step 2 of every kickstart — it detects sibling repos and interviews you
to capture roles, consents, and a sync policy. Outcomes land in
`doc/_meta/app-profile.yaml`.

Recommended install order: library/secondary first, then primary (so the
primary kickstart picks up sibling corpora). Pack-in-primary-only also
works — siblings are recorded with `has_pack: false`.

## What the agent does (high-level)

| Step | What | Skill |
|---|---|---|
| 1 | Verify state, propose resume | persona |
| 2 | Detect multi-repo workspace | `foundations/multi-repo-workspace-detection` |
| 3 | Inventory MCP and non-MCP sources | `sources/mcp-source-wizard` |
| 4 | Deep code analysis P1 → P9 (scoped by role) | `pipeline/p1-…` → `pipeline/p9-…` |
| 5 | Enrichment lanes (Jira, Confluence, Dynatrace, CI/CD, prod) | `exploration/*` |
| 6 | Roadmap + graph + runs | `continuous/roadmap-graph` |
| 7 | Actionable readiness before adoption material | `actionable/*` |
| 8 | Validation | `node scripts/validate-corpus.mjs` |

Pipeline outputs, MCP staging, subagent acceleration, dashboard and
operator-rollout playbook → [doc/_agents/operator-onboarding.md](doc/_agents/operator-onboarding.md).

## Constraints (first-run)

- Do not modify application source code.
- Detect the stack from evidence; never assume Java/Node/Python/etc.
- Code is the source of truth; Confluence is rank 7 of 8.
- Use `confidence: unknown` rather than guessing.
- Record unresolved points in `doc/_meta/open-questions.md` (only after
  `governance/blocking-question-loop` if the operator could answer).
- If a source (Jira, Confluence, Dynatrace, custom) is unavailable, mark
  it `blocked` or `partial` with a reason. Do not fake state.

## Validation

After each pass and before any adoption-guide work:

```bash
node scripts/validate-corpus.mjs
```

P0 issues block the next pass; P1 issues block declaring a pass `covered`;
P2 issues go to `doc/_meta/update-candidates.md`.

## Cache discipline

The pack's amorçage is measured by `scripts/estimate-token-cost.mjs`. To
keep the prompt cache warm across a kickstart, pre-stage MCP servers per
phase and never edit `AGENTS.md` / personas mid-session — full guidance in
[doc/_meta/agent-cache-discipline.md](doc/_meta/agent-cache-discipline.md).

## Adoption-guide prompt

When the operator decides the corpus is clean enough to present to the
team, run with the `corpus` agent:

```text
Prepare adoption-guide material for this corpus. Verify code state,
actionable readiness and roadmap state first via doc/_meta/corpus-state.yaml,
doc/_meta/code-pipeline-state.yaml, doc/_meta/brick-inventory.yaml,
doc/_meta/actionable-readiness.md and doc/_roadmap/ROADMAP_STATE.md. If the
corpus is not ready to present honestly, report what is missing and stop.
Otherwise generate or update doc/_handover/ material (HANDOVER_SUMMARY,
AI_CHAMPION_GUIDE, TEAM_USAGE_GUIDE, NEXT_30_DAYS, OPEN_DECISIONS,
KICKSTART_CLOSEOUT_CHECKLIST). Be explicit about gaps and next actions.
```

Adoption-guide gating: blocked unless `code_analysis_status: covered` AND
`actionable_readiness_status: covered`.

## After kickstart

The corpus is enriched through real work: feature exploration, incident
investigation, Jira/PR/CI analysis, spec writing, implementation support,
reliability reviews. Each is a continuous-mode trigger to `corpus`.

Development work follows the corpus-first lifecycle:

```text
read relevant corpus → create/validate spec → implement → test → update/reconcile corpus
```
