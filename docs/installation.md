# Installation and upgrade

← [Back to README](../README.md)

## Connected installation

Run from the application repository. Preview is the default:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile core
```

Review the plan, then apply the exact same pinned version:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile core --apply
```

`core` is implicit when `--profile` is omitted. `sync` is also the upgrade
entry point; it detects the prior installation receipt and local drift.

## Profiles

| Profile | Depends on | Active by default | Purpose |
|---|---|---|---|
| `core` | — | yes | Corpus construction, P1→P9, governance and validation. |
| `sources` | `core` | no | External source contracts and discovery. |
| `factory` | `core` | no | Spec-to-draft-delivery roles and control plane. |

Connected sync can activate a profile directly:

```bash
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile sources --apply
npx github:benjamin-blanchet/application-corpus-agent-pack#v1.1.0 sync --profile factory --apply
```

The installer resolves dependencies; `core` cannot be disabled. Profile
removal is not automated because deleting possibly customized files is unsafe.

## Local, offline activation

Installation keeps inactive profiles under:

```text
.corpus-pack/
├── install-state.json
├── manifest.json
├── incoming/
└── bundles/
    ├── sources.bundle.json.gz
    └── factory.bundle.json.gz
```

Use the installed CLI so no package lookup or fetch is needed:

```bash
node scripts/cli.mjs profile list
node scripts/cli.mjs profile status
node scripts/cli.mjs profile enable sources          # preview
node scripts/cli.mjs profile enable sources --apply
node scripts/cli.mjs profile enable factory --apply
```

Bundles include version, dependencies, destination paths, permissions and
SHA-256 integrity data. Extraction rejects absolute paths, traversal and
digest mismatches. After installation, enabling a profile does not contact the
pack repository. Application-specific connected sources may of course require
their own network access.

On a core-only installation, `node scripts/validate-corpus.mjs` reports links
into not-yet-materialized lazy sections and into inactive `sources`/`factory`
files as P2 informational findings (`link-into-unmaterialized-section`,
`link-into-inactive-profile`), each with the command that resolves it. They
become P1 broken links only when the section is materialized or the profile is
active and the target is still missing.

If activation finds a conflict, the profile remains `pending review`; it is
not partially active. Review or merge the proposed files below
`.corpus-pack/incoming/<version>/`, then rerun the same enable command. The
profile moves from `pendingProfiles` to active only when the plan is
conflict-free.

## Existing files and conflicts

A first installation treats every pre-existing file as project-owned,
including `AGENTS.md`, `.github/copilot-instructions.md`, skills and scripts.
A managed pathname alone never proves pack ownership.

When incoming content conflicts:

- preview reports the exact path and ownership reason;
- non-interactive apply preserves the project file;
- the proposed version is written below
  `.corpus-pack/incoming/<version>/<original-path>`;
- an accepted replacement is backed up before it becomes active.

Future upgrades use `.corpus-pack/install-state.json` to distinguish files
installed by the pack from project-owned additions. Locally modified managed
files remain explicit conflicts; they are not silently reset.

Existing application knowledge under `doc/` is preserved. The pack may add a
missing scaffold, but it does not replace instantiated feature, production,
specification, graph, interview or handover content.

## Upgrade procedure

1. Create a branch or another recoverable checkpoint.
2. Run a pinned `sync` preview.
3. Review conflicts, profiles and incoming files.
4. Re-run with `--apply`.
5. Select the `Corpus` agent and invoke `governance/pack-upgrade`.
6. Run the reported validators and review the migration report.

File replacements are atomic, but a multi-file sync is resumable rather than
one filesystem transaction. If interrupted, rerun the same pinned command
before corpus migration.

From a local pack checkout, including an air-gapped environment:

```bash
node scripts/update-pack.mjs <source-pack-dir>          # preview
node scripts/update-pack.mjs <source-pack-dir> --apply
```

Do not use `rsync --delete` and do not copy `.github/` wholesale: maintainer CI
workflows are not consumer files, and local extensions are valid.

## First corpus run

Select the `Corpus` role and use any clear kickstart request:

```text
init the corpus              ·  init le corpus
run the full repo analysis   ·  fais l'analyse complète du repo
where are we on the corpus
continue
```

The agent first reports the current state, blockers, source coverage and next
bounded action. It builds application knowledge from the installed generic
base; a fresh pack is not itself an application corpus.

## Selecting roles

The exact set depends on active profiles:

- `core`: Corpus and its bounded read-only helpers;
- `sources`: source/reliability capabilities;
- `factory`: Functional Analyst, Planner, Developer, Controller, Reviewer,
  Acceptance and Delivery.

Choose roles explicitly through the host's agent picker when possible. Only
Developer may modify application source, and only after the implementation
gate. Every other role keeps its declared write surface.

## Multi-repository applications

Install `core` in each repository that needs its own corpus. During kickstart,
`foundations/multi-repo-workspace-detection` distinguishes monorepos from
separate repositories, records confirmed roles and read consent, then routes
peer access through `sources/peer-corpus-access` when `sources` is enabled.

## Factory activation is not acceptance activation

Enabling `factory` installs the workflow machinery. Acceptance remains blocked
until the constructed corpus and protected controller declare a real isolated
executor provider. A project-local provider normally lives at
`.corpus-pack/local/executors/<provider>.mjs` and is selected through
`FACTORY_EXECUTOR_PROVIDER` or `--executor-provider`.

The provider exports `apiVersion = 1` and `executeAcceptance(request)`,
delegates to an external sandbox/broker, and returns the closed attested result
contract. No demonstration executor is installed. See
[Software factory](software-factory.md).

## Installed surfaces

The exact active surface depends on profiles. The local manifest is the
machine-readable authority. Typical paths are:

```text
.corpus-pack/          receipt, manifest, offline bundles and conflicts
.github/agents/        agents from active profiles
.github/skills/        skills from active profiles
.github/prompts/       active prompt assets
.github/templates/     local templates
scripts/               local CLI, validators and active profile utilities
schemas/               schemas required by active profiles
doc/                   real corpus state and knowledge as it is created
AGENTS.md               operating guide
KICKSTART.md            first-run guide
PACK_VERSION            installed pack version
```
