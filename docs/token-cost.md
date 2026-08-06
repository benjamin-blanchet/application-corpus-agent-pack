# Token-cost discipline

← [Back to README](../README.md)

Most agentic packs treat token cost as a runtime concern. This one treats it as a **design constraint of the pack itself** — built in and measured. Every byte added to `AGENTS.md`, a persona or a `SKILL.md` is multiplied by `tours × sessions × consumers`, so the pack keeps that always-on surface as small as possible while preserving full functional depth via progressive disclosure.

## What the pack does for you

- **Progressive disclosure across all skills.** Every `SKILL.md` carries a Skills 2.1 frontmatter (`name`, `category`, `description`). The runtime only loads the short metadata (~40 tokens per skill) at session start, and the body of a skill **only when the skill is actually invoked**. Large skills are split into `SKILL.md` + `procedure-*.md` + `references/*.md` so even an invocation does not load the full body unless every sub-procedure applies.
- **Index-style top-level files.** `AGENTS.md` is a pointer-only index (~1 700 tokens), not an encyclopedia. Detail lives under `doc/_agents/` and is loaded only when an agent or the operator needs it.
- **Slim agent personas.** The two large personas (`corpus`, `developer`) carry only invariants (hard rules, source priority, dispatch table, end-of-run contract). Detailed procedures live in dedicated mode skills (`modes/corpus-kickstart/*`) and skill folders (`development/*`).
- **Cache-aware structure.** Anything that changes often (`_meta/*`, roadmap state) is loaded on-demand by a mode skill, not by the persona. The leftmost slice of the context chain stays stable across tours, keeping the prompt cache hot and `cache_read` rates (~10 % of full input) instead of cache_write.
- **Bundled `.claudeignore.template`** that excludes `node_modules`, build dirs, lockfiles, logs, secrets and other token-eaters from Claude's auto-scan. Typical impact on a consumer repo: −15 to −25 % on exploration sessions.

## Budgeted context retrieval

Progressive disclosure keeps the *always-on* surface small; for the *on-demand* surface, the pack ships `scripts/corpus-load.mjs` — a deterministic, read-only retriever. Given a task (plus optional feature or workspace-path hints) it scores the corpus, then serves the highest-relevance slices that fit a token budget and lists what it dropped, so nothing is silently hidden. An agent gets a routed slice instead of opening files by hand:

```bash
node scripts/corpus-load.mjs --task "payment capture refund" --budget 2000
node scripts/corpus-load.mjs --feature billing --content      # full slice bodies
node scripts/corpus-load.mjs --task "..." --json              # machine output
node scripts/corpus-load.mjs --task "..." --expand            # ignore the budget
```

Scoring favors title/description/path matches over body keywords, then applies priors that rank code-derived application knowledge above navigation and meta scaffolding, and weights by the `confidence` of each slice — so a `confirmed`, code-sourced feature note outranks an `unknown` index. Token estimates use the same `ceil(chars / 3.5)` unit as the cost report below, so `--budget` speaks the same currency.

## What you do to maximize the saving

`doc/_meta/agent-cache-discipline.md` (copied into your repo at install time) carries the operator playbook:

- Pick a model before starting and stay on it — switching mid-session blows the cache.
- Pre-attach MCP servers **between** phases of a kickstart, never during a tour. The pack defines an explicit staging strategy.
- Treat `AGENTS.md` and agent personas as immutable for the session.
- `/compact` at natural task boundaries; `/clear` when switching to unrelated work.
- For sessions > 1 h, enable `ENABLE_PROMPT_CACHING_1H=1`.

## Measure your own gains

The pack ships `scripts/estimate-token-cost.mjs`. Run it after install to baseline the always-on surface, then again after any change to personas or top-level files:

```bash
node scripts/estimate-token-cost.mjs --baseline   # snapshot current state
# ... make changes ...
node scripts/estimate-token-cost.mjs --compare    # see the delta in tokens and %
```

## Reference numbers (this pack, 2026-05-24)

| Surface | Before | After | Delta |
|---|---|---|---|
| Always-on bootstrap per session | 42 248 tokens | 27 672 tokens | **−34.5 %** |
| `AGENTS.md` | 7 521 tokens | 1 747 tokens | **−77 %** |
| `corpus.agent.md` | 11 840 tokens | 2 831 tokens | **−76 %** |
| `developer.agent.md` | 8 087 tokens | 2 965 tokens | **−63 %** |
| Production-discovery skill body | 4 733 tokens | 1 250 tokens (SKILL.md) + on-demand procedures | **−74 %** on SKILL.md |
| Worst case (all skill bodies loaded) | 173 511 tokens | 162 100 tokens | −6.6 % |

On a 30-tour session, the bootstrap delta alone saves ~437 k input tokens in cache misses. The compound effect with stable cache discipline (model fixed, MCP pre-staged, persona immutable) typically pushes the total saving on a kickstart-class session into the **−50 to −70 %** range on input tokens billed.
