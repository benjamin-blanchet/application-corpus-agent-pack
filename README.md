# Application Corpus Agent Pack

> Install a reusable agent base in an application repository, then let the
> `Corpus` agent turn that base into application-specific knowledge.

[![Open Knowledge Format v0.1 compliant](https://img.shields.io/badge/OKF-v0.1%20compliant-2ea44f)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
&nbsp;[![Built on Agent Skills](https://img.shields.io/badge/Agent%20Skills-open%20standard-blue)](https://agentskills.io)
&nbsp;[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io)

The pack supplies agents, skills, validators and local templates. After
installation, the `Corpus` agent analyzes the target application and writes a
versioned Markdown corpus under `doc/`: features, APIs, data, integrations,
architecture, runtime knowledge and decision history.

The pack is stack-neutral and has no hosted index. Normal use after
installation can remain fully offline.

## Quick start

From the application repository, preview first:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile core
```

Review the plan, especially conflicts with existing agent instructions, then
apply it:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile core --apply
```

`core` is the default, so `--profile core` may be omitted. The installer never
claims a pre-existing file merely because its path is managed by the pack. It
preserves conflicts and places the proposed incoming version under
`.corpus-pack/incoming/<version>/` for review.

Select the `Corpus` agent and say:

```text
init the corpus
```

The first response verifies existing state and proposes the next bounded
action. The full analysis is resumable across sessions.

## Pack versus constructed corpus

These are two different objects:

| Object | What it contains | Expected state |
|---|---|---|
| Pack source / fresh installation | Generic, application-independent agents, skills, templates and safety gates | It does not yet know how to build, run or accept your application. |
| Constructed corpus | Knowledge and local contracts produced from this application's code, sources and operator decisions | It can progressively unlock application-specific workflows. |

The generic pack must not pretend it can run an unknown application. Its job is
to provide the safe machinery from which a real corpus is built.

## Profiles

Only `core` is active by default. The other profiles are optional and can be
enabled later without downloading the pack again.

| Profile | Contents | Use it when |
|---|---|---|
| `core` | Corpus agent, P1→P9 code analysis, governance, validation, navigation and local templates | You want to build or maintain the application corpus. |
| `sources` | Source onboarding and adapters for Jira, Confluence, observability, databases, APIs and peer corpora | You want to enrich the code-derived map with external evidence. |
| `factory` | Functional analysis, planning, implementation, review, acceptance and draft delivery roles | You want the corpus-driven software factory. |

Install a profile directly during a connected sync:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile sources --apply
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile factory --apply
```

Profile dependencies are applied automatically; `core` always remains active.

## Offline after installation

The first installation stores the optional profiles locally:

```text
.corpus-pack/
├── install-state.json
├── manifest.json
└── bundles/
    ├── sources.bundle.json.gz
    └── factory.bundle.json.gz
```

List or enable them with the installed local CLI:

```bash
node scripts/cli.mjs profile list
node scripts/cli.mjs profile status
node scripts/cli.mjs profile enable sources       # preview
node scripts/cli.mjs profile enable sources --apply
node scripts/cli.mjs profile enable factory --apply
```

These commands read verified local bundles and do not fetch the pack
repository. Network access is needed only when an operator explicitly requests
a newer pack version or when an application source itself requires network
access.

An activation with unresolved file conflicts stays `pending review`, not
partly active. Merge or accept the proposed files under
`.corpus-pack/incoming/<version>/`, then rerun the activation.

## Evidence model

Code is the structural spine of the corpus, not a universal answer to every
question. Every disputed or time-sensitive claim is scoped:

- `implementation`: code, migrations, configuration and tests at a named
  revision;
- `runtime`: deployed revision, effective configuration and observation in a
  named environment;
- `intent`: approved specification, criteria and explicit decisions;
- `history`: dated tickets, PRs, commits, decisions, interviews and docs.

This lets the corpus say, without contradiction, that production currently
runs behavior X at SHA `abc`, while the next revision implements behavior Y.
See [Corpus model](docs/corpus-model.md).

## What a constructed corpus provides

- A deterministic nine-pass analysis from repository inventory through
  feature deep dives and reconciliation.
- Evidence-backed architecture, feature, API, persistence and integration
  knowledge.
- Explicit source coverage and confidence instead of silent fallbacks.
- A persistent roadmap, graph and run ledger for continuous enrichment.
- Deterministic validation and a self-contained HTML dashboard.
- Portable Open Knowledge Format Markdown owned by the team.

Detailed procedures live in skills and are loaded only when needed. Permanent
instructions stay short, and `scripts/corpus-load.mjs` retrieves targeted
corpus slices for a task.

## Software factory and acceptance

The optional `factory` profile starts blocked at acceptance until the
constructed corpus declares a real isolated executor. This is correct for the
generic pack: it cannot safely guess how to run arbitrary candidate code.

A project may provide a protected module such as:

```text
.corpus-pack/local/executors/company-sandbox.mjs
```

and select it with the repository variable `FACTORY_EXECUTOR_PROVIDER` or the
documented `--executor-provider` option. The module exports:

```js
export const apiVersion = 1;
export async function executeAcceptance(request) { /* delegate externally */ }
```

It must delegate to a real isolated sandbox/broker and return the closed
structured contract containing `schema_version`, `provider`, `binding`,
`boundary`, `attestation`, `observation`, `results`, `lifecycle` and `adapter`.
No demonstration or permissive executor is shipped. Without an attested
provider, acceptance, release readiness and draft delivery remain blocked.
See [Software factory](docs/software-factory.md).

## Safety and upgrades

- Always run sync without `--apply` first.
- Pin releases (`#v1.1.0`) for reproducible installation.
- Existing project files are preserved unless their prior pack ownership is
  proven by `.corpus-pack/install-state.json` and the operator accepts any
  local drift.
- Existing corpus knowledge is not replaced by pack upgrades.
- Local conflicts are reviewable under `.corpus-pack/incoming/`; recoverable
  backups are retained for accepted replacements.
- Use `governance/pack-upgrade` after an installed pack version changes.

See [Installation and upgrade](docs/installation.md).

## Documentation

| Guide | Contents |
|---|---|
| [Installation and upgrade](docs/installation.md) | Profiles, preview/apply safety, offline activation and migration. |
| [Analysis pipeline](docs/pipeline.md) | P1→P9, diagrams, interviews and gates. |
| [Corpus model](docs/corpus-model.md) | Corpus structure and scoped evidence authority. |
| [Sources and runtime access](docs/sources-and-mcp.md) | Durable contracts, ephemeral probes and transports. |
| [Continuous enrichment](docs/continuous-enrichment.md) | Roadmap, graph, runs and governance. |
| [Agents and workflow](docs/agents-and-workflow.md) | Human-facing roles and lifecycle. |
| [Software factory](docs/software-factory.md) | Control plane, executor boundary, acceptance and draft delivery. |
| [Ecosystem](docs/ecosystem.md) | Peer corpora and cross-application graph. |
| [Standards](docs/standards.md) | OKF, Agent Skills and references. |

Local operating guides: [AGENTS.md](AGENTS.md) and [KICKSTART.md](KICKSTART.md).

## License

MIT — see [LICENSE.md](LICENSE.md).

The pack contains generic machinery only. Application knowledge is produced
locally in the target repository and should follow that repository's access
and publication rules.
