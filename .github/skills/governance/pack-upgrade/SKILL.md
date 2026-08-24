---
name: pack-upgrade
category: governance
description: "Migrate a corpus that was built with an older version of the pack to a newer version, **without losing any corpus data**."
---
# Pack Upgrade

## Purpose

Migrate a corpus that was built with an older version of the pack to a newer version, **without losing any corpus data**.

The canonical procedure is **manual file copy + agent-driven migration**:

1. The operator runs `sync`, which copies pack-owned files, confirms before overwriting a locally-modified agent, and never touches `doc/`.
2. The operator invokes this skill. The agent handles version detection, schema gap detection and repair, structural migrations, version stamp, changelog, validator pass, dashboard rebuild and migration report.

## When to invoke

The skill responds to any of these phrasings (open trigger detection, like kickstart mode):

- "migre le corpus"
- "migration après upgrade pack"
- "le pack a été upgradé, fais la suite"
- "audit post-upgrade"
- "vérifie la structure du corpus après upgrade"
- "fais la migration structurelle"

You also invoke this skill automatically when the operator says "continue" or "où en est-on" and the corpus state shows a `pack_version` older than the current `PACK_VERSION` file — propose the migration before continuing other work.

## Hard constraints (always)

- **The corpus agent never modifies application source code.** This skill only touches pack-owned and pack-template files. See `AGENTS.md` § "Write boundaries — hard rule" and `foundations/core-discipline` Rule 5.
- **Corpus content is sacred.** The agent never modifies:
  - `doc/project/**`
  - `doc/prod/**`
  - `doc/spec/**`
  - `doc/mcp/**` (when populated with team-specific content)
  - `doc/_graph/**`
  - `doc/_meta/code-interview/**`
  - `doc/_meta/interaction-history/**`
  - `doc/_runs/YYYY-MM-DD-*.md` (individual run records)
  - `doc/_handover/**`

  These directories may receive **schema field additions** only when a new pack version requires them, and only with `confidence: unknown` when the value is not derivable from existing corpus content. Never modify their existing content.

- **No re-scan of code, no re-run of pipeline passes.** This is a schema migration, not a re-analysis. If the new pack expects new metadata (e.g. `doc/_meta/code-activity-signals.yaml` from `pipeline/code-activity-signals`), record the gap and propose the next run that will produce it — do not synthesize the data.

## Three-bucket model (for reference)

The same model as before, now applied **by the agent** based on what it reads:

| Bucket | Examples | Behavior |
|---|---|---|
| **A — pack-owned** | `.github/agents/**`, `.github/skills/**`, `.github/prompts/**`, `scripts/**`, `AGENTS.md`, `KICKSTART.md`, `PACK_VERSION`, `.gitignore` | Operator already overwrote them in the manual copy. Agent reads them as the source of truth for the new contract. |
| **B — pack-template** | `doc/_meta/*.yaml`, `doc/_meta/*.md` (top-level), `doc/_indexes/by-*.md`, `doc/_roadmap/*.md`, `doc/_runs/RUN_LEDGER.md`, `doc/_runs/RUN_TEMPLATE.md` | Operator did NOT touch these (excluded `doc/` from the copy). Agent inspects each for schema drift vs. the new pack's templates and adds missing fields when needed. |
| **C — corpus-owned** | Everything else under `doc/` (see Hard constraints above) | Untouched. |

## Canonical operator procedure

```bash
# Step 1 — backup (operator)
cd <TARGET_REPO>
git checkout -b chore/pack-upgrade-$(date +%Y%m%d)
cp -r doc /tmp/corpus-backup-$(date +%Y%m%d-%H%M%S)

# Step 2 — sync the new pack (operator). Dry-run first; nothing is written.
npx github:benjamin-blanchet/application-corpus-agent-pack sync
npx github:benjamin-blanchet/application-corpus-agent-pack sync --apply

# Step 3 — invoke this skill in the IDE
#   open the Corpus agent and type one of the trigger phrases above
```

