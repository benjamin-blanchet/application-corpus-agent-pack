---
name: code-activity-signals
category: pipeline
description: "Produce a **prioritization signal** from local Git history: which files, folders and modules are most active recently, and which are dormant. This signal is consumed by the deep code analysis pipeline (P3, P4, P5, P7) and by `exploration/ci-cd-activity-discovery` to **order thei…"
---
# Code Activity Signals

## Purpose

Produce a **prioritization signal** from local Git history: which files, folders and modules are most active recently, and which are dormant. This signal is consumed by the deep code analysis pipeline (P3, P4, P5, P7) and by `exploration/ci-cd-activity-discovery` to **order their work**, so the operator sees value on the actively-evolving 20% of the codebase within the first hours of kickstart instead of waiting through alphabetical sweeps.

This skill **does not exclude** anything from analysis. Every pass still covers the full repository surface. Only the **order** of work changes — active areas first, dormant areas after.

The skill runs **once per kickstart, between P1 (code-tree-inventory) and P2 (logical-boundaries)**. On re-runs (continuous enrichment), the signal can be refreshed when the operator asks or when more than 30 days have passed since the last generation.

## Why this exists

A kickstart on a large repository can take many hours of P3/P4/P5/P7 sweeps. Without a prioritization signal, the pipeline processes features in alphabetical or module order — which is independent of where the team's current work actually lives. This means:

- the first artefacts the operator sees may concern dormant code;
- the agent spends analysis budget on areas that are not where current bugs / current features / current incidents are;
- the value-time curve is flat for hours before becoming useful.

With this signal, P3/P4/P5/P7 surface hot areas first. The operator sees relevant findings in the first 1-2 hours, and the full sweep still completes — just in a more useful order.

## Prerequisite

`p1_code_tree_inventory.status == covered`.

This skill needs the P1 inventory (`doc/_meta/code-inventory.yaml`) so it can scope the activity signal to **application source files only**, not to vendored dependencies, build outputs or the pack itself.

## When to use

- **First time** during a kickstart, immediately after P1 and before P2.
- **Refresh** when more than 30 days have passed since `doc/_meta/code-activity-signals.yaml` was generated, or when the operator asks for a re-evaluation after significant team activity.
- **Skip cleanly** when Git is unavailable, the repository has fewer than 20 commits in history, or the repository is a fresh fork without meaningful local history. Record the skip reason in the output file — never silently fall back.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml` — to know which paths count as application source.
2. `doc/_meta/code-pipeline-state.yaml` — to confirm P1 is covered.
3. `doc/_meta/app-profile.yaml` — to honor `application.multi_repo` scope (run per repo, do not cross repos).
4. The previous `doc/_meta/code-activity-signals.yaml` if it exists (to decide refresh vs. re-use).

## Required behavior

### 1. Git availability check

Run a fast probe before any heavy query:

```bash
git rev-parse --is-inside-work-tree
git rev-list --count HEAD
```

Outcomes:

| Probe result | Action |
|---|---|
| Not inside git work tree | Write the output file with `git_available: false` and a one-line reason. Stop. |
| Inside git, but `< 20` commits | Write output with `git_available: true`, `meaningful_history: false`, `commit_count_actual: <n>`. Pipeline passes will see this and fall back to alphabetical ordering. |
| Inside git, sufficient history | Proceed to step 2. |

### 2. Bounded git queries

Run **only** these bounded commands. Do not invent variants, do not run unbounded `git log`.

```bash
# Window A: last 200 commits (recent intensity)
git log -n 200 --pretty=format:'%h%x09%ad%x09%ae%x09%s' --date=short

# Window B: last 180 days (recency reach)
git log --since='180 days ago' --pretty=format:'%h%x09%ad%x09%ae%x09%s' --date=short

# Files touched per window, with commit count per file
git log -n 200 --name-only --pretty=format: | grep -v '^$' | sort | uniq -c | sort -rn
git log --since='180 days ago' --name-only --pretty=format: | grep -v '^$' | sort | uniq -c | sort -rn

