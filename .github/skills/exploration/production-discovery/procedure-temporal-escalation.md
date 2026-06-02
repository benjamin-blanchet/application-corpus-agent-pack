# Procedure — temporal correlation escalation

Loaded by `production-discovery` when bundle findings warrant
window-to-window comparison.

## When to escalate from snapshot discovery

Escalate to `exploration/production-temporal-correlation` when:

- a top error or latency hotspot appears in more than one window;
- a signal appears only on specific days, business hours, night windows or batch windows;
- memory / resource pressure may correlate with traffic, deployments, restarts or batch execution;
- a production flow is missing from the code-derived catalog or the catalog declares a flow not observed in production;
- a runtime entity cannot be mapped to a repository component;
- a reliability finding is strong enough to become a bug, risk, watchlist item or playbook.

## What the escalation creates

The escalation must create or update:

```text
doc/prod/reliability-analyses/YYYY-MM-DD-production-temporal-correlation.md
```

and route durable findings to canonical corpus files (see
`references/output-routing.md`).

If escalation is impossible (tool gap, tenant policy), record the limitation
in `doc/_meta/discovery-coverage.md` and surface it in the snapshot.