`sync` is the only supported copy path. It resolves three buckets: pack-owned
files are replaced, `.github/agents/**` is **confirmed before overwrite** when
the local copy differs (`--force` to skip the prompt; non-interactive runs
preserve and flag instead), and everything else with local content is
preserved. `doc/` is never overwritten.

> **Never use `rsync --delete` for this.** Local additions that do not ship
> with the pack — new skills, custom agents, project scripts — are legitimate
> and frequent, and `--delete` destroys them silently. `sync` lists them under
> *"locally present, removed in source"* for review and deletes nothing.

That's the whole operator side. Everything after is the agent.

## Agent procedure (this skill)

When invoked, the agent runs the following steps in order.

### Step 1 — Detect versions

Read `PACK_VERSION` (the new one, just copied) and `doc/_meta/corpus-state.yaml.pack_version` (the previous one, if it exists). Capture both as `from_version` and `to_version`. If `pack_version` is missing from `corpus-state.yaml`, mark `from_version: <unknown>` and continue — that is normal for very old packs.

### Step 2 — Inventory what changed in the pack

Cross-reference the local pack with what the new contract expects:

- List skills present in `.github/skills/**` (after the operator's copy). Group by domain.
- List agents present in `.github/agents/**`.
- Note any skill that:
  - **Is new in the new pack** — agent references it in its own files but didn't exist in the old version (e.g. `pipeline/code-activity-signals`, `foundations/core-discipline`).
  - **Is referenced by an agent prompt but does not exist** in the current `.github/skills/**` (broken reference — surface as a finding).
  - **Exists in `.github/skills/**` but is referenced by no agent and by no other skill** (orphan candidate — list, do not delete).

### Step 3 — Detect schema gaps in `doc/_meta/**`

For each well-known meta file, compare its current shape against the schema documented in the new pack's skill files:

| Meta file | Skill that documents the expected schema |
|---|---|
| `doc/_meta/corpus-state.yaml` | `foundations/core-rules`, `foundations/kickstart-setup` |
| `doc/_meta/code-pipeline-state.yaml` | `pipeline/p1-code-tree-inventory` and every subsequent P-pass |
| `doc/_meta/brick-inventory.yaml` | `actionable/brick-inventory` |
| `doc/_meta/actionable-readiness.md` | `actionable/readiness-gate` |
| `doc/_meta/discovery-coverage.md` | `governance/discovery-coverage-contract` |
| `doc/_meta/mcp-readiness.md` | `sources/mcp-readiness-check` |
| `doc/_meta/code-activity-signals.yaml` (new) | `pipeline/code-activity-signals` |
| `doc/_meta/coverage-matrix.md` | `pipeline/p9-code-reconciliation-gate`, `governance/discovery-coverage-contract` |
| `doc/_meta/source-inventory.md` | `sources/information-source-onboarding` |
| `doc/architecture/boundary.yaml` (new) | `governance/boundary-contract` |
| `doc/_meta/ecosystem-map.yaml` (new) | `sources/ecosystem-corpus-discovery` |

For each missing field that the new pack expects:

- **If the value is derivable from existing corpus state** (e.g. recomputable from another file already present), add it with `confidence: confirmed` and source-cite where it came from.
- **If the value would require a code scan, an MCP pull, or operator input**, add the field with `confidence: unknown` and a comment indicating which next run will populate it (e.g. `# populated by pipeline/code-activity-signals on next kickstart-continue`).
- **Never invent a value.** Use `unknown` over guessing.

For files that the new pack expects but that don't exist at all yet (e.g. `code-activity-signals.yaml` on a corpus that was built before the skill existed): do **not** create them in this skill. Record in the report that they will be created on the next pipeline run.

### Step 3b — Scaffold the boundary contract zone (pack-template)

The `doc/architecture/` zone and the ecosystem registry are **pack-template
skeletons** (bucket B), so this skill *may* create them when absent — but only
the empty skeletons, never synthesized content:

- If `doc/architecture/README.md`, `doc/architecture/boundary.yaml` or
  `doc/_meta/ecosystem-map.yaml` is missing, copy the shipped skeleton from the
  new pack (`.github/templates/architecture/boundary.yaml.template` for the
  contract; the README/registry skeletons from the pack). Leave `app.id:
  unknown` and `interfaces` empty — population is code-derived, not a migration
  task.
- **Do not** populate `boundary.yaml` from a code scan here (Hard constraint:
  no re-scan). Instead, if `code-pipeline-state.yaml` shows
  `p5_cross_cutting_extraction.status == covered`, the corpus already has the
  raw material (`doc/project/architecture/INTEGRATION_MAP.md`,
  `doc/project/services/MESSAGING.md`, `doc/_indexes/by-api.md`). Record a
  migration item: *"populate `architecture/boundary.yaml` from existing P5
  catalogs via `governance/boundary-contract`"* — a reconciliation pass over
  already-captured knowledge, run after the upgrade, not a re-analysis.
- The validator will emit `boundary-not-populated` (P1) while P5 is covered and
  the contract is still empty. That P1 is expected post-upgrade and is the
  operator's signal to run the population pass; surface it in the report rather
  than letting it look like a regression.

### Step 4 — Stamp the upgrade

Update `doc/_meta/corpus-state.yaml`:

```yaml
pack_version: <to_version>             # the new PACK_VERSION
last_pack_upgrade: <ISO-8601>          # now
previous_pack_version: <from_version>  # what was there before, if known
```

### Step 5 — Append to the changelog

Append a single row to `doc/_meta/corpus-changelog.md`:

```
| <date> | pack upgrade | from <from> to <to>; schema fields added: <count>; orphan skills detected: <count> | <operator name or pack-upgrade skill> |
```

### Step 5b — OKF conformance pass

Bring the corpus up to the Open Knowledge Format (OKF v0.1) baseline the new
pack expects. Run:

```bash
node scripts/build-okf-indexes.mjs        # add --dry-run first to preview
```

This is **safe under the Hard constraints**: it is deterministic, additive and
idempotent. It only:

- emits the reserved `index.md` listings (lowercase) where they do not collide
  with an existing `CATALOG.md`/`README.md` — never overwriting corpus-owned
  listings;
- backfills the derivable OKF fields (`title`/`description`/`timestamp`) onto
  concept docs that **already** have a frontmatter block, deriving them from the
  doc's own H1 / first sentence / `last_validated` — never inventing, never
  touching prose;
- stamps `okf_version` on the bundle-root `doc/index.md`.

It never adds or guesses a `type`, never rewrites bodies, and never touches the
sacred zones beyond adding sibling `index.md` files. Capture the one-line
summary (indexes written, fields backfilled) for the report. Concept docs that
genuinely lack a `type` are left for the validator to surface as P0 (next step)
— do not hand-fix them in this skill unless the `type` is unambiguous from the
doc's existing frontmatter.

### Step 6 — Validate

Run `node scripts/validate-corpus.mjs --json` and capture:

- `P0` count — must be 0 before the migration commit. If > 0, the migration is incomplete; surface each P0 with file:reason.
- `P1` count — typical to have a few new P1 findings from stricter gates in the new validator. List the top 5 with codes. They are not blockers but are committed as known follow-ups.
- `P2` count — informational.

Compare against the previous validator state if recoverable (e.g. last run record). Note new findings as introduced-by-upgrade vs. pre-existing.

### Step 7 — Rebuild the dashboard

Run `node scripts/build-corpus-site.mjs`. Capture the one-line summary. The dashboard at `doc/_site/corpus.html` now reflects the post-upgrade state.

### Step 8 — Write the migration report

Create `doc/_meta/pack-upgrade-<from>-to-<to>.md`:

```markdown
---
date: <ISO>
from_version: <from>
to_version: <to>
status: complete | incomplete-with-P0-findings | needs-operator-input
---

## Summary

<one paragraph: what changed in scope, what was added>

## Schema fields added

| File | Field added | Confidence | Source / next run |
|---|---|---|---|
| doc/_meta/corpus-state.yaml | last_pack_upgrade | confirmed | this skill |
| doc/_meta/code-pipeline-state.yaml | code_activity_signals | unknown | pipeline/code-activity-signals on next kickstart-continue |
| ... | | | |

## New skills now available (referenced by agents but not yet exercised on this corpus)

- pipeline/code-activity-signals — will produce doc/_meta/code-activity-signals.yaml on next pipeline run
- foundations/core-discipline — discipline applies immediately on the next agent session
- ...

## Orphan skills detected (present in .github/skills/** but referenced by no agent)

- governance/old-name (was renamed to governance/new-name in vXY; safe to delete after review)
- ...

## Validator state after upgrade

- P0: <count> <details if > 0>
- P1: <count> <top 5 codes>
- P2: <count>

## Next operator action

<one or two sentences: what should happen in the next session>
```

### Step 9 — Surface the result to the operator

End the run with a concise high-level recap (per `continuous/corpus-run` style):

```text
Corpus migration → pack <to_version>

- <count> schema fields added (<n> at confidence: confirmed, <m> at confidence: unknown)
- <count> new skills available, their artifacts will be created on the next pipeline run
- <count> orphaned skills detected (list in the report)
- Validator: P0=<n> (must be 0 to commit) P1=<n> P2=<n>
- Dashboard rebuilt
- Report: doc/_meta/pack-upgrade-<from>-to-<to>.md

Recommended next action: <one sentence>
```

If `P0 > 0`, do **not** mark the migration as complete in the report; status: `incomplete-with-P0-findings`. The operator fixes P0 findings before committing.

## Anti-patterns

- Re-run pipeline passes (P1–P9) during this skill. It is a schema migration, not a re-analysis.
- Synthesize missing values (`confidence: confirmed` without a derivable source). Use `unknown` instead and let the next pipeline run populate it.
- Touch any file under `doc/project/`, `doc/prod/`, `doc/spec/`, `doc/_runs/YYYY-*`, `doc/_meta/code-interview/`, `doc/_meta/interaction-history/`, `doc/_graph/`, `doc/_handover/`.
- Auto-delete orphan skills. Surface them in the report; the operator decides.
- Hide P0 findings introduced by the upgrade. They are the most important output of this skill.
- Skip the dashboard rebuild. The dashboard reflects post-upgrade state — leaving it stale defeats the auto-sync contract from `continuous/corpus-run-audit`.

## Output destinations

| Result | Destination |
|---|---|
| Detection report (versions + skill inventory + schema gaps) | Agent response (run recap) + migration report file |
| Schema fields added | Updates inside `doc/_meta/*.yaml` and `doc/_meta/*.md` (bucket B files only) |
| Version stamp | `doc/_meta/corpus-state.yaml` (`pack_version`, `last_pack_upgrade`, `previous_pack_version`) |
| Audit trail | `doc/_meta/corpus-changelog.md` (appended row) |
| Validator findings | CLI output + summarized in the migration report |
| Dashboard | `doc/_site/corpus.html` (rebuilt) |
| Migration report | `doc/_meta/pack-upgrade-<from>-to-<to>.md` |

## Appendix — running the sync from a local pack checkout

`npx … sync` fetches the pack itself. When the operator already has a pack
checkout — offline, air-gapped, or testing an unreleased branch — the same
engine is reachable directly:

```bash
node scripts/update-pack.mjs <source-pack-dir>           # dry-run (default)
node scripts/update-pack.mjs <source-pack-dir> --apply   # apply
node scripts/update-pack.mjs <source-pack-dir> --apply --force   # overwrite modified agents
```

Either entry point covers only the file-copy portion. The agent-side migration
(this skill, steps 1–9) still runs **afterwards**, because neither detects
schema gaps in existing `doc/_meta/**` files — they copy pack-owned files and
report, nothing more.
