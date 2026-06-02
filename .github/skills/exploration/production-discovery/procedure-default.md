# Procedure — default production discovery pass

Loaded by `production-discovery` for every execution. Bounded snapshot of
the production surface, scope-adjusted by the code-first guard.

## Default discovery windows

Use a small and explicit time window unless the operator gives another one:

```text
last 24h  - immediate state, current anomalies
last 7d   - recurring patterns, weekly jobs, common dependencies
last 30d  - trend, low-volume flows, monthly jobs, rare errors
```

If the tool cannot query a requested window, record the limitation.

For problem understanding, the three windows are a baseline. Escalate to
`procedure-temporal-escalation.md` when signals warrant comparison across
business hours / batch windows / deployment overlays.

## Discovery questions (the snapshot must try to answer)

1. Is the application visible in production observability?
2. Which runtime services, processes, jobs, hosts, containers or components are visible?
3. Does the runtime topology match what the repository suggests?
4. What are the top error signals?
5. What are the top latency or performance hotspots?
6. Are there recurring failures, retries, crashes, restarts, memory pressure or saturation signals?
7. Are batch jobs, queues, schedulers, consumers or integrations visibly unhealthy?
8. Which findings deserve watchlist, bug, risk or playbook entries?
9. Which findings are surprising enough to discuss with the operator and later with the team?

## Minimum coverage (when a production source is available)

Cover and record:

- app visibility in the observability source;
- runtime entity / service / process mapping to repo components;
- inbound callers, entrypoints and protocols where visible;
- outbound dependencies, external services, databases and queues where visible;
- service-to-service topology and adjacent ecosystem;
- log / metric / trace samples across 24h, 7d and 30d windows when available;
- last 24h immediate state;
- last 7d recurring errors;
- last 7d latency / performance hotspots;
- last 30d trends when useful and safe;
- availability, restart and crash signals;
- batch / job / consumer health where applicable;
- downstream dependency failures;
- infrastructure or host/container signals when visible;
- monitoring gaps, naming mismatches and unsupported queries.

Update `doc/_meta/discovery-coverage.md` with each target as `covered`,
`partial`, `blocked` or `not_applicable`.

## Inventory section (the only section run in inventory mode)

When code is `not_started` or `started`, run **only** this section:

1. Identify which observability sources are available (Dynatrace tenants,
   APM endpoints, log DBs, ELK, exports).
2. For each available source, list visible entities matching the app:
   service names, processes, hosts, tags, environments, management zones.
3. Record naming conventions and apparent perimeter.
4. **Do not interpret.** No flow reconstruction, no root cause, no
   integration mapping.
5. Mark all findings `confidence: unknown` or `probable`.
6. Propose `pipeline/p1-code-tree-inventory` as the next bounded action.

The inventory result still feeds `doc/prod/snapshots/YYYY-MM-DD-production-discovery.md`,
restricted to "Source availability" and "Runtime topology observed" sections.
