# Application Corpus Agent Pack

> Your AI agents re-discover the codebase on every session. This pack gives them a knowledge base to read instead.

[![Open Knowledge Format v0.1 compliant](https://img.shields.io/badge/OKF-v0.1%20compliant-2ea44f)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
&nbsp;[![Built on Agent Skills](https://img.shields.io/badge/Agent%20Skills-open%20standard-blue)](https://agentskills.io)
&nbsp;[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)

Copy the pack into any repository, run the `Corpus` agent, and it retro-documents the application **from the code itself** into a **corpus**: a versioned markdown knowledge base — features, APIs, data model, integrations, architecture diagrams — that lives in `doc/` next to the code and stays true as the code changes.

Stack-agnostic (Java, PHP, Angular, Node.js, Python, .NET, monolith or multi-repo). No SaaS, no index to host: the corpus is plain markdown your team owns.

![Corpus dashboard — coverage, pipeline progress and maturity at a glance](docs/screenshots/overview.png)

## Quick start

From the root of the repository you want to document:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply
```

Open the repo in an IDE with GitHub Copilot custom agents, select the **`Corpus`** agent, and say:

```text
init the corpus
```

The agent answers with a state report — adoption stage, status of each analysis pass, source coverage, next bounded action — then starts documenting. Drop `--apply` for a dry-run. No agent picker (Copilot desktop/web)? State your intent and `copilot-instructions.md` routes you. → [Installation & upgrade](docs/installation.md)

## The problem it solves

| Without a corpus | With a corpus |
|---|---|
| Every agent session re-explores the repo, burning tokens and guessing | Agents read a pre-built map and get to work |
| Documentation drifts from the code within weeks | The corpus is rebuilt **from the code**, which always wins over docs |
| Cross-application flows are tribal knowledge | Each app declares its boundary; boundaries recompose into an ecosystem graph |
| Agent output dies with the session | The corpus is a versioned team asset that deepens run after run |

## What it produces

- **An exhaustive, evidence-backed map of the application** — features, APIs, batches, integrations, persistence, messaging — produced by a deterministic **9-pass pipeline (P1 → P9)** where each pass blocks the next. → [Pipeline](docs/pipeline.md)
- **Architecture diagrams generated from code** — modules, layers, C4 context, sequence flows, messaging topology, ER — inline mermaid, never imported from a drifting wiki.
- **A ranked source-of-truth model** — 8 levels, code first. Production, Jira, Confluence and dashboards *enrich*; when they disagree with code, code wins, and the contradiction is logged. → [Corpus model](docs/corpus-model.md)
- **Live enrichment through MCP** — production observability, Jira/Confluence, CI/CD, SQL exports, peer corpora. Any MCP server is eligible as a source, with no silent fallback when a tool is not attached. → [Sources & MCP](docs/sources-and-mcp.md)
- **A cross-application view** — a machine-readable boundary contract per app, recomposed into an inbound/outbound ecosystem graph that surfaces orphan events and contract drift. → [Ecosystem](docs/ecosystem.md)
- **Hard quality gates** — `node scripts/validate-corpus.mjs` fails the build on out-of-order passes, missing diagrams, undocumented features or premature adoption claims. Nothing is "done" on the agent's word alone.
- **Portable output** — every corpus is an [Open Knowledge Format v0.1](docs/standards.md#open-knowledge-format-okf-v01) bundle, readable by any OKF-aware agent without SDK or integration.

## How it works

1. **Install** — one `npx` command copies the pack into your repo (agents, skills, scripts, corpus skeleton).
2. **Kickstart** — the `Corpus` agent runs the P1 → P9 pipeline over the whole repository, interviewing you per feature where the code is ambiguous.
3. **Enrich** — focused runs deepen the corpus along a persistent roadmap, pulling in production and project sources. → [Continuous enrichment](docs/continuous-enrichment.md)
4. **Adopt** — once validation and the readiness gate pass, the team's agents (`Developer`, `Functional Analyst`, `Reliability Analyst`) work from the corpus instead of rediscovering the repo. → [Agents & workflow](docs/agents-and-workflow.md)

## See it

`scripts/build-corpus-site.mjs` renders any corpus into a single self-contained HTML dashboard. The views below come from a fictional demo corpus ([`examples/demo-corpus/`](examples/demo-corpus/)).

**Inbound / outbound — the application's place in the information system**, rendered from integration data, not hand-drawn:

![Inbound/outbound context view](docs/screenshots/inbound-outbound.png)

**Features** — each documented feature with status, criticality and summary:

![Features view](docs/screenshots/features.png)

```bash
node scripts/build-corpus-site.mjs --doc examples/demo-corpus/doc --out examples/demo-corpus/index.html
```

## What makes it different

Most code-documentation tools stop at the repository and produce a one-shot dump. This pack contributes:

- An **enforced truth ranking** — not a convention, a validator gate plus a reconciliation ledger.
- A **fully specified pipeline** with mandatory diagrams and hard gates, not a prompt pattern.
- A **persistent, governed corpus** designed to be maintained over months by a team.
- A **code spine enriched by a live MCP source ecosystem**, then reconciled back against code.
- **Token cost treated as a design constraint of the pack itself** — measured progressive disclosure (−34% on the always-on bootstrap surface) plus `corpus-load`, a deterministic retriever that serves the best corpus slices fitting a token budget. → [Token-cost discipline](docs/token-cost.md)
- **OKF conformance with a premium layer on top** — a generic agent reads the standard markdown; a pack-aware agent reads the confidence metadata, boundary contract and ecosystem graph riding above it.

## Documentation

| Guide | Contents |
|---|---|
| [Installation & upgrade](docs/installation.md) | Install, in-place upgrade, safety rules, manual/offline install, Copilot surfaces, multi-repo workspaces, what gets copied |
| [Analysis pipeline (P1 → P9)](docs/pipeline.md) | The 9 passes, per-brick interviews, mandatory diagrams, readiness gate, validation |
| [Corpus model](docs/corpus-model.md) | Source-of-truth ranking, corpus tree, design principles |
| [Continuous enrichment](docs/continuous-enrichment.md) | Roadmap, graph, run ledger, enrichment recipes, subagents, governance |
| [Agents & workflow](docs/agents-and-workflow.md) | The four human-facing agents, corpus-first development loop, skill families |
| [Sources & MCP](docs/sources-and-mcp.md) | MCP readiness, generic sources, guardrails, activity discovery |
| [Ecosystem](docs/ecosystem.md) | Peer corpora, boundary contract, cross-application graph |
| [Standards & references](docs/standards.md) | OKF v0.1, Agent Skills, agent-engineering references |
| [Token-cost discipline](docs/token-cost.md) | What the pack does, what you do, how to measure |

Local operating guides shipped into your repo: [`AGENTS.md`](AGENTS.md) and [`KICKSTART.md`](KICKSTART.md).

## License

MIT — see [LICENSE.md](LICENSE.md). Free to use, copy, modify and redistribute, including commercially; keep the copyright notice.

**Content note:** the pack ships generic templates, agents and skills only — no secrets, no proprietary application knowledge. That knowledge is added **locally** once the pack is copied into a target repository. Keep any enriched corpus out of shared or public copies of the pack.
