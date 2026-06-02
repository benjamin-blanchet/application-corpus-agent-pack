# Pattern: Consistency Boundaries Block

Use in `ARCHITECTURE.md` or `OPERATIONS.md` when a feature has important consistency behavior.

## Boundaries

| Boundary | What must remain consistent | Mechanism | Failure behavior | Evidence |
|---|---|---|---|---|
| `<operation>` | `<state/data>` | transaction/idempotency/lock/retry/compensation/validation | `<behavior>` | `<source>` |

## Gotchas

| Gotcha | Symptom | Mitigation | Related bug/risk |
|---|---|---|---|
