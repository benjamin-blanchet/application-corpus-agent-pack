---
name: jira-exploration
category: exploration
description: "Read Jira or equivalent work-tracking data as source material. Extract needs, decisions, acceptance criteria, defects, delivery themes and links without treating unvalidated ticket text as ground truth."
---
# Jira Exploration

## Purpose

Read Jira or equivalent work-tracking data as source material. Extract needs, decisions, acceptance criteria, defects, delivery themes and links without treating unvalidated ticket text as ground truth.

Use this skill for ticket-level analysis and as an input to `exploration/project-activity-discovery`. For cross-project trajectory and references from other Jira projects, combine it with `exploration/atlassian-project-trajectory`.

## Canonical paths

- Work-tracking source reference: `doc/mcp/atlassian.md`
- Specs: `doc/spec/`
- Project activity snapshots: `doc/project/activity/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`

## Required behavior

1. Read `doc/CORPUS_MAP.md` and `doc/CORPUS_MANIFEST.md` first.
2. Check `doc/_meta/app-profile.yaml` for work-tracking provider and project keys.
3. Use only verified Jira projects, boards, filters, fields and statuses.
4. Distinguish ticket claims, verified facts, hypotheses and unknowns.
5. Do not invent business rules from ticket wording alone.
6. Preserve source references: issue key, title, status, type, component, version, links and retrieval date.
7. Route durable knowledge to specs, features, prod knowledge or activity snapshots.
8. Reconcile affected corpus files instead of appending contradictions.
9. Do not assume the application appears only in its main Jira project. When the task is project trajectory or serious kickstart, search by app aliases across accessible projects when supported.

## Ticket-level extraction

For a ticket or small ticket set, extract:

- user need and business goal;
- acceptance criteria;
- affected features, screens, APIs, batches, data or integrations;
- linked bugs/incidents/support cases;
- **target release/version** — read the Jira `fixVersion` (or equivalent target-release field) verbatim. This value drives the spec folder path `doc/spec/<version>/<jira>/`. If the field is empty, missing, or contains more than one value, flag it explicitly and ask the operator before creating the spec package — never guess a version;
- open questions;
- evidence and confidence level.

Produce or update a spec package under `doc/spec/<version>/<jira>/` when the ticket is actionable. `<version>` is the normalized slug of the Jira `fixVersion` resolved above; `<jira>` is the issue key.

## Activity-level extraction

For project discovery, support `exploration/project-activity-discovery` by extracting:

- active epics and initiatives;
- dominant ticket types and themes;
- stale or aging tickets;
- reopened or churned work;
- defect pressure;
- support or incident-linked work;
- release/version focus;
- components or features with repeated activity.
- tickets in other Jira projects that mention this app, its APIs, its jobs, its queues, its service code or its integrations;
- cross-app blockers, dependencies, migrations, release coupling and incident/support references.

## Useful Jira query patterns

Record verified JQL in `doc/mcp/atlassian.md` only after validation. Candidate patterns may include:

```text
project = <KEY> AND updated >= -90d ORDER BY updated DESC
project = <KEY> AND statusCategory != Done ORDER BY priority DESC, updated DESC
project = <KEY> AND issuetype in (Bug, Incident) AND updated >= -90d ORDER BY updated DESC
project = <KEY> AND labels is not EMPTY AND updated >= -90d
text ~ "<APP_ALIAS>" AND project not in (<MAIN_KEYS>) ORDER BY updated DESC
text ~ "<APP_ALIAS>" AND issuetype in (Bug, Incident) AND updated >= -180d ORDER BY updated DESC
```

Do not commit unverified JQL as a reusable convention.

## Privacy and governance

Jira data may contain names, comments and sensitive delivery context. Use it to understand the project, not to evaluate individual performance.

Prefer team-level, feature-level and component-level observations.
