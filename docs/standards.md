# Standards & references

← [Back to README](../README.md)

The pack is built on top of widely-recognized 2026 references rather than reinventing primitives. It composes them into a domain-specific methodology for enterprise codebase corpus.

## Open Knowledge Format (OKF) v0.1

Every corpus this pack produces is an [**Open Knowledge Format**](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) bundle (Google Cloud, June 2026): a directory of markdown files with YAML frontmatter, vendor-neutral, version-controllable, readable by humans and parseable by any OKF-aware agent — no SDK, no integration, no translation layer. This makes a corpus directly consumable by an agent that lives **outside** it: a consumer can discover, navigate and query corpora across the whole ecosystem with one reader, regardless of which tool produced each bundle.

- **Conformance, not migration.** The corpus already met OKF's only hard rule (a non-empty `type` on every document). Compliance is **additive** — the pack's richer fields (`status`, `confidence`, `source`, `related_*`) are legal OKF extra keys and remain a premium layer *on top of* the standard baseline. Nothing is renamed or lost.
- **Compliant out of the box, and on upgrade.** A freshly kickstarted corpus ships conformant; existing corpora gain conformance through the normal `governance/pack-upgrade` flow. The mechanism is deterministic, additive and idempotent (`scripts/build-okf-indexes.mjs`, `npm run okf`): it emits the reserved `index.md` listings, backfills the standardized OKF fields where derivable, and stamps `okf_version` — never rewriting prose, never inventing a `type`.
- **Gated.** [`validate-corpus.mjs`](pipeline.md#corpus-validation) hard-fails (P0) any concept document missing a `type`, so OKF conformance is enforced, not aspirational.

The machine-readable `boundary.yaml` and the `_graph/` knowledge graph stay as the pack's premium layer beyond the OKF surface; `architecture/BOUNDARY.md` is their OKF-visible projection.

## Agent Skills open standard (Anthropic, Dec 2025 → open March 2026)

Every skill in `.github/skills/<category>/<slug>/SKILL.md` follows the [Agent Skills](https://agentskills.io) format: a folder containing a `SKILL.md` with name, description and instructions. **Progressive disclosure** is the design principle — skills are loaded by the agent on demand, never all at once. The 30+ tools that adopted the standard (Claude Code, Gemini CLI, Junie, Kiro, Goose, etc.) can therefore consume these skills.

## Karpathy's four rules (CLAUDE.md, January 2026)

The four rules widely cited as the discipline baseline for LLM coding agents are encoded in `foundations/core-discipline` and applied by every human-facing agent:

| Rule | Mechanism in this pack |
|---|---|
| **Think before acting** — state assumptions, ask when ambiguous | `governance/blocking-question-loop`, `confidence: confirmed/probable/unknown` frontmatter, Developer Step 5b spec validation gate |
| **Simplicity first** — minimum that solves the problem, nothing speculative | `development/change-triage` (depth matches size), `authoring/implementation-guard` |
| **Surgical changes** — touch only what is required, clean up only your own mess | Developer Step 8 timing rule, `SUGGESTIONS.md` discipline, routing matrix in `development/corpus-closeout-delegation` |
| **Goal-driven execution** — define success criteria, loop until verified | Validator hard gates (P0/P1/P2 in `scripts/validate-corpus.mjs`), `actionable/readiness-gate`, `governance/post-kickstart-completeness-audit`, `development/verify-by-change-type` |

## Anthropic — Building Effective Agents (Dec 2024 + 2026 updates)

The five canonical workflow patterns are composed throughout the pack:

| Pattern | Used in the pack |
|---|---|
| Prompt chaining | The P1→P9 code analysis pipeline — each pass blocks the next |
| Routing | Corpus kickstart-mode trigger detection (open phrasing → correct mode) |
| Parallelization | `actionable/subagent-coverage-orchestration` + 5 brick subagents |
| Orchestrator-workers | `Corpus` as orchestrator; subagents and `Developer` Step 10.4 auto-invocation as workers |
| Evaluator-optimizer | `scripts/validate-corpus.mjs` + `actionable/readiness-gate` + `continuous/corpus-run-audit` |

## Context engineering discipline (industry consensus, 2026)

The pack treats the context window as a budget. The five canonical strategies are built into its structure:

- **Selection** — indexes, graph and roadmap so agents read only the relevant corpus slice.
- **Compression** — pre-computed catalogs (`apis/CATALOG.md`, `domain/ENTITIES.md`, etc.) and edges (`doc/_graph/edges.yaml`) instead of raw file scans.
- **Ordering** — mandatory state files first (per-agent "First reads"), then task-specific slice.
- **Isolation** — internal subagents for broad read-only coverage so the main agent's context stays clean.
- **Format** — scan-friendly artefacts (tables, frontmatter, `foundations/corpus-status-footer`) cheap to re-read across runs.

## Connected information sources

`sources/mcp-source-wizard`, `sources/runtime-source-probe`, the durable source and coverage contracts, and the bounded query catalogs (`doc/mcp/atlassian-query-catalog.md`, `doc/mcp/dynatrace-query-catalog.md`) wire the corpus to Jira, Confluence, Dynatrace and custom sources without turning a session capability into persistent state. See [Sources & runtime access](sources-and-mcp.md).
