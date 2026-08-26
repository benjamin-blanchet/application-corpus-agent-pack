---
name: pack-upgrade
category: governance
description: "Migrate a corpus that was built with an older version of the pack to a newer version, **without losing any corpus data**."
---
# Pack Upgrade

## Purpose

Migrate a corpus that was built with an older version of the pack to a newer version, **without losing any corpus data**.

The canonical procedure is **safe sync + agent-driven migration**:

1. The operator runs `sync`, which copies pack-owned files, confirms before
   overwriting a locally-modified agent, never overwrites an existing `doc/`
   file, and may add missing pack scaffolds. During an upgrade, a missing
   `doc/_meta/corpus-state.yaml` is deferred to this skill so the previous
   version remains explicitly unknown.
2. The operator invokes this skill. The agent handles version detection, schema gap detection and repair, structural migrations, version stamp, changelog, validator pass, dashboard rebuild and migration report.

## When to invoke

The skill responds to any of these phrasings (open trigger detection, like kickstart mode):

- "migre le corpus"
- "migration après upgrade pack"
- "le pack a été upgradé, fais la suite"
- "audit post-upgrade"
- "vérifie la structure du corpus après upgrade"
- "fais la migration structurelle"

You also invoke this skill automatically when the operator says "continue" or
"où en est-on" and either:

- the corpus state shows a `pack_version` older than the current
  `PACK_VERSION`; or
- `doc/_meta/corpus-state.yaml` is absent while both `PACK_VERSION` and the
  existing-corpus marker `doc/CORPUS_MANIFEST.md` are present; or
- a `doc/_meta/pack-upgrade-*-to-*.md` report targets the current
  `PACK_VERSION` but has `status` other than `complete` or
  `validation_status` other than `passed`.

In all cases, propose the migration before continuing other work. A correct
fresh install already contains its state file, so it does not match the second
condition.

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

## Sync and migration buckets (for reference)

The same model as before, now applied **by the agent** based on what it reads:

| Bucket | Examples | Behavior |
|---|---|---|
| **A — pack-owned** | `.github/skills/**`, `.github/prompts/**`, `scripts/**`, `schemas/**`, `AGENTS.md`, `KICKSTART.md`, `PACK_VERSION` | `sync` refreshes these from the incoming pack. The agent reads them as the source of truth for the new contract. |
| **Agents — confirmed** | `.github/agents/**` | `sync` copies missing agents and confirms before replacing a divergent local agent; non-interactive runs preserve it unless `--force` is explicit. |
| **B — pack-template** | `doc/_meta/*.yaml`, `doc/_meta/*.md` (top-level), `doc/_indexes/by-*.md`, `doc/_roadmap/*.md`, `doc/_runs/RUN_LEDGER.md`, `doc/_runs/RUN_TEMPLATE.md` | `sync` copies missing scaffolds but preserves every existing file. This skill inspects existing templates for schema drift and performs the migration. A missing corpus state is deferred here on upgrade. |
| **C — corpus-owned** | Everything else under `doc/` (see Hard constraints above) | Existing content is untouched. `sync` may add a missing pack-provided scaffold, but the migration never rewrites corpus knowledge. |

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

`sync` is the only supported copy path. It refreshes pack-owned files,
**confirms before overwriting** a divergent `.github/agents/**` file (`--force`
to skip the prompt; non-interactive runs preserve and surface it), copies
missing templates, and preserves every existing local template or corpus file.
Existing `doc/` files are never overwritten; missing scaffolds may be copied.
A missing `doc/_meta/corpus-state.yaml` is copied only on a fresh install and
is deferred to this skill during an upgrade.

> **Never use `rsync --delete` for this.** Local additions that do not ship
> with the pack — new skills, custom agents, project scripts — are legitimate
> and frequent, and `--delete` destroys them silently. `sync` lists them under
> *"locally present, removed in source"* for review and deletes nothing.

That's the whole operator side. Everything after is the agent.

## Agent procedure (this skill)

When invoked, the agent runs the following steps in order.

### Step 1 — Detect versions

Read `PACK_VERSION` first and derive its filesystem-safe `to_slug` by replacing
every character outside `[A-Za-z0-9._-]` with `-`. Before reading the state as
the previous version, search `doc/_meta/pack-upgrade-*-to-*.md` for an
incomplete report whose `to_version` equals this `PACK_VERSION`.

- If exactly one exists, this is a **resume**. Reuse its `from_version` and
  report path verbatim. Never recapture `from_version` from the already-stamped
  state and never overwrite `previous_pack_version` with the target version.
