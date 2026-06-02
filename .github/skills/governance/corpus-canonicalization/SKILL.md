---
name: corpus-canonicalization
category: governance
description: "After a pack upgrade, bring an existing corpus's *shape* in line with the new canonical schemas — apply safe mechanical fixes, surface decision-requiring drift for operator/agent intervention."
---
# Corpus Canonicalization

## Purpose

After a pack upgrade, the new pack ships stricter schemas (under `schemas/`) and a richer `validate-corpus.mjs`. An existing corpus that was working fine on the old pack will produce a wave of findings — most of them mechanical field-name drift, severity-casing, or skeleton-not-declared. This skill triages those findings and applies the ones that are safe to fix automatically, leaving the rest for explicit operator decision.

The corpus *content* is not touched. Only the *shape* (field names, casing, missing structural declarations) is brought to canonical.

## When to invoke

Trigger phrases:

- "nettoie le corpus après upgrade"
- "applique les fixes canoniques"
- "canonicalize the corpus"
- "fix the validate-corpus drift"
- "post-upgrade cleanup"

You also invoke this skill automatically when, after `governance/pack-upgrade` finishes, `validate-corpus.mjs --json` returns more than a handful of P2 findings whose `code` matches the auto-safe list below.

## Hard constraints

- **Corpus content is sacred.** This skill renames fields and normalizes casing — it never changes the *meaning* of a value, never deletes a value, never creates new corpus knowledge.
- **No re-scan of code, no re-run of pipeline passes.** Missing files (e.g. `code-interview/<slug>.md` absent) are surfaced as decisions, not synthesized.
- **Dry-run by default.** Every change is shown to the operator as a diff before any file is written. The operator approves explicitly, or the changes are dropped.
- **Don't touch what you don't understand.** The auto-safe list below is exhaustive. Anything else goes to the needs-decision bucket — never bend the safe list because "it looks similar".

## Procedure

When invoked, the agent runs the following steps in order.

### 1. Snapshot the baseline

Run `node scripts/validate-corpus.mjs --json` and record the P0/P1/P2 counts. This is the **before** number for the closing report.

### 2. Triage findings into three buckets

For each finding from step 1, classify by its `code`:

- **Auto-safe** — listed in § Auto-safe transformations below. The agent will fix it without asking.
- **Needs decision** — listed in § Needs-decision items below. The agent will surface it to the operator one bucket at a time.
- **Out of scope** — anything not in either list above. Leave alone, report at the end.

### 3. Apply auto-safe fixes

For each auto-safe finding, produce the edit, show the diff to the operator (one batch per drift category — e.g. all `last_observed → last_validated` renames in one diff), and apply on approval. Use `Edit` / `Write` tools, never raw shell substitutions, so every edit is traceable.

Auto-safe edits operate file-by-file, key-by-key. They never touch a key whose value is non-trivial (e.g. don't rename `winner:` if its value is a structured map — only if it's a string).

### 4. Surface needs-decision items

For each needs-decision finding, present to the operator with: the file, the line, the current value, the recommended canonical, and the reason a decision is needed. Group by category so the operator handles "all the BUG severity:active mappings" in one go, not 8 separate prompts.

The operator's answer can be: (a) apply this specific fix, (b) apply this fix to all similar findings in the same file, (c) skip / defer to a later run.

### 5. Re-run validation

Run `node scripts/validate-corpus.mjs --json` again. Record the **after** counts.

### 6. Write a canonicalization report

Append a section to `doc/_meta/corpus-changelog.md`:

```
## 2026-MM-DD — corpus-canonicalization run

- Before: P0=N P1=N P2=N
- After:  P0=N P1=N P2=N
- Auto-safe applied: <count> across <category breakdown>
- Operator decisions applied: <count>
- Deferred: <count> (see findings list below)
- Out of scope (no rule): <count>
```

Include the list of deferred findings inline (one line each) so the next session sees them.

## Auto-safe transformations

These are the only transformations the agent applies without operator approval (one batched diff per category, still shown for review).

### A. Field-name aliases in YAML files

Inside `doc/_meta/brick-inventory.yaml`, `doc/_meta/reconciliation-ledger.yaml`, `doc/_meta/structural-issues.yaml`:

| Variant (rewrite) | Canonical |
|---|---|
| `type:` (when value matches brick kind enum) | `kind:` |
| `priority:` (when value matches criticality enum) | `criticality:` |
| `title:` (when value is a quoted string) | `label:` |
| `slug:` (at brick-item level) | absorb into `id:` |
| `corpus_path:` | `canonical_file:` |
| `winner:` (when value is a quoted string in `resolution:`) | move text into `result:`, drop `winner:` |
| `findings:` (root-level in structural-issues.yaml) | `issues:` |
| `generated_by:` (root-level in structural-issues.yaml) | `generator:` |
| `last_run:` (root-level in structural-issues.yaml) | `date:` |

