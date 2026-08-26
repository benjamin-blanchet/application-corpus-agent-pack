---
type: agents-reference
audience: operator
status: stable
source: pack
title: "Pack upgrade — operator procedure"
description: "When a newer version of the pack is released and you want to pick up its"
---

# Pack upgrade — operator procedure

When a newer version of the pack is released and you want to pick up its
skills, agents, scripts and conventions **without losing the corpus you
have already built**.

## Procedure

1. **Backup `doc/`** (the live corpus) for safety:
   ```bash
   cp -r doc /tmp/corpus-backup-$(date +%Y%m%d-%H%M%S)
   ```

2. **Preview, then apply the safe pack sync** from the target repository:
   ```bash
   npx github:benjamin-blanchet/application-corpus-agent-pack sync
   npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply
   ```

   Sync refreshes pack-owned files and confirms before replacing a divergent
   local agent. It never overwrites an existing file under `doc/`; missing
   scaffolds may be copied. During an upgrade, a missing
   `doc/_meta/corpus-state.yaml` is deferred to the Corpus migration so its
   previous version remains explicitly unknown. The migration reconstructs it
   from the refreshed `schemas/corpus-state.yaml.template`.

3. **Invoke the migration in the IDE.** Open the `Corpus` agent and type any of:
   - "migre le corpus"
   - "le pack a été upgradé, fais la suite"
   - "audit post-upgrade"

   The agent runs `governance/pack-upgrade`: detects the version delta,
   fills schema gaps in `doc/_meta/**` with `confidence: unknown` where the
   value is not derivable, stamps `pack_version` + `last_pack_upgrade`,
   appends a changelog row, runs the validator, rebuilds the dashboard, and
   writes a migration report at
   `doc/_meta/pack-upgrade-<from-slug>-to-<to-slug>.md`. An unavailable version
   uses the filesystem-safe slug `unknown`. The agent validates again after
   writing the report. It first creates that report as an `in-progress`
   checkpoint; an interrupted run resumes the same transition without
   recapturing the previous version or duplicating the changelog row.

4. **Review** the migration report and the validator findings. P0 must be
   0 before you commit. New P1 findings introduced by stricter gates in
   the new pack are normal — log them as known follow-ups. In particular,
   upgrading onto the **boundary contract** zone scaffolds an empty
   `doc/architecture/boundary.yaml`; if your corpus already has P5 covered,
   expect a `boundary-not-populated` P1 — that is your cue to run the
   population pass (`governance/boundary-contract`, fed by the existing P5
   catalogs), not a regression.

`sync` is the canonical copy path. A local-checkout equivalent exists for
offline or scripted scenarios:

```bash
node scripts/update-pack.mjs <NEW_PACK>           # dry-run
node scripts/update-pack.mjs <NEW_PACK> --apply   # apply
```

Both entry points stop after copying and print a console summary. They do not
stamp corpus state, append the changelog, or write a durable migration report;
those actions belong exclusively to the Corpus migration in step 3.

## Hard rule (still applies during upgrade)

The Corpus migration never rewrites existing application knowledge under:

- `doc/project/`
- `doc/prod/`
- `doc/spec/`
- `doc/_runs/YYYY-*`
- `doc/_meta/code-interview/`
- `doc/_meta/interaction-history/`
- `doc/_graph/`
- `doc/_handover/`

Your corpus content is sacred. The preceding `sync` may add a missing
pack-provided scaffold in these zones, but it never changes or removes an
existing file.
