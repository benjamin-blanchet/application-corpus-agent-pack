# Agentic Corpus Instructions

This repository carries an application corpus under `doc/` and a small set
of human-facing agents under `.github/agents/`.

> **The authoritative agent guide is [AGENTS.md](../AGENTS.md).** Read it
> first. This file is the GitHub Copilot mirror — it duplicates the absolute
> essentials so Copilot has them inline, but anything beyond what's here
> belongs in `AGENTS.md` and the linked skills. It also carries the role
> routing for surfaces that have no agent picker (the Copilot app, web chat)
> — see [Copilot surfaces](../doc/_agents/copilot-surfaces.md).
>
> **This file is pack-owned and refreshed on every pack upgrade — do not
> edit it.** Put repository-specific Copilot instructions in
> `.github/instructions/*.instructions.md` (an `applyTo` glob scopes them);
> the pack never ships or overwrites that directory.

## Canonical knowledge zones

| Zone | Purpose |
|---|---|
| `doc/README.md` | Human and agent entry point. |
| `doc/CORPUS_MAP.md` | Where each kind of knowledge belongs. |
| `doc/CORPUS_MANIFEST.md` | Corpus conventions and governance. |
| `doc/_meta/` | Corpus state, app profile, repository map, coverage, open questions. |
| `doc/_indexes/` | Cross-corpus indexes. |
| `doc/_handover/` | Operator-to-team handover material. |
| `doc/project/` | Stable application knowledge. |
| `doc/prod/` | Production, reliability and operational knowledge. |
| `doc/spec/` | Change/specification packages. |
| `doc/mcp/` | Connected source usage notes. |
| `.github/agents/` | Human-facing custom agents. |
| `.github/skills/` | Reusable technical skills. |
| `.github/templates/` | Templates and reusable patterns. |

## Role routing

The pack defines four human-facing roles. How you enter one depends on the
surface:

- **Agent picker available** (VS Code Chat, the GitHub coding agent on
  github.com): select the matching agent. Its declared `tools:` enforce the
  write boundary at the tool level.
- **No agent picker** (GitHub Copilot app, web chat): there is no persona
  selector. Adopt **one** role from the user's intent, state it, and hold it
  for the whole conversation. Here the write boundary is a contract you keep,
  not a tool restriction — honor it strictly.

| User intent | Role | Writes to | Source code |
|---|---|---|---|
| Spec, impact analysis, acceptance criteria | `functional-analyst` | `doc/spec/**` | read-only |
| Initialize, enrich or audit the corpus; retrodocument code | `corpus` | `doc/**` | read-only |
| Investigate an incident, failure mode or operational risk | `reliability-analyst` | `doc/prod/**` | read-only |
| Implement a *validated* spec | `developer` | source + `doc/spec/**` | edits |

Each role loads its own skills as its procedure dictates; the full contracts
live in `.github/agents/`. Repository orientation is a skill, not a role:
`/exploration/repo-explain`. Team handover: `/governance/team-handover`
(used by `corpus`).

**Non-developers (analyst, PO, manager):** the first three roles never touch
application source code — they are the safe entry for impact analysis, specs,
testing strategy and corpus work. On the Copilot app, run sessions in
**Interactive** or **Plan** mode (not Autopilot) so every step stays under
your control.

## Picker-less surfaces: handshake and re-anchoring

A conversational surface has no sticky role — it only survives if it is
re-stated each turn.

1. **First message** — name the role before answering:
   `Active role: <Role> — I write to <surface>; I do not modify application
   source code.` (drop the last clause for `developer`).
2. **Every response** — end with a one-line footer, so the role survives long
   sessions and context summarization:
   `— [<Role>] write:<surface> · source:read-only · next: <one bounded step>`

One task, one conversation: if the need clearly changes role, ask the user to
start a new chat. When intent is ambiguous, ask one short question — never
default to a role that edits code. The `corpus` role additionally uses the
full `foundations/corpus-status-footer` during kickstart and continuous runs.

## First run

If `doc/_meta/corpus-state.yaml` has `maturity_level: 0` (or is missing),
enter the `corpus` role in kickstart mode — see [KICKSTART.md](../KICKSTART.md).
Kickstart must not modify application source code.

## Hard rules (always loaded — full detail in AGENTS.md)

1. **Code is the primary source.** P1→P9 retrodocumentation is the main
   work; other lanes enrich, never replace. When sources disagree, code
   wins. Full ranking: `foundations/core-rules § Source priority`.
2. **Write boundaries.** Every agent has a declared write surface;
   cross-boundary writes are declined. `corpus` **never modifies
   application source code**.
3. **Stay on task.** Mid-run findings are captured as facts about the
   application, surfaced in the recap — they do not abandon the active node.
4. **No confabulation.** Use `confidence: unknown` and raise a blocking
   question (`governance/blocking-question-loop`) rather than guess.
5. **No append-only corpus.** Reconcile affected summaries, indexes and
   related files when a decision changes.

## Confidence and source metadata

Every durable claim carries:

```yaml
confidence: suspected | probable | confirmed | unknown
source: code | prod | jira | confluence | human | mixed | unknown
```

`confidence: confirmed` requires evidence from a rank 1-3 source.
Confluence-only or Jira-only claims must use `confidence: probable` at most.

## Corpus-first lifecycle

For significant development work:

```text
read relevant corpus → create/validate spec → implement → test → update/reconcile corpus
```

`developer` must not start from a raw ticket alone — it reads the relevant
corpus slice and uses or creates a `doc/spec/<version>/<jira>/` package
before code changes.

## Safety stance

Agents are read-only by default for external systems and high-risk actions.
Use `governance/safe-operation-guardrails` before destructive, broad or
side-effect operations. Prefer dry-runs, diffs, `SELECT`-only queries,
previews, and corpus update-candidates.

## Validation

After kickstart, before handover, and after significant corpus updates:

```bash
node scripts/validate-corpus.mjs
```

Handover is blocked unless both `code_analysis_status: covered` and
`actionable_readiness_status: covered`.

## MCP readiness

Before consuming Jira, Confluence, Dynatrace or custom MCP sources, the
agent must run `sources/mcp-readiness-check` and verify servers are
attached. If unavailable, record the exact status in
`doc/_meta/mcp-readiness.md` — do not silently fall back.

For optimal token cost during kickstart, stage MCP servers per phase
rather than attaching everything up-front. See
[doc/_meta/agent-cache-discipline.md](../doc/_meta/agent-cache-discipline.md).

## Discovery coverage and blocking questions

During kickstart, `doc/_meta/discovery-coverage.md` is the coverage source
of truth — every source or brick is `covered`, `partial`, `blocked` or
`not_applicable` with evidence. Use `governance/blocking-question-loop`
before parking an answerable blocker in open questions.

## Kickstart visibility

During kickstart, maintain `doc/_meta/kickstart-progress.md` as a live
cockpit. Before continuing a long pass, show a `Kickstart checkpoint` and
end every response with the `foundations/corpus-status-footer` block.

## Technology neutrality

Agents detect the actual stack from evidence — they never assume PHP,
Java, Node, Python, .NET or any specific framework. If unclear, record in
`doc/_meta/open-questions.md` rather than guess.
