# Installation & upgrade

← [Back to README](../README.md)

## Install

From the root of the application repository you want to document:

```bash
# preview what would change (dry-run)
npx github:benjamin-blanchet/application-corpus-agent-pack sync

# install (or upgrade) the pack in place
npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply
```

`npx` fetches the pack and copies it into the current repository — no zip, no manual paste. The **same command installs and upgrades**: on an already-equipped repo it behaves as an in-place upgrade. Pin a version once releases are tagged:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.2.0 sync --apply
```

## Upgrade safety

- Existing application corpus files under `doc/` are **never** overwritten,
  even with `--force`. The reusable executable `doc/spec/template/**` scaffold
  and pack regression ledger `doc/_meta/factory-learning.yaml` are versioned
  pack artefacts and are refreshed. Divergent previous bytes are first copied
  to `.corpus-pack-backups/<from>-to-<to>/`, an inactive recovery surface.
  Missing pack scaffolds may be added; on upgrade, a missing
  `doc/_meta/corpus-state.yaml` is deferred to the Corpus migration. The sync
  still refreshes `schemas/corpus-state.yaml.template`, so that migration can
  reconstruct the state without guessing its previous version.
- A locally-modified agent under `.github/agents/` is never overwritten without confirmation (you are prompted per file; non-interactive runs preserve it and surface it in the console summary).
- Pack-owned files (skills, prompt assets, helper scripts, schemas, executable
  `.github/templates/software-factory/**`, the two `doc/` exceptions above,
  `AGENTS.md`, `KICKSTART.md`, `.github/copilot-instructions.md`) are refreshed
  to the new version — do not edit them. Put repository-specific Copilot
  instructions in `.github/instructions/*.instructions.md`, which the pack
  never ships or touches.
- `sync` backs up, then retires, three exact obsolete pack surfaces: the MCP readiness skill
  and the V1 template files `technical-plan.yaml` / `factory-state.yaml`. The subsequent Corpus
  migration reconciles durable source facts and removes the two legacy
  persistent readiness documents. The exact retired bytes remain available
  under `.corpus-pack-backups/<from>-to-<to>/`; local skills removed for any other reason
  are only reported, never deleted automatically.
- `sync` prints a copy summary but writes no durable migration history. After
  an upgrade, invoke the Corpus agent: `governance/pack-upgrade` owns the
  version stamp, schema repair, changelog row, and `doc/_meta/pack-upgrade-*.md`
  report, including its final post-report validation.
- File replacements are atomic, but the complete multi-file sync is not a
  transaction. If it fails or is interrupted, re-run the same pinned sync;
  its operations and backups are idempotent. Do not start Corpus migration
  until sync completes successfully.
- The migration report is created first as an `in-progress` checkpoint. A
  later `continue` resumes an interrupted transition from that report, keeps
  the original `from_version`, and never duplicates its changelog row.

Once the pack is in place, the consumer repo can self-upgrade later without `npx`:

```bash
node scripts/update-pack.mjs --from-github --apply          # latest
node scripts/update-pack.mjs --from-github=v1.2.0 --apply   # pinned
```

<details>
<summary>Fresh offline install (no Node)</summary>

This fallback is for a fresh repository only, never for upgrading an existing
corpus. Do **not** copy `.github/` wholesale: active `.github/workflows/**` in
this repository are maintainer CI, not consumer scaffolds. Copy only
`.github/agents/`, `.github/skills/`, `.github/prompts/`,
`.github/templates/` and `.github/copilot-instructions.md`; copy `scripts/`,
`schemas/`, `AGENTS.md`, `KICKSTART.md` and `PACK_VERSION`. Under `doc/`, omit
every repository-development package under `doc/spec/` and retain only
`doc/spec/template/`. For an upgrade, use the safe `sync` engine so local
additions and corpus content are classified and preserved.

</details>

## First run

Open the repository in an IDE supporting Copilot custom agents and run the `Corpus` agent.

The agent recognises **any kickstart-mode trigger**, in any language — pick the phrasing that fits, the agent verifies state before doing anything. English first, with a French variant where useful:

```text
init the corpus              ·  init le corpus
run the full repo analysis   ·  fais l'analyse complète du repo
kickstart
where are we on the corpus
continue
```

The first response is a resume report: current adoption stage, roadmap state, status of each pipeline pass (P1 → P9), coverage of each source lane (Jira, Confluence, Dynatrace, custom) and the next bounded action.

When you decide the corpus is clean enough to show the team, ask for adoption guide material:

```text
prepare the adoption guide   ·  prépare le guide d'adoption
```

The adoption guide material is honest about roadmap coverage, reliable knowledge, gaps and next recommended enrichment runs.

## Selecting a role on each Copilot surface

The pack ships nine human-facing roles. Every current surface lets you select one explicitly:

`corpus`, `functional-analyst`, `planner`, `developer`,
`reliability-analyst`, `acceptance`, `factory-controller`, `code-reviewer` and
`delivery`.

| Surface | How to select the role |
|---|---|
| VS Code Chat | agent picker, or `@corpus` in the chat input |
| github.com | dropdown in the agents tab / panel, or on issue assignment |
| GitHub Copilot app (desktop) | type `/agent` in a session |
| GitHub Copilot CLI | custom agent selection supported |
| JetBrains / Eclipse / Xcode | agent picker (public preview) |

If you skip the selection and simply state your intent ("init the corpus", "impact analysis on X"), `copilot-instructions.md` routes you to the right role anyway — but the write boundary is then a contract the model holds rather than a tool-level restriction, so prefer selecting the agent.

Only `developer` may modify application source, and only after the explicit
implementation gate. Every other role has a narrower artifact, review,
control-plane, acceptance or draft-delivery surface; none can widen that
surface through a prompt. In the Copilot app, non-developers should still use
Interactive or Plan mode rather than Autopilot.

Details and the re-anchoring footer: [doc/_agents/copilot-surfaces.md](../doc/_agents/copilot-surfaces.md).

## Multi-repo workspaces

When VS Code opens several sibling repositories together (e.g. `front` + `lib` + `deploy`), `foundations/multi-repo-workspace-detection` runs at the very start of kickstart, before role detection. It disambiguates monorepo from multi-repo, probes the filesystem and any `*.code-workspace` file for siblings, and interviews the operator to capture the workspace architecture in `doc/_meta/app-profile.yaml` and `doc/_meta/corpus-state.yaml`.

The captured architecture is then used to scope work per repo role, link cross-repo nodes in `doc/_graph/edges.yaml`, and prevent silent desynchronization between sibling corpora.

## What gets copied

```text
.github/agents/       nine human-facing roles plus internal corpus subagents
.github/skills/       reusable skills (foundations, modes, pipeline, actionable, continuous, exploration, governance, sources, authoring, development)
.github/prompts/      optional prompt files, including subagent-assisted coverage
.github/templates/    corpus and software-factory templates
scripts/              deterministic corpus, factory, validation and delivery utilities
schemas/              canonical path manifest and machine-readable schemas the validator enforces
doc/                  application knowledge corpus skeleton
AGENTS.md             local operating guide for humans and agents
KICKSTART.md          first-run and continuous enrichment instructions
PACK_VERSION          pack version stamp (used by upgrade tooling)
```