# Distinct authors per file (window B, the wider one)
# Run per-file for the top-N candidates only — do not fan out broadly.
git log --since='180 days ago' --pretty=format:'%ae' -- <path> | sort -u | wc -l
```

Hard limits:

- Never run `git log` without a bound (`-n` or `--since`).
- Never run `git blame`. It is slow and not needed for this signal.
- Never use the data for individual performance scoring. Author counts are used only to weight "how spread is this code's recent ownership" — surface this rule in the output's `notes`.

### 3. Trivial-commit filtering

Before computing scores, drop commits that almost certainly do not reflect substantive evolution. Heuristics (apply only when the subject matches clearly):

| Pattern in subject | Filter |
|---|---|
| `^chore: format`, `^style: format`, `^lint:`, `^prettier` | exclude |
| `^chore\(deps\)`, `Bump .* from .* to .*` (Dependabot pattern) | exclude |
| `^Merge branch`, `^Merge pull request` | exclude |
| `^Revert ` | keep, but log separately (these signal previous instability) |

Detect renames at the file level by inspecting `--name-status` on a sample if signals look skewed; do not block on this.

Record the number of commits filtered per category in the output `filters_applied` block. The point is transparency, not perfection — a noisy signal in the right direction is good enough.

### 4. Smart score formula

For each file (and aggregated for folder/module):

```
score = recency_weight × log2(1 + commits) × log2(1 + distinct_authors)

where recency_weight =
   1.0    if last_modified within 30 days
   0.75   if within 90 days
   0.5    if within 180 days
   0.25   otherwise (older than 180 days but touched within window B)
   0.0    if untouched in window B
```

Cap distinct_authors at 8 to avoid bots / many-author files dominating without substance.

Normalize scores to [0, 100] across all tracked files in the output, so percentile bands are easy.

### 5. Aggregate file → folder → module

For each folder containing source files (per P1 inventory):

- sum of file scores
- distinct_authors across all its files
- earliest `last_modified` of any file in it
- count of files

For each "module" (per `doc/_meta/logical-boundaries.yaml` if P2 has already run; otherwise inferred from top-level src folders): aggregate the folder scores under it.

### 6. Hot / dormant area extraction

- **Hot files**: top 20% of the score distribution (or absolute top 30, whichever is smaller).
- **Hot folders**: same rule at folder level.
- **Hot areas**: distinct top-level domain names (`billing`, `subscription`, `auth`...) inferred from hot folder paths.
- **Dormant areas**: top-level folders with 0 commits in window B, scoped to application source (exclude vendor/generated/pack).

### 7. Multi-repo handling

If `application.multi_repo.status == declared` and the current repo's role is `library` or `secondary`, run the signal with reduced importance: smaller commit window (last 100 commits, 90 days), and explicitly note in the output that the signal is informational rather than load-bearing for prioritization.

Never cross repo boundaries with `git` commands — each repo's signal is computed independently.

### 8. Anti-loop and bounds

- This skill executes **once per kickstart** unless the operator explicitly asks for a refresh.
- Re-running it within 30 days produces a delta artefact (`code-activity-signals-delta-<date>.yaml`) rather than overwriting the canonical file.
- The skill is **read-only** outside `doc/_meta/`. It never modifies application source, configuration or git state.

## Output file

```text
doc/_meta/code-activity-signals.yaml
```

### Schema

```yaml
generated_at: "2026-05-23T15:00:00Z"
git_available: true
meaningful_history: true                # false if <20 commits
multi_repo_role: "primary"              # primary | standalone | sibling-app | library | secondary
window:
  commit_count_target: 200
  commit_count_actual: 187
  since: "2025-11-23"
  until: "2026-05-23"
  total_authors_seen: 14
score_formula: "recency_weight × log2(1 + commits) × log2(1 + distinct_authors)"
filters_applied:
  format_lint_only: 14                  # commits excluded
  dependency_bumps: 5
  merges: 8
  reverts_logged_separately: 2
counts:
  source_files_in_inventory: 1834       # from P1
  files_with_activity: 247
  hot_files: 35
  hot_folders: 12
  dormant_top_level_areas: 3
