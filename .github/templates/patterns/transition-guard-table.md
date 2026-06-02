# Pattern: Transition Guard Table

**Where**: `WORKFLOWS.md`, right after the state machine diagram.

**Purpose**: Tabular complement to the state machine. Lists every transition with its trigger, guard condition, and the event recorded in the audit log.

## Template

```markdown
### Transition guard table

| From | To | Trigger | Guard | Recorded as |
|------|----|---------|-------|-------------|
| ∅ | <INITIAL> | `<method()>` | <invariants checked> | <EVENT_TYPE> |
| <FROM> | <TO> | <action> | <condition> | <EVENT_TYPE> |
| <FROM> | <TO> | <webhook from external> | <condition> | <EVENT_TYPE> |
| <FROM> | <TO> | <scheduled task> | `<predicate>` | <EVENT_TYPE> |
```

## Real example

See `doc/project/features/_example-cross-channel-request/WORKFLOWS.md` Transition guard table — 14 rows covering all transitions.

## Anti-patterns

- Missing rows for "obvious" transitions: invariably someone will add an illegal one
- Guard column empty: the guard is precisely what prevents bugs
- Skipping the "Recorded as" column: audit traceability lost
