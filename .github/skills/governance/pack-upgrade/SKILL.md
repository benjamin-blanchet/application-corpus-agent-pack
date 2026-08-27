---
name: pack-upgrade
category: governance
description: "Migrate a corpus built with an older pack version without losing application knowledge or local extensions."
references:
  - procedure-operator-sync.md
  - procedure-migration.md
  - procedure-finalization.md
---
# Pack Upgrade

Use this skill after an operator has installed a newer pack version, or when a
resume check finds an incomplete upgrade report targeting `PACK_VERSION`.

## Non-negotiable rules

- Preview the sync before applying it. Installation conflicts are resolved by
  the sync engine; this skill never silently replaces project-owned files.
- Never modify application source or rewrite instantiated knowledge under
  `doc/project/**`, `doc/prod/**`, `doc/spec/<version>/**`, `doc/_graph/**`,
  interview history, run records or handover material.
- This is a schema migration, not a code rescan. Unknown values remain
  `unknown` and are assigned to a later evidence-producing run.
- Resume the existing `pack-upgrade-*-to-*.md` checkpoint. Never recapture the
  original version from state that may already have been stamped.
- P0 must be zero on the final, read-only validator pass before completion.

## Procedure dispatch

1. Read `procedure-operator-sync.md` to verify the operator-side sync and the
   allowed ownership buckets.
2. Read `procedure-migration.md` for version detection, checkpoint creation,
   schema repair and optional Factory workflow reconciliation.
3. Read `procedure-finalization.md` for stamping, derived-state rebuild, OKF,
   validation, the durable report and the terminal gate.

Run the three procedures in order. Do not load their detailed examples when
only deciding whether this skill applies.
