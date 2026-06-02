---
type: operations-guide
audience: operator
status: stable
source: pack
---

# Agent cache discipline

> How to keep the prompt cache warm and pay `cache_read` rates (≈10 % of base
> input) instead of full input rates on every tour. Applies to any runtime
> that exposes Claude prompt caching (Claude Code, API, IDE plugins on
> Anthropic models).

## Why this matters

Claude's prompt cache is **sequential, left-to-right**. The context chain is
concatenated in this order at every tour:

```
[MCP tool definitions] → [system prompt] → [AGENTS.md / CLAUDE.md]
  → [agent persona] → [skills metadata] → [loaded skill bodies]
  → [conversation history] → [new message + tool results]
```

Any change to a slice on the **left** invalidates all caches to its right.
The pack's amorçage (always-on surface) sits in the leftmost slices — so
every byte there is multiplied by every tour, every session, every consumer.

The pack measures its amorçage with `scripts/estimate-token-cost.mjs`:

- `--baseline` once after install — captures the current amorçage as the
  reference point.
- `--compare` after any change to personas or top-level files — prints the
  delta vs. baseline so the operator sees what the change cost.
- `--check` in a pre-commit hook or CI step — exits non-zero if amorçage
  drifted more than +5 % (override with `--threshold=N`). Locks in token
  savings so future edits cannot quietly re-bloat the always-on surface.

## Hard discipline (apply on every session)

### 1. Pick a model before starting, and stay on it

`/model` mid-session invalidates the full cache for every subsequent tour.
If you must switch (e.g. drop to Haiku for a mechanical subtask), do it
**between tasks**, never inside one.

Recommendation per agent:

| Agent | Default model | Acceptable |
|---|---|---|
| `corpus` (kickstart, deep enrichment) | Sonnet | Opus when reasoning-heavy |
| `corpus` (continuous, lightweight) | Sonnet | Haiku acceptable |
| `developer` | Sonnet | Opus on large refactors |
| `reliability-analyst` | Sonnet | Opus on cross-system incident |
| `functional-analyst` | Sonnet | — |
| Internal subagents (`corpus-brick-*`) | Sonnet | Haiku acceptable |

### 2. Attach MCP servers BEFORE starting the agent

Each MCP server contributes 3 k – 15 k tokens of tool definitions in the
**leftmost** slice. Adding or removing a server mid-session **invalidates
everything**. Inventory and attach before the first agent message.

Two checkpoints:

- Before `corpus` kickstart → see § "MCP staging during kickstart" below.
- Before `developer` Step 7 (implementation gate) → confirm `gh`, repo
  MCP, and any custom test MCP are attached. Do not add them at Step 8.

### 3. Treat `AGENTS.md` and agent personas as immutable for the session

`AGENTS.md`, `.github/copilot-instructions.md`, `.github/agents/*.agent.md`
are loaded near the left of the chain. Editing them mid-session blows
the cache. If a fix is needed:

- Finish the current task or `/compact` first.
- Edit between sessions, not during.
- The same applies to `foundations/core-rules` and `foundations/core-discipline`
  — they are loaded by every agent persona.

### 4. `/compact` at natural task boundaries

`/compact` rewrites the message tail. The next 1-2 tours pay a write,
then every subsequent tour benefits from a smaller cached prefix.

- After a long exploration phase that produced a recap → compact.
- After a kickstart step finished → compact.
- Mid-thought, mid-step → do **not** compact.

### 5. `/clear` when switching to unrelated work

Better than dragging 20 k+ tokens of stale debug context into a docs task.
A `/clear` is one cache miss; carrying 50 tours of irrelevant history is
~50 cache misses.

### 6. Long sessions: enable 1h cache TTL

For sessions > 1 h (full kickstart, deep incident analysis):

```bash
export ENABLE_PROMPT_CACHING_1H=1
```

Cache writes cost ~2× the 5-min write, but you avoid 5-min TTL evictions
during slow operator turns or tool-execution waits. Break-even is around
3 tours within the hour — easily met on real kickstart sessions.

---

## MCP staging during kickstart

This is the highest-leverage application of cache discipline in the pack.
A kickstart attaches multiple MCPs over its lifetime; attaching them all
up-front wastes tokens for the early read-only phases AND breaks the cache
when each one is added.

Recommended phasing (matches `modes/kickstart` step order):

| Phase | What you do | MCP servers needed |
|---|---|---|
| 1 — State verification | Read `corpus-state.yaml`, propose resume | **none** |
| 2 — Pack structure check | Verify `.github/skills/`, `scripts/` | **none** |
| 3 — Meta files init | Create `discovery-coverage.md`, `code-pipeline-state.yaml` | **none** |
| 4 — Multi-repo detection | Interview operator, read git remotes | **none** |
| 5 — Code pipeline P1 → P3 | Code tree inventory, logical boundaries, feature candidates | **none** (filesystem + `gh` if local) |
| 6 — Pipeline P4 → P9 | Deep code analysis | repo MCP only |
| 7 — Atlassian discovery | First Jira/Confluence pass | **attach Atlassian here** |
| 8 — Production discovery | Dynatrace baseline | **attach Dynatrace here** |
| 9 — Custom sources | SQL/API connectors per inventory | **attach as needed** |

**Rule**: do not attach an MCP for a phase that doesn't need it. Attach
incrementally **between** phases, never inside one.

For consumers using `claude mcp add` / `claude mcp remove`, do this
between operator turns (cache is invalidated downstream regardless — the
goal is to do it at a tour boundary, not mid-tool-call).

---

## Pre-session readiness checklist

Run this once before starting `corpus`, `developer` or `reliability-analyst`:

- [ ] Model picked (`/model sonnet` typically)
- [ ] All MCP servers needed for the current phase attached (`/mcp list`)
- [ ] No pending edit to `AGENTS.md` or agent personas
- [ ] If long session expected: `ENABLE_PROMPT_CACHING_1H=1`
- [ ] `.claudeignore` in place (see `.claudeignore.template`)

---

## What this saves (order of magnitude)

Measured impact ranges from public state-of-the-art (mai 2026):

- Staying on one model: −15 to −30 % vs. switching mid-session
- Pre-staging MCPs vs. attaching during: −30 to −50 % on the kickstart amorçage
- Stable `AGENTS.md` + persona: +++ cache-hit rate (cumulative across all
  subsequent tours)
- `.claudeignore` properly tuned: −15 to −25 % on consumer-side exploration

Cumulative gain on a disciplined kickstart vs. a naive one: typically
**−50 % to −70 % of input tokens billed**.

---

## See also

- `meta/brainstorms/2026-05-24-token-cost-reduction.md` — full analysis
- `scripts/estimate-token-cost.mjs` — pack-side measurement
- `.claudeignore.template` — consumer-side ignore baseline
