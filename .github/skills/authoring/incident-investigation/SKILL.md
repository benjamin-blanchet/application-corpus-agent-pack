---
name: incident-investigation
category: authoring
description: "Analyze an incident and turn durable findings into operational corpus knowledge."
---
# Incident Investigation

## Purpose

Analyze an incident and turn durable findings into operational corpus knowledge.

## Standard incident output

```text
doc/prod/incidents/YYYY-MM-DD-<slug>/
  ANALYSIS.md
```

## Required sections

- Time window.
- User/business impact.
- Observed symptoms.
- Evidence table.
- Hypotheses considered.
- Root cause assessment with confidence.
- Mitigation.
- Follow-up actions.
- Durable corpus updates required.

## Durable knowledge routing

| Finding | Target |
|---|---|
| Confirmed recurring bug | `doc/prod/known-bugs/BUG-<id>-<slug>.md` |
| Systemic pattern | `doc/prod/structural-risks/RISK-<id>-<slug>.md` |
| Reusable investigation method | `doc/prod/root-cause-playbooks/PLAYBOOK-<slug>.md` |
| Monitoring focus | `doc/prod/watchlist/WATCH-<slug>.md` |
| Feature-specific production behavior | `doc/project/features/<feature>/OPERATIONS.md` |

Never claim a root cause from a single uncorroborated signal.
