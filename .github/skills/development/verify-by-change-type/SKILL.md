---
name: verify-by-change-type
category: development
description: "Select and execute the verification that actually proves the change works, based on what type of change it is. Avoids the failure mode where \"tests pass\" is claimed but the only thing run was a unit test that doesn't exercise the real path."
---
# Verify by Change Type

## Purpose

Select and execute the verification that actually proves the change works, based on what type of change it is. Avoids the failure mode where "tests pass" is claimed but the only thing run was a unit test that doesn't exercise the real path.

## When to use

In **Step 9** of the developer lifecycle, after implementation (Step 8) is
complete and before consolidated review (Step 10) and owner closeout (Step 11).

## Verification matrix

| Change type | Required verification | What "done" looks like |
|---|---|---|
| **Pure backend logic** | Unit tests + regression tests for each Step 4.1 zone | All listed tests green; new tests cover the regression zones |
| **Schema / data migration** | Dry-run migration; smoke `SELECT` before/after; rollback rehearsed | Migration applies on a local copy without error; rollback succeeds; sample query returns expected result |
| **Query / persistence change** | Query plan if production tools allow; index usage explained | Plan shows expected index; no unexpected table scan; no N+1 introduced |
| **Public API change** | Contract tests; consumer-side sanity (or sibling sync per multi-repo policy) | Contract tests pass; documented breaking changes intentional |
| **Batch / scheduled job** | Dry-run on a bounded slice; observe metrics if available | Dry-run completes; failure semantics verified (partial-failure restart) |
| **Async / messaging** | Replay a test message; verify idempotency and ordering claims | Test message processes correctly; replay does not produce duplicate side effects |
| **UI / frontend** | Start the dev server; exercise the feature in a browser; test golden path + 1-2 edge cases | Manual walkthrough completed; screenshot or trace recorded; type checks and unit tests pass |
| **Hot path / perf-sensitive** | Profile or microbenchmark; compare to the budget set in the spec | Measurement recorded; result within budget or gap documented |
| **Configuration change** | Apply change locally; restart affected service if applicable; confirm new behavior | Service restarts cleanly; new value observable in the expected place |
| **Cross-cutting (logging, errors, telemetry)** | Trigger the path that emits; verify the new signal appears | Signal verified in test output / local observability tool |

A change can match multiple rows. Run the verification for each matched row.

## Required output

Record what was actually run, what was skipped, and why. Format:

```markdown
## Verification (Step 9)

- Change type(s):   <list>
- Tests run:        <unit / integration / regression / contract / e2e / manual> — <pass | fail>
- Verifications done:
  - <verification name>: <pass | fail | partial> — <evidence ref>
- Verifications skipped:
  - <verification name>: <reason — tool not attached / not feasible from this context / N/A>
- Gaps recorded in TESTS.md: <yes | no>
```

If any **required** verification was skipped (not because it was N/A, but because tooling was absent), record this as a **gap** in `TESTS.md` of the spec package. Do not claim verification you did not perform.

## Rules

- **Honesty over completeness.** "I couldn't run the migration dry-run because the local DB isn't attached" is the correct outcome — far better than claiming success.
- **Code correctness ≠ feature correctness.** Type checks and unit tests verify the first, not the second. For UI/integration/E2E, manual verification or a real test is required.
- **Tool gaps must be surfaced.** If a verification can't run because an MCP tool, a local environment, or a credential is missing, **say so explicitly** and tell the operator what would be needed. Do not silently downgrade to a weaker verification.
- **Performance claims require measurement.** A spec that says "negligible performance impact" without a measurement is a hypothesis, not a result. Either measure or mark the claim as `confidence: probable`.
- **Regression verification is mandatory per zone.** Step 4.1 enumerates the zones; Step 9 must address each one (with a test, a rationale, or an explicit gap).
