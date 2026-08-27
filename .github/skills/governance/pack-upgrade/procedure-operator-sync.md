# Procedure — operator sync and ownership

## Preconditions

The operator runs the same safe sync command for installation and upgrade:

```bash
# preview
npx github:benjamin-blanchet/application-corpus-agent-pack#<version> sync

# apply after reviewing the plan
npx github:benjamin-blanchet/application-corpus-agent-pack#<version> sync --apply
```

When working from an offline or unreleased local checkout, use
`node scripts/update-pack.mjs <source-pack-dir>` with `--apply` only after its
preview. Never use `rsync --delete` or copy `.github/` wholesale.

The sync is atomic per file and resumable as a whole. If interrupted, rerun the
same pinned version before starting the corpus migration.

## Ownership buckets

| Bucket | Typical paths | Upgrade behavior |
|---|---|---|
| Pack-managed | active agents, skills, prompts, scripts, schemas, templates and top-level operating guides installed by a previous receipt | Refresh only when the installation receipt proves prior pack ownership. Preserve local drift unless the operator explicitly accepts replacement. |
| Project-managed | pre-existing or locally added agent instructions, custom skills, scripts and integrations | Never claim ownership from the pathname alone. Report conflicts and keep the local file. |
| Corpus templates | top-level state/index/roadmap scaffolds | Add when missing; migrate schema in place without replacing existing knowledge. |
| Corpus knowledge | instantiated `doc/project/**`, `doc/prod/**`, specs, graph, interviews, runs and handover | Preserve. Only add schema fields when safely derivable; otherwise record `unknown`. |

The local `.corpus-pack/install-state.json` receipt records which files and
profiles were installed. It is the authority for future pack ownership; a
first install has no right to overwrite a same-path project file.

## Before invoking the agent migration

- Confirm the sync completed successfully.
- Keep the sync conflict and backup report available.
- Confirm `PACK_VERSION` is present.
- If the repo already contains a corpus, invoke `governance/pack-upgrade`.
- If this is a fresh install, start `modes/corpus-kickstart` instead.

