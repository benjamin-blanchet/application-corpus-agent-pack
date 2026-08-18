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
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.0.0 sync --apply
```

## Upgrade safety

- `doc/` (your corpus) is **never** overwritten, even with `--force`.
- A locally-modified agent under `.github/agents/` is never overwritten without confirmation (you are prompted per file; non-interactive runs preserve it and flag it in the upgrade report).
- Pack-owned files (skills, helper scripts, root index files, `AGENTS.md`, `KICKSTART.md`, `.github/copilot-instructions.md`) are refreshed to the new version — do not edit them. Put repository-specific Copilot instructions in `.github/instructions/*.instructions.md`, which the pack never ships or touches.
- Every run writes a `doc/_meta/pack-*.md` report.

Once the pack is in place, the consumer repo can self-upgrade later without `npx`:

```bash
node scripts/update-pack.mjs --from-github --apply          # latest
node scripts/update-pack.mjs --from-github=v1.0.0 --apply   # pinned
```

<details>
<summary>Manual install (no Node / offline)</summary>

Copy the pack files into the target application repository — `.github/`, `doc/`, `scripts/`, `schemas/`, `AGENTS.md`, `KICKSTART.md` and `PACK_VERSION` (everything in this repository except `README.md`, `LICENSE.md`, `docs/`, `examples/` and Git/Node metadata).

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

The pack ships four human-facing roles. Every current surface lets you select one explicitly:

| Surface | How to select the role |
|---|---|
| VS Code Chat | agent picker, or `@corpus` in the chat input |
| github.com | dropdown in the agents tab / panel, or on issue assignment |
| GitHub Copilot app (desktop) | type `/agent` in a session |
| GitHub Copilot CLI | custom agent selection supported |
| JetBrains / Eclipse / Xcode | agent picker (public preview) |

If you skip the selection and simply state your intent ("init the corpus", "impact analysis on X"), `copilot-instructions.md` routes you to the right role anyway — but the write boundary is then a contract the model holds rather than a tool-level restriction, so prefer selecting the agent.

The three read-only roles (`functional-analyst`, `corpus`, `reliability-analyst`) never touch source code, so non-developers can use them safely — in the Copilot app, run sessions in Interactive or Plan mode, not Autopilot.

Details and the re-anchoring footer: [doc/_agents/copilot-surfaces.md](../doc/_agents/copilot-surfaces.md).

## Multi-repo workspaces

When VS Code opens several sibling repositories together (e.g. `front` + `lib` + `deploy`), `foundations/multi-repo-workspace-detection` runs at the very start of kickstart, before role detection. It disambiguates monorepo from multi-repo, probes the filesystem and any `*.code-workspace` file for siblings, and interviews the operator to capture the workspace architecture in `doc/_meta/app-profile.yaml` and `doc/_meta/corpus-state.yaml`.

The captured architecture is then used to scope work per repo role, link cross-repo nodes in `doc/_graph/edges.yaml`, and prevent silent desynchronization between sibling corpora.

## What gets copied

```text
.github/agents/       human-facing custom agents (Corpus, Developer, Functional Analyst, Reliability Analyst)
.github/skills/       reusable technical skills, grouped by intent (foundations, pipeline, actionable, continuous, exploration, governance, sources, authoring, development)
.github/prompts/      optional prompt files, including subagent-assisted coverage
.github/templates/    corpus templates and reusable documentation patterns
scripts/              deterministic corpus utilities (validation, peer sync, ecosystem recomposition)
schemas/              canonical path manifest and machine-readable schemas the validator enforces
doc/                  application knowledge corpus skeleton
AGENTS.md             local operating guide for humans and agents
KICKSTART.md          first-run and continuous enrichment instructions
PACK_VERSION          pack version stamp (used by upgrade tooling)
```