- If several exist, stop with a blocking question rather than guessing which
  migration owns the transition.
- If none exists, read `doc/_meta/corpus-state.yaml.pack_version` as
  `from_version`. If the state file or its `pack_version` is missing, capture
  `from_version: unknown` **before creating or copying any state file**. Never
  infer it from the new `PACK_VERSION` or from the migration scaffold.

Derive `from_slug` with the same safe-character rule, using the literal
`unknown` when the previous version is unavailable.

### Step 1b — Create or resume the durable checkpoint

Before any other durable migration write, create
`doc/_meta/pack-upgrade-<from_slug>-to-<to_slug>.md` with valid OKF
frontmatter, `status: in-progress` and `validation_status: pending`. Include
the captured `from_version` and `to_version`. On resume, preserve the existing
checkpoint and update it in place; do not create a second report.

This checkpoint is the recovery signal if the run stops after state stamping,
schema repair, changelog update, dashboard generation or validation. The
migration is complete only when the same report ends with both
`status: complete` and `validation_status: passed`.

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

`doc/_meta/corpus-state.yaml` is the one required exception. When `sync`
deferred it during an upgrade, copy the shipped canonical scaffold
`schemas/corpus-state.yaml.template` byte-for-byte to
`doc/_meta/corpus-state.yaml`. If that scaffold is absent, stop and surface a
blocking pack-integrity finding; do not invent a partial state file. Keep the
already-captured `from_version: unknown`, then apply Steps 3–4. This skill, not
`sync`, owns that durable creation and version stamp.

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

Create `doc/_meta/corpus-state.yaml` first when Step 3 identified the deferred
upgrade case, then update these keys under `corpus:`:

```yaml
pack_version: <to_version>             # the new PACK_VERSION
last_pack_upgrade: <ISO-8601>          # now
previous_pack_version: <from_version>  # what was there before, if known
```

For the deferred legacy case, write `previous_pack_version: unknown`. Do not
replace it with the incoming version from the scaffold.

On resume, use the `from_version` preserved in the checkpoint. Reapplying the
same three values is idempotent; never derive `previous_pack_version` from the
current (possibly already updated) `pack_version`.

### Step 4b — Recompute derived state

Once the state file exists and the migration stamp is present, run:

```bash
node scripts/recompute-corpus-state.mjs --apply --json
```

Capture the changed fields for the report. Recompute owns only its documented
allowlist, so it preserves `pack_version`, `previous_pack_version`,
`last_pack_upgrade` and all other operator-set fields. Never run recompute
before reconstructing a deferred missing state file.

### Step 5 — Prepare the idempotent changelog transition

Prepare this exact transition row for `doc/_meta/corpus-changelog.md`, but add
it only in Step 8b after the pre-report P0 gate is clear:

```
| <date> | pack upgrade | from <from> to <to>; schema fields added: <count>; orphan skills detected: <count> | <operator name or pack-upgrade skill> |
```

Before appending, search for the same `from <from> to <to>` transition. If
exactly one row already exists, reconcile that row in place with the final
counts and do not append another. If several exist, stop and surface the
duplicate audit trail instead of guessing which row to retain. This makes
resume safe after an interruption between changelog and final validation
without preserving stale counts.

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

### Step 6 — Validate the migrated corpus

Run `node scripts/validate-corpus.mjs --json` and capture:

- `P0` count — must be 0 before the migration commit. If > 0, the migration is incomplete; surface each P0 with file:reason.
- `P1` count — typical to have a few new P1 findings from stricter gates in the new validator. List the top 5 with codes. They are not blockers but are committed as known follow-ups.
- `P2` count — informational.

Compare against the previous validator state if recoverable (e.g. last run record). Note new findings as introduced-by-upgrade vs. pre-existing.

This is the pre-report validation pass. Step 8b is the final gate because the
migration report itself is a new corpus document and must also be validated.

### Step 7 — Prepare the dashboard rebuild

The authoritative dashboard rebuild runs in Step 8b after the report content
and changelog are ready, so `doc/_site/corpus.html` reflects every durable
migration artifact. Do not treat an earlier dashboard build as final.

### Step 8 — Write the migration report

Derive filesystem-safe slugs first: use `unknown` when a version is unavailable
and otherwise replace every character outside `[A-Za-z0-9._-]` with `-`.
Never put the display sentinel `<unknown>` (or any `<` / `>`) in a filename.
Populate the checkpoint created in Step 1b at
`doc/_meta/pack-upgrade-<from_slug>-to-<to_slug>.md`; never create a second
report for the same transition:

