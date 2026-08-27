# Application Corpus Agent Pack

> Your AI agents re-discover the codebase on every session. This pack gives them a knowledge base to read instead.

[![Open Knowledge Format v0.1 compliant](https://img.shields.io/badge/OKF-v0.1%20compliant-2ea44f)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
&nbsp;[![Built on Agent Skills](https://img.shields.io/badge/Agent%20Skills-open%20standard-blue)](https://agentskills.io)
&nbsp;[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)

Copy the pack into any repository, run the `Corpus` agent, and it retro-documents the application into a **corpus**: a versioned markdown knowledge base — features, APIs, data model, integrations, architecture diagrams — that lives in `doc/` next to the code and stays true as the code changes.

It capitalizes on **two things at once**:

- **the code**, walked file by file as the spine and the highest-ranked source of truth;
- **every source your team already has** — Jira, Confluence, Dynatrace,
  CloudWatch, databases, GitHub, CI/CD, dashboards and peer corpora — reached
  through whichever declared read-only transport is usable for this run: MCP,
  API, CLI, SQL, clone or export. MCP is an adapter, not the source itself.

Everything converges into one knowledge base, and every claim carries its source and confidence. When a source contradicts the code, the code wins and the contradiction is logged.

Stack-agnostic (Java, PHP, Angular, Node.js, Python, .NET, monolith or multi-repo). No SaaS, no index to host: the corpus is plain markdown your team owns.

![Corpus dashboard — coverage, pipeline progress and maturity at a glance](https://raw.githubusercontent.com/benjamin-blanchet/application-corpus-agent-pack/main/docs/screenshots/overview.png)

## Quick start

From the root of the repository you want to document:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply
```

Open the repo in an IDE with GitHub Copilot custom agents, select the **`Corpus`** agent, and say:

```text
init the corpus
```

The agent answers with a state report — adoption stage, status of each analysis pass, source coverage, next bounded action — then starts documenting. Drop `--apply` for a dry-run.

Works the same on every Copilot surface: the VS Code picker, the agents tab on github.com, `/agent` in the Copilot desktop app, the Copilot CLI. Skip the selection and just state your intent — `copilot-instructions.md` routes you to the right role. → [Installation & upgrade](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/installation.md)

## The problem it solves

| Without a corpus | With a corpus |
|---|---|
| Every agent session re-explores the repo, burning tokens and guessing | Agents read a pre-built map and get to work |
| Documentation drifts from the code within weeks | The corpus is rebuilt **from the code**, which always wins over docs |
| What you know is scattered across the repo, Jira, Confluence, APM dashboards, databases and people's heads | Logical source contracts and runtime adapters feed one corpus, each claim tagged with its origin and confidence |
| Cross-application flows are tribal knowledge | Each app declares its boundary; boundaries recompose into an ecosystem graph |
| Agent output dies with the session | The corpus is a versioned team asset that deepens run after run |

## What it produces

- **An exhaustive, evidence-backed map of the application** — features, APIs, batches, integrations, persistence, messaging — produced by a deterministic **9-pass pipeline (P1 → P9)** where each pass blocks the next. → [Pipeline](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/pipeline.md)
- **Architecture diagrams generated from code** — modules, layers, C4 context, sequence flows, messaging topology, ER — inline mermaid, never imported from a drifting wiki.
- **A ranked source-of-truth model** — 8 levels, code first. Production, Jira, Confluence and dashboards *enrich*; when they disagree with code, code wins, and the contradiction is logged. → [Corpus model](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/corpus-model.md)
- **Knowledge captured from every declared source** — what production does
  (APM/logs), what data looks like, why it was built that way (tickets/docs/PRs)
  and what neighbours expose. Durable contracts state requirements and safe
  transports; each run probes its actual local capabilities and records explicit
  partial coverage — **no silent fallback and no persisted “available now”**.
  Every claim carries `source:` and `confidence:`. → [Sources & runtime access](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/sources-and-mcp.md)
- **A spec-to-draft-PR software factory** — deterministic scheduling and gate
  invalidation, bounded role capabilities, independent review/correction,
  mandatory corpus closeout, SHA-bound acceptance, replayable Playwright
  evidence and draft-only delivery. Acceptance campaigns stay blocked until you
  wire an isolated executor — the pack refuses to run candidate code it cannot
  contain, and says so rather than passing. → [Software factory V3](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/software-factory.md)
- **A cross-application view** — a machine-readable boundary contract per app, recomposed into an inbound/outbound ecosystem graph that surfaces orphan events and contract drift. → [Ecosystem](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/ecosystem.md)
- **Hard quality gates** — `node scripts/validate-corpus.mjs` fails the build on out-of-order passes, missing diagrams, undocumented features or premature adoption claims. Nothing is "done" on the agent's word alone.
- **Portable output** — every corpus is an [Open Knowledge Format v0.1](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/standards.md#open-knowledge-format-okf-v01) bundle, readable by any OKF-aware agent without SDK or integration.

## How it works

1. **Install** — one `npx` command copies the pack into your repo (agents, skills, scripts, corpus skeleton).
2. **Declare sources** — the wizard records logical needs, mappings, policies
   and acceptable transports. The current run probes its own adapters before
   use; that observation is not global corpus state. → [Sources & runtime access](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/sources-and-mcp.md)
3. **Kickstart** — the `Corpus` agent runs the P1 → P9 pipeline over the whole repository, interviewing you per feature where the code is ambiguous, and cross-checks what the connected sources say.
4. **Enrich** — focused runs deepen the corpus along a persistent roadmap: production reality, batch health, Jira trajectory, code/prod reconciliation. → [Continuous enrichment](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/continuous-enrichment.md)
5. **Adopt** — once validation and the corpus gate pass, analysts, developers,
   reviewers, acceptance and reliability roles work from the corpus. For a
   change, the Factory Controller coordinates them through to draft-PR Delivery.
   → [Agents & workflow](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/agents-and-workflow.md)

## See it

`scripts/build-corpus-site.mjs` renders any corpus into a single self-contained HTML dashboard. The views below come from a fictional [demo corpus](https://github.com/benjamin-blanchet/application-corpus-agent-pack/tree/main/examples/demo-corpus).

**Inbound / outbound — the application's place in the information system**, rendered from integration data, not hand-drawn:

![Inbound/outbound context view](https://raw.githubusercontent.com/benjamin-blanchet/application-corpus-agent-pack/main/docs/screenshots/inbound-outbound.png)

**Features** — each documented feature with status, criticality and summary:

![Features view](https://raw.githubusercontent.com/benjamin-blanchet/application-corpus-agent-pack/main/docs/screenshots/features.png)

```bash
node scripts/build-corpus-site.mjs --doc examples/demo-corpus/doc --out examples/demo-corpus/index.html
```

## What makes it different

Most code-documentation tools stop at the repository and produce a one-shot dump. This pack contributes:

- An **enforced truth ranking** — not a convention, a validator gate plus a reconciliation ledger.
- A **fully specified pipeline** with mandatory diagrams and hard gates, not a prompt pattern.
- A **persistent, governed corpus** designed to be maintained over months by a team.
- A **code spine enriched through transport-neutral source contracts**, with
  runtime access kept ephemeral and every result reconciled back against code.
- **Token cost treated as a design constraint of the pack itself** — measured progressive disclosure (−34% on the always-on bootstrap surface) plus `corpus-load`, a deterministic retriever that serves the best corpus slices fitting a token budget. → [Token-cost discipline](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/token-cost.md)
- **OKF conformance with a premium layer on top** — a generic agent reads the standard markdown; a pack-aware agent reads the confidence metadata, boundary contract and ecosystem graph riding above it.

## Documentation

| Guide | Contents |
|---|---|
| [Installation & upgrade](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/installation.md) | Install, in-place upgrade, safety rules, manual/offline install, Copilot surfaces, multi-repo workspaces, what gets copied |
| [Analysis pipeline (P1 → P9)](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/pipeline.md) | The 9 passes, per-brick interviews, mandatory diagrams, readiness gate, validation |
| [Corpus model](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/corpus-model.md) | Source-of-truth ranking, corpus tree, design principles |
| [Continuous enrichment](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/continuous-enrichment.md) | Roadmap, graph, run ledger, enrichment recipes, subagents, governance |
| [Agents & workflow](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/agents-and-workflow.md) | Human-facing roles, corpus-first development loop and skill families |
| [Software factory V3](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/software-factory.md) | Event-derived control plane, roles/capabilities, environment, acceptance evidence and draft-PR delivery |
| [Sources & runtime access](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/sources-and-mcp.md) | Durable source contracts, ephemeral runtime probes, historical coverage, guardrails |
| [Ecosystem](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/ecosystem.md) | Peer corpora, boundary contract, cross-application graph |
| [Standards & references](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/standards.md) | OKF v0.1, Agent Skills, agent-engineering references |
| [Token-cost discipline](https://github.com/benjamin-blanchet/application-corpus-agent-pack/blob/main/docs/token-cost.md) | What the pack does, what you do, how to measure |

Local operating guides shipped into your repo: [`AGENTS.md`](AGENTS.md) and [`KICKSTART.md`](KICKSTART.md).

## License

MIT — see [LICENSE.md](LICENSE.md). Free to use, copy, modify and redistribute, including commercially; keep the copyright notice.

**Content note:** the pack ships generic templates, agents and skills only — no secrets, no proprietary application knowledge. That knowledge is added **locally** once the pack is copied into a target repository. Keep any enriched corpus out of shared or public copies of the pack.
