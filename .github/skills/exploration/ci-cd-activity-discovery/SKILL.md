---
name: ci-cd-activity-discovery
category: exploration
description: "Discover, classify and document CI/CD pipelines and recent repository activity so the corpus can distinguish active delivery paths from legacy scripts, stale automation and misleading leftovers."
---
# CI/CD And Recent Activity Discovery

## Purpose

Discover, classify and document CI/CD pipelines and recent repository activity so the corpus can distinguish active delivery paths from legacy scripts, stale automation and misleading leftovers.

This skill is designed for cases where multiple CI/CD systems coexist, such as old Jenkins files plus active GitHub Actions workflows.

## When to use

Use this skill:

- during serious/full kickstart after P1 inventory has found `config_ci` files;
- when `doc/_meta/discovery-coverage.md` has CI/CD or Git activity as `not_started` or `partial`;
- when multiple CI/CD systems are present;
- when the operator asks which pipelines are active;
- before `actionable/readiness-gate` if build, test, deployment or release confidence matters;
- after migrations from Jenkins/GitLab/Azure/CircleCI to GitHub Actions or another platform;
- when recent commit activity should guide roadmap priorities.

## Mandatory reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/repository-map.yaml`
3. `doc/_meta/discovery-coverage.md`
4. `doc/_meta/source-inventory.md`
5. `doc/project/activity/PROJECT_TRAJECTORY.md`
6. `doc/project/activity/PROJECT_ACTIVITY_DISCOVERY_TEMPLATE.md`
7. `doc/project/technical/README.md`
8. `doc/_roadmap/CORPUS_ROADMAP.yaml`
9. Existing CI/CD files found by P1.

## Read-only evidence sources

Use what is available, in this order:

1. Local repository files: `.github/workflows`, `Jenkinsfile*`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/`, `bitbucket-pipelines.yml`, deploy scripts, Docker/IaC manifests.
2. Local Git history: recent commits and file-change frequency.
3. GitHub/GitLab/Bitbucket/Azure DevOps MCP/API when available: workflow runs, PR checks, branches, releases.
4. Jira release tickets or deployment tickets when available.
5. Operator confirmation when status remains ambiguous.

All source-control and CI/CD queries are read-only unless the operator explicitly requests a change and `governance/safe-operation-guardrails` has been applied.

## Minimum local Git scan

### Activity data source (read-first, scan-second)

If `doc/_meta/code-activity-signals.yaml` exists with `meaningful_history: true`, **read it as the canonical source** for recent file/folder activity. The signals skill (`pipeline/code-activity-signals`) is the dedicated owner of git-history scanning; this skill consumes its output rather than duplicating the work. That keeps activity numbers consistent across the corpus (same windows, same filters, same score formula).

When the signals file is missing, marks `meaningful_history: false`, or is stale (> 30 days), fall back to scanning local Git directly with the bounded queries below. Record the fallback in the output so the operator knows the activity data was computed locally and may diverge from a future signals refresh.

This skill's responsibility remains **CI/CD pipeline classification** (active / likely_active / stale / legacy / unknown). The activity data is now sourced from `code-activity-signals.yaml` when available; only the classification logic is unique to this skill.

### Fallback bounded queries (when no signals file available)

When local Git is available and the signals file is missing or marked unfit, scan at least one bounded recent window:

```bash
git log -n 100 --pretty=format:'%h%x09%ad%x09%an%x09%s' --date=short
git log -n 100 --name-only --pretty=format: | sort | uniq -c | sort -nr | head -100
git log --since='90 days ago' --pretty=format:'%h%x09%ad%x09%an%x09%s' --date=short
git log --since='90 days ago' --name-only --pretty=format: | sort | uniq -c | sort -nr | head -100
```

If the repository has fewer commits, use the available history and record the limit. Do not use contributor counts for individual performance ranking.

## CI/CD pipeline classification

Classify every CI/CD artifact:

| Status | Meaning |
|---|---|
| `active` | Evidence from recent workflow runs/checks, recent commits, branch protection, release usage, or operator confirmation. |
| `likely_active` | Current platform/config suggests active use, but external run evidence is missing. |
| `legacy` | Superseded by another pipeline, retained for history or migration, not expected to run. |
| `stale` | No recent commits/runs and no confirmed current use. |
| `unknown` | Insufficient evidence; ask the operator if it affects build/deploy confidence. |

Do not mark Jenkins legacy only because GitHub Actions exists. Look for evidence: recent edits, references in docs, branch protection/check names, deploy jobs, release tickets, or operator confirmation.

## Activity-to-brick mapping

Map recent changed files to corpus bricks:

| Change signal | Route |
|---|---|
| feature files | `doc/project/features/<feature>/` and roadmap feature node |
| API/controller files | `doc/project/apis/` and runtime/API brick |
| batch/job/consumer files | `doc/project/batchs/`, `doc/prod/BATCH_HEALTH.md` and runtime brick |
| integration/config files | `doc/project/integrations/` and data/integration brick |
| CI/CD files | `doc/project/cicd/` and technical mechanism brick |
| production/config/deployment files | `doc/prod/`, infra/deployment risk or watchlist |

Use recent activity to prioritize analysis energy, not as proof of correctness.

## Required outputs

Create or update:

```text
doc/project/cicd/README.md
doc/project/cicd/PIPELINES.md
doc/project/cicd/RECENT_ACTIVITY.md
doc/project/activity/YYYY-MM-DD-project-activity-discovery.md
doc/project/activity/PROJECT_TRAJECTORY.md
doc/_indexes/by-project-signal.md
doc/_indexes/by-technical-component.md
doc/_meta/discovery-coverage.md
doc/_meta/source-inventory.md
doc/_roadmap/CORPUS_ROADMAP.yaml
doc/_graph/nodes.yaml
doc/_graph/edges.yaml
doc/_graph/evidence.yaml
```

## `PIPELINES.md` structure

```markdown
# CI/CD Pipelines