files:                                  # top N by score, capped at 50
  - path: "src/main/java/com/phx/billing/PricingEngine.java"
    commits: 23
    distinct_authors: 5
    last_modified: "2026-05-12"
    days_since_last_modified: 11
    score_raw: 87.4
    score_normalized: 92               # 0–100 percentile
    rank: 1
    reverts_in_window: 0
folders:                                # top N by score, capped at 30
  - path: "src/main/java/com/phx/billing/"
    file_count: 18
    commits: 67
    distinct_authors: 8
    last_modified: "2026-05-22"
    score_normalized: 94
    rank: 1
modules:                                # one entry per module from logical-boundaries
  - name: "billing"
    folder: "src/main/java/com/phx/billing/"
    score_normalized: 94
    files_in_module: 22
    commits_in_module: 67
hot_areas:
  - "billing"
  - "subscription"
  - "auth"
dormant_areas:
  - "src/main/java/com/phx/legacy/migration/"
  - "src/main/resources/i18n/archive/"
notes:
  - "Repository has 187 commits in window (target 200; clamped by history depth)."
  - "14 format-only commits excluded; 5 dependency bumps excluded."
  - "Author counts are used to weight ownership spread per file; never for individual performance ranking."
```

### When `git_available: false` or `meaningful_history: false`

Write a minimal file:

```yaml
generated_at: "2026-05-23T15:00:00Z"
git_available: false
meaningful_history: false
skip_reason: "<one-line reason>"
fallback_for_consumers: "alphabetical ordering"
```

Consumer skills (P3, P4, P5, P7, `ci-cd-activity-discovery`) detect this state and fall back gracefully.

## Update to `doc/_meta/code-pipeline-state.yaml`

This skill is NOT one of the 9 numbered passes. It does not extend or shift the P1–P9 sequence; it inserts between P1 and P2 as an enrichment step. Add a section in `code-pipeline-state.yaml`:

```yaml
code_activity_signals:
  status: covered | partial | skipped | not_started
  reason: "<if skipped>"
  generated_at: <iso>
  meaningful_history: true | false
```

The validator does NOT P0-block on this skill being absent — it is a prioritization aid, not a correctness gate. A P2 "advisory" check warns when it could have been run but wasn't.

## How consumers use the signal

(Brief; see each consumer skill for details.)

| Consumer | Behavior when `code-activity-signals.yaml` exists with `meaningful_history: true` |
|---|---|
| `pipeline/p3-feature-candidates` | After enumerating candidates, **rank them by aggregate folder score** of their module. Process top candidates first in the P3 output (the candidate list order matters for P4). |
| `pipeline/p4-feature-silo-deep-dive` | Iterate features in score-ranked order. The first 5-8 features documented in P4 are the most-active ones. The operator gets useful corpus depth fast. |
| `pipeline/p5-cross-cutting-extraction` | APIs, integrations, messaging, persistence are surfaced in score order within their catalog. The "most-active integration" gets the deep diagram first. |
| `pipeline/p7-structural-issues` | Findings on hot files/folders rank higher than identical findings on dormant ones. Recency fragility outranks dormant fragility. |
| `exploration/ci-cd-activity-discovery` | Consumes this signal instead of re-scanning git itself. The skill's CI/CD classification logic remains, but the activity data is read from here for consistency. |

When `git_available: false` or `meaningful_history: false`, all consumers fall back to their previous ordering (alphabetical / module / first-found) and surface the absence of activity data in their output.

## Anti-patterns

- Use this signal to **exclude** code from analysis. The pipeline still covers everything; only the order changes.
- Treat commit count as proxy for **importance**. A core auth file rewritten years ago by one person can be the most critical code in the repo and have zero recent commits. The signal is a heuristic for *where to start*, not *what matters*.
- Use the author signal for **performance review or individual ranking**. This is explicitly outside the scope of this skill and the pack as a whole.
- Re-run `git log` unbounded "just to be sure". The bounded queries above are the contract.
- Compute the signal during continuous enrichment runs that touch unrelated areas. The signal refresh has its own cadence (30 days or explicit operator request), independent of every-run housekeeping.
- Mix this skill's output with `exploration/ci-cd-activity-discovery`'s CI/CD classification. The two skills cooperate but have different responsibilities; consumers should read each for its own purpose.
