---
name: core-rules
category: foundations
description: "Shared rules for every agent: do not invent facts, detect actual stack, use confidence metadata, protect secrets, separate facts from hypotheses, and route durable knowledge through Corpus."
---
# Core Rules

## Purpose

Shared rules for every agent: do not invent facts, detect actual stack, use confidence metadata, protect secrets, separate facts from hypotheses, and route durable knowledge through Corpus.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Required behavior

1. Read `doc/CORPUS_MAP.md` before creating or moving corpus content.
2. Use `doc/CORPUS_MANIFEST.md` for conventions.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Use frontmatter metadata for important corpus files.
6. Update indexes when canonical files are created or renamed.
7. Record unresolved questions in `doc/_meta/open-questions.md`.
8. Reconcile affected files instead of appending contradictions.
9. Use `governance/safe-operation-guardrails` before high-risk, destructive, broad or external side-effect actions.
10. Register non-standard sources in `doc/_meta/information-sources.yaml` before using them for durable claims.
11. Apply the source priority rule (below) on every disagreement between sources.

## Source priority (truth ranking)

When two sources disagree about how the application behaves, resolve in this order:

| Rank | Source | Why |
|---|---|---|
| 1 | **Repository code** (current main/default branch) | What runs is the truth. Code does not lie about behavior. |
| 2 | **Database migrations + runtime configuration** | Same reason: executed by the system. |
| 3 | **Production observability** (Dynatrace/APM/logs/metrics) | Real-world evidence of runtime behavior. |
| 4 | **Tests** | Encode intended behavior, but may be stale; still strong. |
| 5 | **Operator interview answers** | Strong on intent and history; weaker on current behavior than code. |
| 6 | **Jira tickets, PRs, commit messages** | Capture intent at a point in time; rot quickly. |
| 7 | **Confluence and other written documentation** | Drifts. **Treat with caution by default.** Useful for history, glossary, intent — never as ground truth for current behavior unless reconciled with a higher-rank source. |
| 8 | **Anything else** (chat, tribal knowledge, dashboards without source) | Hypothesis only. |

Operational rules:

- When code and Confluence disagree about current behavior, **code wins**. Update the corpus with the code-backed version, record the Confluence claim under "Historical / Confluence-stated (does not match code)" with the page reference and date, and open an interview question if the divergence may indicate a documentation defect that the team should fix.
- Never copy a Confluence page into the corpus as confirmed truth. If a fact comes only from Confluence, mark `confidence: probable` (not `confirmed`) and source `confluence`.
- Mark frontmatter `confidence: confirmed` only when the highest-rank source supporting the claim is rank 1–3 (code, runtime config, production), or when an interview answer is corroborated by code.
- A "design intent" claim (why something exists) can come from Confluence or operator interview at `confidence: probable`; a "behavior" claim cannot, unless reconciled with code.
- During reconciliation (`pipeline/p9-code-reconciliation-gate`), apply this ranking explicitly. Record the rank that won.

## Code-first principle (load-bearing)

The pack's core value proposition — and what distinguishes it from generic RAG-on-Confluence or scan-Dynatrace approaches — is **crossing code knowledge with production observability, in that order**:

- **Code is the foundation.** The repository code is rank 1 (truth) and the canonical baseline of corpus understanding. Without a covered P1→P9 code analysis pipeline, the corpus has no spine.
- **Production enriches code knowledge — not the other way around.** Dynatrace, logs, metrics, traces, batch health are read **in the light of** the code structure, integration map, error-handling patterns and feature catalog produced by P1→P9. Production findings are interpreted against code; code is not interpreted against production.
- **Without P1→P9 covered, every other lane is reduced-capability.** A production signal without a code-derived integration map is just noise; a Jira ticket without a feature folder is just text; a Confluence page without a code anchor is just history. The agent can collect these, but it cannot **make sense** of them with the same depth.

Behavioral consequences (enforced by `foundations/core-discipline`, the prod-flavored exploration skills and the Continuous Enrichment mode of the Corpus agent):

- When `corpus.code_analysis_status != covered` and an operator request would otherwise pull the agent deep into production/Jira/Confluence work, the agent **must** surface this state, bound the requested work to a single artefact (snapshot or short investigation), and propose returning to code analysis as the next action.
- Findings produced while `code_analysis_status != covered` are marked at `confidence: probable` at best — they describe what is observed but cannot describe what is *meant* without code corroboration.
- The agent never substitutes production discovery for code analysis. A rich Dynatrace surface is not an excuse to skip P1→P9; it is exactly the moment when P1→P9 becomes most valuable.
- Loop prevention: a prod-flavored skill (`exploration/production-discovery`, `exploration/dynatrace-runtime-architecture`, `exploration/production-temporal-correlation`) executes **at most one bounded pass** when code is not covered. Multi-iteration deep dives, temporal correlation across multiple windows, or repeated dynatrace pulls are not permitted until P1→P9 is `covered`.

This is not a stylistic preference. It is the principle that makes the pack's findings reliable instead of plausible.

## Stack-neutral detection hints

Look for package/build/config files and entry points such as:

- `package.json`, `pnpm-lock.yaml`, `angular.json`, `vite.config.*`, `next.config.*`
- `composer.json`, `artisan`, `symfony.lock`, PHP route/config files
- `pom.xml`, `build.gradle`, `src/main`, Java/Kotlin package structure
- `.csproj`, `.sln`, `Program.cs`, `.fsproj`
- `requirements.txt`, `pyproject.toml`, `manage.py`, `app.py`
- Dockerfiles, compose files, CI pipelines, deploy manifests
- route definitions, controllers, handlers, consumers, jobs, scripts, migrations and tests

## Output discipline

Prefer small canonical files and indexes over large monolithic documents.

## Source consumption

Do not rely only on predefined tools. Teams may expose logs, metrics, tickets, exports or business data through SQL, APIs, files or manual evidence. Register each source in `doc/_meta/information-sources.yaml`, document usage in `doc/mcp/custom-sources.md`, and route findings through the corpus with evidence and confidence.

## Safety baseline

Read-only by default. No destructive database, Git, filesystem, ticketing, CI/CD or production action unless explicitly requested and safety-gated. Prefer dry-run, diff, SELECT, preview and update candidates.