### B. Frontmatter field-name aliases in markdown files

For files under `doc/prod/known-bugs/`, `doc/prod/structural-risks/`, `doc/prod/watchlist/`, `doc/_runs/`:

| Variant (rewrite) | Canonical |
|---|---|
| `last_observed:` | `last_validated:` |
| `last_seen:` | `last_validated:` |
| `run_started:` | `date:` |
| `run_date:` | `date:` |

When both alias and canonical are present in the same frontmatter, prefer the canonical's existing value, drop the alias (the values usually match; if they don't, surface as needs-decision instead).

### C. Severity / status casing

Frontmatter values across BUG / RISK / WATCH files:

- `severity: HIGH` → `severity: high`
- `severity: CRITICAL` → `severity: critical`
- `severity: MEDIUM` → `severity: medium`
- `severity: LOW` → `severity: low`

Only lowercase the value. Never invent a missing `severity:` field.

### D. Spec skeleton declaration

For any `doc/spec/<key>/` directory that contains **only `README.md`** and whose README frontmatter has `status:` other than `skeleton`:

- Set `status: skeleton`.

Reason: a one-file spec is by definition not deployed. Operators sometimes leave `status: active` from a template they intended to flesh out.

### E. Frontmatter `type:` normalization in `_runs/`

- `type: corpus-run-record` → `type: corpus-run`
- `type: run-record` → `type: corpus-run`

## Needs-decision items

These are surfaced to the operator. The agent does **not** guess.

### F. Markdown-in-YAML files (P0 `yaml-is-markdown`)

For each `.yaml` file that is actually markdown-with-frontmatter, ask the operator: **rename to `.md`**, or **rewrite as pure YAML**. Either answer is valid; the right one depends on what the file is consumed by.

If the operator chooses rewrite, the agent reads the file's content, attempts a faithful YAML serialization, presents the diff, and lets the operator approve.

### G. Duplicate YAML keys (P1 `yaml-duplicate-key`)

For each duplicate-key finding, ask the operator which value to keep. **Never pick automatically** — the silently-dropped value is often the more recent one and deletion can lose data.

### H. Missing required fields (P2 `frontmatter-*-missing-*`)

For each missing field on BUG / RISK / WATCH frontmatter, ask the operator for the value. The agent may propose a candidate by reading the file body (e.g. severity often appears as `**Sévérité** : HIGH` in the body table), but the operator confirms.

### I. Status outside enum

When a status value isn't in the canonical enum (e.g. BUG with `status: active`), propose a mapping:

- `active` on BUG → `open` (most common)
- `active` on WATCH → keep (in enum)
- `unknown` / `tbd` / freshly-templated values → surface for decision

### J. Missing cross-files

When a feature is in `corpus_inventory.features` but `code-interview/<slug>.md` doesn't exist, ask the operator: **create a skeleton interview file** (and schedule a P4 run to fill it), or **remove the feature from inventory** (if it was added optimistically).

### K. Non-canonical index columns

Index tables with custom columns can't be auto-shrunk to canonical 5-col without losing information. Surface the file, list the extra columns, ask the operator: **migrate** (decide how to fold the extras — usually into Notes), or **defer** (keep custom layout, accept the lint warning until a `governance/update-indexes` run).

### L. Half-baked specs

For each `doc/spec/<key>/` with some-but-not-all template files (e.g. 3 of 5 required), ask the operator: **complete the missing files** (which typically means a fresh spec session), or **demote to skeleton** (delete the partial files, leave only README, set `status: skeleton`).

## Anti-patterns

Do not:

- pick a value from a `yaml-duplicate-key` finding without operator input — the silently-dropped value can be the freshest one;
- guess a severity from a filename slug — read the body table or ask;
- rename `.yaml` → `.md` without checking which scripts/skills consume the file;
- bulk-apply across categories — show one diff per category so the operator can spot a wrong batch;
- skip the closing report — the next session needs to know what was applied and what was deferred;
- re-run pipeline passes (`pipeline/p3-feature-candidates`, etc.) from this skill — that is `governance/corpus-update` or `pipeline/*` territory.

## Output

- File-by-file diffs (approved by operator before write).
- One canonicalization entry appended to `doc/_meta/corpus-changelog.md`.
- The deferred-findings list as a checklist the operator can work through in subsequent `governance/corpus-update` runs.
