---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Test Strategy — `<topic>`

<!--
Required for Small / Standard / Large.
Trivial: skip this file entirely (unit tests proportional to the change still apply).
Small: keep "Unit" + "Regression" only.
Standard: all six categories.
Large: + measured perf verification matching the budget in IMPACTS.md.

The Regression section MUST cover every row of IMPACTS.md "Regression zones"
(or have an explicit rationale for skipping). Apply development/verify-by-change-type
to choose verifications.

After Step 9, this file is updated with actual results (pass/fail/skipped).
-->

## Unit tests

| Test name | File | Scenario | Result (post-Step 9) |
|---|---|---|---|
| `<…>` | `<test path>` | `<happy path / edge / error>` | `<pending | pass | fail>` |

## Regression tests

<!-- One per regression zone in IMPACTS.md. Skipping a zone requires explicit rationale. -->

| Regression zone | Test name | Scenario | Result |
|---|---|---|---|
| `<zone from IMPACTS>` | `<test path>` | `<call site / behavior>` | `<…>` |

## Integration / e2e tests

| Test name | Stack involved | Scenario | Result |
|---|---|---|---|
| `<…>` | `<components>` | `<…>` | `<…>` |

## Quality checks (static)

<!-- Lint, type check, complexity threshold, security scan, etc. Standard for the repo. -->

| Check | Tool | Expected output | Result |
|---|---|---|---|
| Lint | `<eslint | rubocop | …>` | clean on touched files | `<…>` |
| Type check | `<tsc | mypy | …>` | clean | `<…>` |
| Complexity / hotspots | `<sonarqube | radon | …>` | no new blocker | `<…>` |

## Performance verification

<!--
Standard: a verification method (profile, query plan, slice dry-run).
Large: actual measurement vs. budget set in IMPACTS.md "Performance impact".
-->

| Verification | Method | Budget (from IMPACTS) | Measured | Result |
|---|---|---|---|---|
| `<query plan>` | `EXPLAIN` / equivalent | `<…>` | `<…>` | `<…>` |
| `<hot path profile>` | profiler / microbench | `<…>` | `<…>` | `<…>` |
| `<batch slice dry-run>` | bounded slice | `<…>` | `<…>` | `<…>` |

## Manual verification

<!--
Per change type (see development/verify-by-change-type):
  - UI / frontend       → dev server + browser walkthrough (golden path + 1-2 edges)
  - Schema migration    → dry-run on a local copy + smoke SELECT
  - Async / messaging   → replay a test message + verify idempotency / ordering
  - Batch / scheduled   → dry-run on a bounded slice + observe metrics if available
  - Configuration       → apply locally + restart + confirm new behavior
-->

| Scenario | Method | Evidence (screenshot, log, trace) | Result |
|---|---|---|---|
| `<…>` | `<…>` | `<…>` | `<…>` |

## Gaps recorded

<!-- Verifications that could not run from this context (missing tool, missing env, missing data). -->

- `<verification>`: `<reason — tool not attached / env unavailable / not feasible>`
