---
type: agents-reference
audience: operator
status: stable
source: pack
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

2. **Copy the new pack contents over the repo, excluding `doc/`** (your corpus):
   ```bash
   rsync -av --delete --exclude='doc/' <NEW_PACK>/ ./
   ```

3. **Invoke the migration in the IDE.** Open the `Corpus` agent and type any of:
   - "migre le corpus"
   - "le pack a été upgradé, fais la suite"
   - "audit post-upgrade"

   The agent runs `governance/pack-upgrade`: detects the version delta,
   fills schema gaps in `doc/_meta/**` with `confidence: unknown` where the
   value is not derivable, stamps `pack_version` + `last_pack_upgrade`,
   appends a changelog row, runs the validator, rebuilds the dashboard,
   and writes a migration report at `doc/_meta/pack-upgrade-<from>-to-<to>.md`.

4. **Review** the migration report and the validator findings. P0 must be
   0 before you commit. New P1 findings introduced by stricter gates in
   the new pack are normal — log them as known follow-ups.

A deterministic helper script (`scripts/update-pack.mjs`) exists for CI /
scripted scenarios, but the manual copy + agent-driven migration is the
canonical operator path. The agent has full context to decide schema vs.
data, and produces a more transparent migration report.

## Hard rule (still applies during upgrade)

The upgrade never touches anything under:

- `doc/project/`
- `doc/prod/`
- `doc/spec/`
- `doc/_runs/YYYY-*`
- `doc/_meta/code-interview/`
- `doc/_meta/interaction-history/`
- `doc/_graph/`
- `doc/_handover/`

Your corpus content is sacred.