## Pipeline Inventory

| System | File/path | Purpose | Status | Evidence | Notes |
|---|---|---|---|---|---|

## Active Delivery Path

| Stage | Pipeline/job | Trigger | Evidence | Confidence |
|---|---|---|---|---|

## Legacy / Stale Candidates

| File/path | Why it may be legacy/stale | Evidence | Operator question |
|---|---|---|---|

## Risks

| Risk | Evidence | Impact | Next action |
|---|---|---|---|
```

## `RECENT_ACTIVITY.md` structure

```markdown
# Recent Repository Activity

## Window

| Window | Commit count | Source | Limits |
|---|---:|---|---|

## Changed Areas

| Area/path | Change count | Related brick | Interpretation | Follow-up |
|---|---:|---|---|---|

## Active Bricks Suggested By Commits

| Brick | Evidence | Confidence | Roadmap action |
|---|---|---|---|

## CI/CD Changes

| File/path | Recent changes | Interpretation | Follow-up |
|---|---|---|---|
```

## Questions to ask

Ask the operator when:

- two CI systems appear active but only one should be canonical;
- a legacy CI file may still be used by a protected branch or release process;
- Git history is shallow, squashed or unavailable;
- external CI run/check evidence is unavailable but needed for confidence;
- a deployment path is unclear or high-risk.

## Completion criteria

This skill is complete when:

- every CI/CD artifact found by P1 has a status;
- recent Git activity has been scanned or explicitly blocked/unavailable;
- active/stale/legacy status is backed by evidence or an operator question;
- recent changed areas are mapped to corpus bricks or roadmap nodes;
- discovery coverage and source inventory are updated;
- CI/CD risks or contradictions are routed to risks, open questions or update candidates.

## Anti-patterns

- Assume `.github/workflows` is active and `Jenkinsfile` is legacy without evidence.
- Ignore old CI scripts because they are not in the current preferred platform.
- Treat recent commits as business importance without mapping to features/bricks.
- Use contributor activity for productivity ranking.
- Run CI jobs or mutate pipeline settings during discovery.
