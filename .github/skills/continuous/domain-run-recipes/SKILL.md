---
name: domain-run-recipes
category: continuous
description: "Provide reusable recipes for common continuous corpus runs."
---
# Domain Run Recipes

## Purpose

Provide reusable recipes for common continuous corpus runs.

Recipes are not rigid workflows. They give the Corpus agent a strong default for selecting sources, asking questions, updating corpus files and expanding roadmap nodes.

## When to use

Use this skill when the operator asks for a domain-oriented run, such as:

- production analysis;
- memory stats over a week;
- top used features;
- feature deep dive from code and prod;
- batch health;
- integration dependency analysis;
- Jira/Confluence trajectory;
- historical ticket mining;
- code vs production reality.

## Common setup

Every recipe starts with:

1. Select or create a roadmap node.
2. Read existing linked corpus files.
3. Read required source contracts and historical coverage, then run point-in-time probes for the transports this run needs.
4. Use bounded read-only queries.
5. Ask the operator when a high-value interpretation question appears.
6. Consolidate into canonical corpus files.
7. Update roadmap, graph, run ledger and next best actions.

## Recipe: Production daily analysis

Intent examples:

```text
analyse la prod
regarde la journee en prod
```

Sources:

- Dynatrace 24h;
- `exploration/production-temporal-correlation` when current signals need comparison with previous slices;
- existing `doc/prod/` knowledge;
- recent run ledger;
- optionally Jira incidents/support if available.

Focus:

- current errors, latency, availability, restarts;
- top affected services/endpoints;
- surprising deviations from previous 7d/30d context;
- candidate bugs, watchlist items, playbooks or roadmap child nodes.

Update:

- `doc/prod/snapshots/YYYY-MM-DD-production-discovery.md`
- `doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md` when current signals need multi-slice comparison
- `doc/prod/BASELINES.md`
- `doc/prod/watchlist/`
- `doc/_roadmap/*`
- `doc/_runs/*`

## Recipe: Production memory week

Intent examples:

```text
stats memoire prod sur la semaine
analyse memoire serveurs prod 7j
```

Sources:

- Dynatrace 7d memory metrics;
- 24h current state;
- 30d trend when useful;
- temporal slices from `exploration/production-temporal-correlation` when memory pressure varies by day/hour/deploy/batch window;
- deployments/restarts when visible;
- batch/job windows if available.

Focus:

- memory pressure by service/process/host/container;
- GC or runtime-specific signals when visible;
- correlation with deployments, traffic, batch windows or incidents;
- risk/watchlist candidates.

Update:

- `doc/prod/INFRA_STATE.md`
- `doc/prod/memory-analyses/`
- `doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md`
- `doc/prod/watchlist/`
- feature or batch `OPERATIONS.md` when correlation is strong.

## Recipe: Top used features

Intent examples:

```text
liste les features les plus utilisees de l'app
priorise les features via Dynatrace
```

Sources:

- Dynatrace endpoint/service/request volume over 24h/7d/30d;
- temporal correlation slices when top usage differs by day, business hours, batch window or release period;
- P5 API catalog;
- P4 feature folders;
- routing/controller code when needed.

Focus:

- top endpoints or transactions by volume;
- mapping endpoint -> feature/API/screen/batch;
- corpus depth for each high-usage feature;
- children for top features that need code/prod deepening.

Update:

- `doc/_indexes/by-feature.md`
- `doc/project/features/<feature>/OPERATIONS.md`
- `doc/prod/SERVICE_FLOWS.md`
- roadmap nodes for top-used features.

## Recipe: Feature code + prod deep dive

Intent examples:

```text
creuse cette feature
on ameliore le niveau de detail de cette feature
```

Sources:

- P4 feature folder and `_evidence.yaml`;
- transitive code paths;
- tests;
- Dynatrace signals for endpoints/jobs;
- Jira/Confluence references where available.

Focus:

- behavior, workflows, business rules, edge cases;
- prod usage, failures, latency, dependencies;
- data model and integration touchpoints;
- change guidance for Developer/Functional Analyst/Reliability Analyst.

Update:

- feature folder files;
- graph nodes/edges;
- roadmap children when deeper detail is useful.

## Recipe: Batch health

Sources:

- batch/job code and scheduling config;
- Dynatrace batch/consumer/job signals;
- logs summarized by pattern;
- Jira incidents/support;
- Confluence runbooks.

Focus:

- schedule, trigger, inputs, outputs;
- volume, duration, failure/retry behavior;
- dependencies and downstream effects;
- recovery playbook and watchlist.

Update:

- `doc/project/batchs/<batch>/README.md`
- `doc/prod/BATCH_HEALTH.md`
- `doc/prod/root-cause-playbooks/`
- `doc/prod/watchlist/`

## Recipe: Atlassian trajectory

Sources:

- Jira main project and cross-project searches;
- Confluence declared spaces and cross-space searches;
- app alias dictionary from repo/prod/P5;
- Git/PR/CI when available.

Focus:

- current roadmap, migration, release, dependencies;
- other apps mentioning this app;
- closed historical tickets only when the roadmap says historical mining is valuable;
- stale docs or contradictions to reconcile.

Update:

- `doc/project/activity/PROJECT_TRAJECTORY.md`
- `doc/project/activity/CROSS_ATLASSIAN_REFERENCES.md`
- `doc/_roadmap/*`
- risks/questions as needed.

## Recipe: Code vs production reality

Sources:

- P5 API/integration/messaging/persistence catalogs;
- Dynatrace runtime architecture and service flows;
- `exploration/production-temporal-correlation` for multi-slice evidence when a mismatch might be time-window dependent;
- code entry points;
- source coverage state.

Focus:

- code exposes something not observed in production window;
- production shows dependency/flow missing from code-derived corpus;
- high-traffic prod path has shallow feature documentation;
- low-traffic code path can be parked.

Update:

- P5 catalogs;
- `doc/prod/RUNTIME_ARCHITECTURE.md`;
- `doc/prod/SERVICE_FLOWS.md`;
- `doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md`;
- roadmap priorities.

## Recipe: Production temporal correlation

Intent examples:

```text
analyse les problemes prod des derniers jours
compare la prod sur plusieurs creneaux
croise les erreurs prod avec le code
regarde si le probleme arrive la nuit ou apres deploy
```

Sources:

- Dynatrace/APM/logs across selected slices from `exploration/production-temporal-correlation`;
- P5 catalogs and relevant code paths;
- deployment markers, restarts and batch windows when visible;
- Jira incidents/support when available.

Focus:

- current vs previous day;
- repeated patterns over 3d/7d;
- 30d trends or rare flows;
- business-hours vs night/batch behavior;
- before/after deployment comparison;
- signal -> runtime entity -> code/catalog/brick mapping.

Update:

- `doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md`
- `doc/prod/known-bugs/`, `doc/prod/structural-risks/`, `doc/prod/watchlist/`, `doc/prod/root-cause-playbooks/`
- `doc/prod/SERVICE_FLOWS.md`, `doc/prod/BATCH_HEALTH.md`, `doc/prod/INFRA_STATE.md`, `doc/prod/BASELINES.md`
- relevant feature/batch `OPERATIONS.md`
- roadmap, graph and run ledger.

## Sensitive data rule

Logs and payloads are summarized by default. Include anonymized examples only when useful and safe. Never persist secrets, tokens or raw sensitive payloads.
