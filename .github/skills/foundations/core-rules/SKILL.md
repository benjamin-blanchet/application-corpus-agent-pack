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
10. Register durable, transport-neutral source contracts in `doc/_meta/information-sources.yaml`, probe runtime capability per run, and record historical evidence in `doc/_meta/source-coverage.yaml`. Never persist current availability globally.
11. Apply the scoped source-authority rule (below) on every disagreement.

## Source authority depends on the claim

There is no universal source ranking. First classify the claim, then reconcile
sources that speak about the same scope, revision, environment and time.

| `claim_scope` | Question answered | Primary evidence |
|---|---|---|
| `implementation` | What can this revision do and how is it built? | Repository code at an explicit revision, migrations, build/runtime configuration and tests. |
| `runtime` | What is this environment doing now? | Deployed revision, effective configuration/feature flags and time-bounded production observation. |
| `intent` | What behavior is approved or expected? | Approved specification, acceptance criteria, tests and explicit operator/product decisions. |
| `history` | Why did this exist or change? | Tickets, PRs, commits, decision records, interviews and dated documentation. |

Every durable disputed or time-sensitive claim should carry enough context to
avoid false contradictions:

```yaml
claim_scope: implementation | runtime | intent | history
revision: <git-sha-or-ref>          # required when code/deployment-specific
environment: <name-or-not-applicable>
observed_at: <ISO-8601-or-not-applicable>
```

Operational rules:

- Code is the spine for mapping the application, but `main` does not prove
  current production behavior. For `runtime`, the deployed revision plus
  effective configuration and direct observation outrank undeployed code.
- For `implementation`, code at the named revision outranks prose describing
  that revision. Tests strengthen the claim but can be stale or incomplete.
- For `intent`, an approved specification can intentionally differ from the
  current implementation. Preserve both claims with their scopes.
- For `history`, dated tickets, decisions and interviews may be authoritative
  even though they do not describe current behavior.
- Confluence/Jira-only claims are not automatically false. Keep them at
  `probable` unless the relevant scope is corroborated, and retain dates/links.
- Reconcile only like with like. A runtime observation at revision `abc123`
  does not contradict implementation at `def456`; it describes another state.
- During P9, record the winning evidence for each claim scope, or keep both
  scoped claims when both are true.

`confidence: confirmed` requires direct evidence appropriate to the declared
scope. A source type alone is not enough.

## Code-first corpus construction (load-bearing)

P1→P9 remains mandatory for a primary application because code supplies the
structural spine: modules, entry points, features, integrations and change
surfaces. Production, tickets, documentation and interviews enrich that spine
and may be authoritative for runtime, intent or history claims.

When `code_analysis_status != covered`, deep non-code discovery remains
bounded and its architectural interpretation limited. The agent surfaces the
gap, records the observation with its proper scope, and returns to the code
pipeline. It never converts a rich external source into a substitute for the
missing application map.

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

## Language policy

The pack separates three language tiers — keep them distinct so the
machinery stays portable while team deliverables stay localizable:

1. **Pack machinery — English.** Agent personas (`.github/agents/**`),
   skills (`.github/skills/**`), schemas, scripts and structural templates
   are written in English. This is a shareable, stack-agnostic, Agent-Skills
   standard pack; its instructions must read in one language.
2. **Runtime conversation — the operator's language.** When responding to
   the operator (recaps, questions, status), reply in the language the
   operator writes in (e.g. French if they write in French). This is runtime
   behavior, not pack content. Kickstart trigger phrases and confirmation
   signals are recognized in any language — the examples kept in skills are
   illustrative, not exhaustive.
3. **Team deliverables — configurable, per `app-profile.yaml`
   `language_policy.team_outputs` (default `fr`).** Specs, handover material
   (`doc/_handover/**`, incl. `RAPPORT_ETONNEMENT.md`), and team-facing
   guides are produced in the team's language. The corpus knowledge body
   itself follows `language_policy.corpus` (default `en`).

Do not mix tier 1 with tier 2/3: never embed operator-language prose in a
skill or persona instruction — show an English reference and localize at
runtime.

## Source consumption

Do not rely only on predefined tools. Teams may expose logs, metrics, tickets, exports or business data through SQL, APIs, files or manual evidence. Register each durable source and transport policy in `doc/_meta/information-sources.yaml`, probe the selected transport with `sources/runtime-source-probe`, record historical evidence in `doc/_meta/source-coverage.yaml`, document usage in `doc/mcp/custom-sources.md`, and route findings through the corpus with evidence and confidence.

## Corpus output format (OKF v0.1)

The corpus is an **Open Knowledge Format** bundle
([spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)):
a directory of markdown files with YAML frontmatter, vendor-neutral and
consumable by any OKF-aware agent — including a consumer agent that lives
*outside* the corpus and reads many corpora across the ecosystem. This is a
**corpus invariant**, enforced by `scripts/validate-corpus.mjs`:

- **Hard rule (P0):** every non-reserved `.md` carries a frontmatter block with
  a non-empty `type`. The pack's richer fields (`status`, `confidence`,
  `source`, `related_*`) are legal OKF *extra keys* and remain the premium
  layer a pack-aware consumer reads on top of the baseline.
- **Reserved files** `index.md` and `log.md` are listings, not concept docs:
  no frontmatter, except the bundle-root `doc/index.md` which declares
  `okf_version`. The corpus' own uppercase `INDEX.md` / `README.md` are
  preserved — on case-insensitive filesystems they collide with `index.md`, so
  the generator never overwrites them (OKF index files are optional; a consumer
  synthesizes one on the fly).
- **Conformance is mechanical, additive and idempotent:** run
  `node scripts/build-okf-indexes.mjs` as part of the regeneration ritual
  (kickstart close, pack upgrade, quality passes), alongside
  `scripts/validate-corpus.mjs` and `scripts/build-corpus-site.mjs`. It emits
  index listings, backfills the derivable OKF fields (`title`/`description`/
  `timestamp`) only where deterministically derivable, and stamps
  `okf_version`. It never rewrites corpus prose and never invents a `type` — a
  concept doc that genuinely lacks one surfaces as a P0 for an agent/operator
  to resolve, not a guess.

The boundary surface (`doc/architecture/BOUNDARY.md`, produced by
`governance/boundary-contract`) already carries a `type` and is therefore an
OKF concept doc; the machine-readable `boundary.yaml` sidecar and `doc/_graph/`
stay as the premium layer beyond the OKF baseline.

## Safety baseline

Read-only by default. No destructive database, Git, filesystem, ticketing, CI/CD or production action unless explicitly requested and safety-gated. Prefer dry-run, diff, SELECT, preview and update candidates.
