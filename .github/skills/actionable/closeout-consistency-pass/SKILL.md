---
name: closeout-consistency-pass
category: actionable
description: "Make the corpus internally consistent before declaring any end-of-kickstart, actionable readiness or adoption guide state."
---
# Closeout Consistency Pass

## Purpose

Make the corpus internally consistent before declaring any end-of-kickstart, actionable readiness or adoption guide state.

This skill fixes the failure mode where rich content exists in some files but indexes, source registry, readiness files and state files still say `not_started`, `unknown` or template-only.

## When to use

Use after:

- P5 catalog creation;
- production discovery;
- project activity discovery;
- `actionable/brick-inventory`;
- every `actionable/brick-deep-dive` batch;
- before `actionable/readiness-gate`;
- before `governance/team-handover` adoption guide material.

## Mandatory first reads

1. `doc/_meta/corpus-state.yaml`
2. `doc/_meta/discovery-coverage.md`
3. `doc/_meta/information-sources.yaml`
4. `doc/_meta/mcp-readiness.md`
5. `doc/_meta/mcp-source-wizard.md`
6. `doc/_meta/deep-analysis-plan.md`
7. `doc/_meta/open-questions.md`
8. `doc/_meta/blocking-questions.md`
9. `doc/_indexes/`
10. `doc/prod/`
11. `doc/project/`

## Required checks

1. **Indexes**: refresh every index from canonical files.
2. **Local prod indexes**: update `known-bugs/INDEX.md`, `structural-risks/INDEX.md`, `watchlist/INDEX.md`, `root-cause-playbooks/INDEX.md`.
3. **Production routing**: route production snapshot facts to `COMPONENT_MAP.md`, `INFRA_STATE.md`, `BASELINES.md`, `BATCH_HEALTH.md`, watchlist and playbooks where applicable.
4. **Project activity**: if `project_activity_discovery_status` is covered, ensure a dated discovery file exists under `doc/project/activity/`.
5. **Source registry**: if Jira/Confluence/Dynatrace were used, update `information-sources.yaml`, `mcp-readiness.md` and `mcp-source-wizard.md`.
6. **Coverage details**: if an overall lane is `covered`, its detailed target table must not still be `not_started`.
7. **Question sync**: resolved open questions must not remain active blocking questions.
8. **State sync**: `corpus-state.yaml` must reflect actual files, not aspirations.
9. **Templates/examples**: examples/templates must be explicitly excluded from completeness and indexes.

## Output

Update files directly. If a gap cannot be fixed immediately, write it to:

```text
doc/_meta/update-candidates.md
doc/_meta/actionable-readiness.md
doc/_meta/blocking-questions.md
```

## Anti-patterns

Do not:

- say “covered” in state while detailed tables still say `not_started`;
- leave local indexes empty when canonical files exist;
- rely on git history instead of corpus changelog/source registry for adoption-critical traceability;
- leave contradictory BQ/OQ statuses.
