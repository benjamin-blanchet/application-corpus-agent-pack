# Agent Operating Guide

This repository carries an application corpus under `doc/` and a small set
of human-facing agents under `.github/agents/`. Goal: turn an existing
repository into a durable knowledge base usable by agents and humans,
without assuming a specific technology stack.

> This file is an index. Detail lives in the linked skills and references —
> see [Cache discipline](doc/_meta/agent-cache-discipline.md) for why this
> matters. Update detail in those files, not here.

## Hard rules (apply to every agent, every session)

These are non-negotiable invariants. The detail of each rule is in
`foundations/`; the rules themselves stay inline so they are always loaded.

1. **Code is the primary source — retrodocumenting it is the primary mission.**
   Two ideas, both load-bearing:
   - **Primary mission.** The corpus is built **from the code**. Deep code
     analysis and retrodocumentation (the P1→P9 pipeline) is the
     agent's main work, not one lane among many. Production, Jira,
     Confluence, dashboards, interviews **enrich** the code-derived
     spine — they never substitute for it. A run that produces a rich
     Confluence sweep or Dynatrace digest while the code pipeline is
     `not_started` has produced fluent text on a missing foundation.
   - **Truth ranking.** When sources disagree about how the application
     behaves, code wins. Confluence, Jira, dashboards, tribal knowledge
     are signals — never ground truth without reconciliation. Full
     ranking: `foundations/core-rules § Source priority`. Behavioral
     enforcement: `foundations/core-rules § Code-first principle` +
     `foundations/core-discipline § Rule 5`.
2. **Write boundaries.** Every agent has a declared write surface. Cross-
   boundary writes are declined and rerouted. The `corpus` agent **never
   modifies application source code** — in any mode, for any reason,
   including "obvious" or "trivial" fixes. See [Write boundaries](doc/_agents/write-boundaries.md).
3. **Stay on task.** Findings discovered mid-run are *facts about the
   application*, captured in the right corpus location and surfaced in the
   recap — they do not abandon the active node. Detail in `foundations/core-discipline § Stay on task`.
4. **State assumptions explicitly.** Never confabulate to fill a gap. Use
   `confidence: unknown` and surface a blocking question via
   `governance/blocking-question-loop`.
5. **No append-only corpus.** Reconcile affected summaries, indexes and
   related files. When a decision changes, update every impacted location
   or mark the conflict explicitly.

## Confidence and source metadata

Every durable claim carries:

```yaml
confidence: suspected | probable | confirmed | unknown
source: code | prod | jira | confluence | human | mixed | unknown
```

`confidence: confirmed` requires evidence from a rank 1-3 source (code,
runtime config, production), or an operator interview corroborated by code.
Confluence-only or Jira-only claims must use `confidence: probable` at most.

## Human-facing agents

| Agent | Owns | Detail |
|---|---|---|
| `corpus` | continuous corpus enrichment, kickstart, adoption material | [.github/agents/corpus.agent.md](.github/agents/corpus.agent.md) |
| `functional-analyst` | specs, impact analyses, acceptance criteria | [.github/agents/functional-analyst.agent.md](.github/agents/functional-analyst.agent.md) |
| `developer` | implementation from validated specs | [.github/agents/developer.agent.md](.github/agents/developer.agent.md) |
| `reliability-analyst` | incident analysis, production knowledge | [.github/agents/reliability-analyst.agent.md](.github/agents/reliability-analyst.agent.md) |

Internal subagents (`corpus-brick-*`) parallelize broad read-only brick
coverage on behalf of `corpus`. They never own state transitions.

Roles are entered from an agent picker where one exists (VS Code, the GitHub
coding agent) and from intent on surfaces without one (the GitHub Copilot
app, web chat). Routing, the read-only roles for non-developers, and the
re-anchoring footer: [doc/_agents/copilot-surfaces.md](doc/_agents/copilot-surfaces.md).

## Corpus structure

Canonical structure, where-to-find-what, naming conventions:
**[doc/CORPUS_MAP.md](doc/CORPUS_MAP.md)** and
**[doc/CORPUS_MANIFEST.md](doc/CORPUS_MANIFEST.md)**.

## Skills

Skills are auto-discovered under `.github/skills/` (Skills 2.1 progressive
disclosure — only `name` + `description` are always-loaded). Category map:
[.github/skills/SKILLS_MAP.md](.github/skills/SKILLS_MAP.md).

## Corpus-first lifecycle

For significant development work:

```text
read relevant corpus → create/validate spec → implement → test → update/reconcile corpus
```

Mandatory for `developer`:

1. Start from the relevant corpus slice, not from the ticket alone.
2. Use or create a `doc/spec/<version>/<jira>/` package before code changes.
3. Implement from repository evidence and existing conventions.
4. Update the spec and affected corpus files at closeout.
5. Reconcile contradictions; do not leave an append-only trail.

If direct corpus editing is blocked, write precise updates to
`doc/_meta/update-candidates.md` and auto-invoke `Corpus` to consume them.

## First run

Invoke the `corpus` agent with any kickstart trigger, in any language
("init the corpus" / "init le corpus", "kickstart", "continue", "run the
full repo analysis" / "fais l'analyse complète du repo", etc.). The
agent reads state first, produces a resume report, then proposes the next
bounded action. The full kickstart procedure is owned by
`modes/kickstart` (or the persona's "Operating modes § Kickstart"
section if the modes/ skills are not yet extracted).

For pack installation, expected outputs, dashboard, MCP readiness,
adoption-rollout playbook → [doc/_agents/operator-onboarding.md](doc/_agents/operator-onboarding.md).

## Technology neutrality

Agents detect the actual stack from the repository — they never assume
PHP, Java, Node, Python, .NET or any specific framework. If the stack is
unclear, record it in `doc/_meta/open-questions.md` rather than guess.

## Safety stance

Agents are read-only by default for external systems and high-risk actions.
Use `governance/safe-operation-guardrails` before destructive, broad or
side-effect operations. Prefer dry-runs, diffs, `SELECT`-only queries,
previews and corpus update-candidates.

## Validation

Run `node scripts/validate-corpus.mjs` after kickstart, before adoption-guide
generation, and after significant corpus updates. P0 is blocking; P1 is
important before broad team use; P2 is hygiene work.

## Pack upgrade

Operator-triggered only: copy a newer pack over the repo (excluding `doc/`),
then ask the `corpus` agent to migrate. The agent runs `governance/pack-upgrade`,
stamps `pack_version`, fills schema gaps, writes a migration report.
Full procedure: [doc/_agents/pack-upgrade.md](doc/_agents/pack-upgrade.md).

## Cache discipline

How to keep the prompt cache warm across tours and minimize token spend:
[doc/_meta/agent-cache-discipline.md](doc/_meta/agent-cache-discipline.md).

Summary: pick a model and stay on it, pre-attach MCP servers before the
first agent message, treat `AGENTS.md` and agent personas as immutable for
the session, `/compact` at natural task boundaries.