```markdown
---
type: meta
confidence: confirmed
source: mixed
last_validated: <YYYY-MM-DD>
title: "Pack upgrade <from> to <to>"
description: "Schema migration, validation state and follow-up actions for this pack upgrade."
date: <ISO>
from_version: <from>
to_version: <to>
status: in-progress | complete | incomplete-with-P0-findings | needs-operator-input
validation_status: pending | passed | failed
validated_at: <ISO or null>
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

### Step 8b — Final validation gate

If Step 6 has any P0, set the report to
`status: incomplete-with-P0-findings`, `validation_status: failed`, keep the
checkpoint resumable, and validate once more after recording the findings. Do
not append the completion changelog row.

If Step 6 has P0=0, finish in this order:

1. Append the Step 5 changelog row only if the exact transition is absent.
2. Fill the report with final counts and set `status: complete`, while keeping
   `validation_status: pending`.
3. Run `node scripts/build-corpus-site.mjs` and capture its summary.
4. Run `node scripts/validate-corpus.mjs --json` against the state, changelog,
   completed report content and rebuilt dashboard.
5. If final P0 is 0, make the **last durable write** to the report:
   `validation_status: passed` and `validated_at: <now>`. Perform no corpus or
   dashboard write afterwards. Then run the validator once more in strictly
   read-only mode against this exact terminal artifact. If it stays at P0=0,
   the migration is complete and no further write occurs.
6. If either the pending-report pass or the terminal read-only pass has a
   non-zero P0, set
   `status: incomplete-with-P0-findings`, `validation_status: failed`, update
   the findings, and rerun the validator once so the recorded artifact matches
   the reported failure.

Use this final pass for the operator recap. Never declare the migration
complete from Step 6 alone. A run interrupted anywhere before the last durable
write remains discoverable through its checkpoint and resumes with the
original `from_version`.

### Step 9 — Surface the result to the operator

End the run with a concise high-level recap (per `continuous/corpus-run` style):

```text
Corpus migration → pack <to_version>

- <count> schema fields added (<n> at confidence: confirmed, <m> at confidence: unknown)
- <count> new skills available, their artifacts will be created on the next pipeline run
- <count> orphaned skills detected (list in the report)
- Validator: P0=<n> (must be 0 to commit) P1=<n> P2=<n>
- Dashboard: <rebuilt | not rebuilt because pre-report P0 blocked completion>
- Report: doc/_meta/pack-upgrade-<from_slug>-to-<to_slug>.md

Recommended next action: <one sentence>
```

If `P0 > 0`, do **not** mark the migration as complete in the report; status: `incomplete-with-P0-findings`. The operator fixes P0 findings before committing.

## Anti-patterns

- Re-run pipeline passes (P1–P9) during this skill. It is a schema migration, not a re-analysis.
- Synthesize missing values (`confidence: confirmed` without a derivable source). Use `unknown` instead and let the next pipeline run populate it.
- Touch any file under `doc/project/`, `doc/prod/`, `doc/spec/`, `doc/_runs/YYYY-*`, `doc/_meta/code-interview/`, `doc/_meta/interaction-history/`, `doc/_graph/`, `doc/_handover/`.
- Auto-delete orphan skills. Surface them in the report; the operator decides.
- Hide P0 findings introduced by the upgrade. They are the most important output of this skill.
- Recapture `from_version` from an already-stamped state during resume, create
  a second report for the same transition, or append a duplicate changelog
  row. The checkpoint owns the original transition identity.
- Skip the final post-report validator pass. The report is part of the corpus
  and must pass the same gate as every other migration output.
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
| Migration report | `doc/_meta/pack-upgrade-<from_slug>-to-<to_slug>.md` |

## Appendix — running the sync from a local pack checkout

`npx … sync` fetches the pack itself. When the operator already has a pack
checkout — offline, air-gapped, or testing an unreleased branch — the same
engine is reachable directly:

```bash
node scripts/update-pack.mjs <source-pack-dir>           # dry-run (default)
node scripts/update-pack.mjs <source-pack-dir> --apply   # apply
node scripts/update-pack.mjs <source-pack-dir> --apply --force   # overwrite modified agents
```

Either entry point covers only the file-copy portion and prints a console
summary. The agent-side migration (this skill, steps 1–9) still runs
**afterwards**, because neither detects schema gaps in existing
`doc/_meta/**` files nor writes durable migration history.
