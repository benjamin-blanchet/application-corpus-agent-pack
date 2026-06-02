---
name: p8-code-maturity
category: pipeline
description: "Score the codebase on objective maturity dimensions, using only evidence from P1–P7. Produce a single scorecard the team can compare against itself across kickstart re-runs."
---
# Code Maturity (Pass 8 / 9)

## Purpose

Score the codebase on objective maturity dimensions, using only evidence from P1–P7. Produce a single scorecard the team can compare against itself across kickstart re-runs.

This is **not** a quality judgement of the team. It is a state-of-the-codebase snapshot.

## Prerequisite

`p7_structural_issues.status == covered`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/_meta/cross-cutting-state.yaml`
4. `doc/_meta/code-style-state.yaml`
5. `doc/_meta/structural-issues.yaml`
6. All feature `_evidence.yaml`
7. `doc/project/architecture/*.md`

## Required behavior

For each dimension below, compute the score from **already-collected evidence** (do not re-scan). If a score cannot be computed, mark it `n/a` with the reason.

A score must always cite the inputs that produced it.

## Scoring scale

| Score | Label | Meaning |
|---|---|---|
| 1 | `nascent` | Largely missing or ad-hoc. |
| 2 | `partial` | Present in some areas, inconsistent. |
| 3 | `consistent` | Applied across most of the codebase. |
| 4 | `mature` | Applied uniformly with discipline. |
| 5 | `exemplary` | Above industry baseline; deliberate investment visible. |

Use whole numbers only. Round down on doubt. Always cite the inputs.

## Dimensions

### D1. Architectural clarity

Inputs: P2 (`logical-boundaries.yaml`), P5 (`cross-cutting-state.yaml`), P7 (coupling/parallel findings).

Signals:
- Architectural style explicit and consistent → +
- Layer violations rare → +
- Cycles absent → +
- Parallel implementations rare → +

### D2. Modularity & coupling

Inputs: P2 dependency graph, P7 hot files / god classes.

Signals:
- Modules small and focused → +
- Hot-file count low → +
- God classes few → +
- Boundary violations few → +

### D3. Test discipline

Inputs: P1 test counts, P4 per-feature test references, P7 disabled tests.

Compute:
- `test_files / source_files` ratio per module;
- features with at least one referenced test;
- disabled-test ratio.

Signals:
- Ratio > 0.6 across modules → +
- Every documented feature has tests → +
- Disabled tests < 5% of total → +
- Integration + e2e present → +

### D4. Documentation discipline (in-code)

Inputs: P5 (CROSS_CUTTING auth/observability), P6 (docstring conventions), P7 (docs debt).

Signals:
- Public API has docstrings → +
- Conventions documented and followed → +
- README files present at module level → +
- Diagrams / architecture docs present in repo → +

### D5. Build & dependency health

Inputs: P1 (build systems), P5 (PERSISTENCE), P7 (build/dep findings).

Signals:
- Single dominant build system per module → +
- Dependency versions pinned and current (when EOL data available) → +
- No multiple versions of the same lib on classpath → +
- Lockfiles present and committed → +

### D6. CI/CD maturity

Inputs: P1 (`config_ci`), P7 (build CI findings), `exploration/ci-cd-activity-discovery` when Git/PR/check evidence is available.

Signals:
- Single CI system OR explicit reason for multiple → +
- Build, test, package, deploy stages present → +
- Branch protection / required checks visible → +
- Artifacts published deterministically → +
- Active pipeline path distinguished from stale or legacy pipeline files → +
- Recent commit hotspots and changed build/deploy areas reconciled with corpus bricks → +

Special rule: if P1 lists more than one CI system AND P9 / `exploration/ci-cd-activity-discovery` has not yet reconciled which pipelines are active, this dimension is capped at score 2 until reconciliation.

### D7. Observability & operability

Inputs: P5 (`CROSS_CUTTING.md` observability section), P7 (logging/error findings).

Signals:
- Structured logging uniformly used → +
- Metrics emitted from key flows → +
- Tracing instrumented → +
- Health endpoints present and meaningful → +
- Error responses standardized → +

### D8. Security posture

Inputs: P5 auth section, P7 security findings, validator secret check.

Signals:
- All endpoints from CATALOG have auth annotation/policy → +
- No secrets in repo (validator clean) → +
- Input validation present at boundaries → +
- Dependencies free of known critical CVEs (if data available; otherwise `n/a`) → +

### D9. Data discipline

Inputs: P5 (PERSISTENCE), P7 (persistence findings).

Signals:
- Single migration tool per module → +
- Schema-entity drift < 5% → +
- No raw SQL alongside ORM without policy → +
- Audit columns consistent → +

### D10. Change discipline

Inputs: P7 markers, parallel implementations, dead code.

Signals:
- Deprecation markers carry "remove by" dates → +
- Dead code < 5% of public API → +
- TODO count stable or decreasing (requires prior run; otherwise `n/a` for first run) → +
- Parallel implementations have written migration plans → +

### D11. Domain clarity

Inputs: P5 ENTITIES, P4 BUSINESS_RULES per feature.

Signals:
- Domain language consistent across modules → +
- Entities have clear ownership → +
- Business rules are colocated with the domain → +
- Ubiquitous language traces in code (not just doc) → +

### D12. Operational readiness

Inputs: P4 OPERATIONS files, P5 (MESSAGING DLQ, retries), P7 concurrency.

Signals:
- Retries / DLQ explicit and tested → +
- Idempotency considered where it should be → +
- Timeouts configured at I/O boundaries → +
- Graceful shutdown handled → +

## Output files

```text
doc/_meta/code-maturity.md           # human-readable scorecard
doc/_meta/code-maturity.yaml         # machine-readable scores
doc/_meta/code-pipeline-state.yaml   # P8 status
```

### `code-maturity.yaml` schema

```yaml
generated_at: "..."
based_on:
  pipeline_state_snapshot: "doc/_meta/code-pipeline-state.yaml"
  feature_count: <int>
dimensions:
  D1_architectural_clarity:
    score: 1-5|n/a
    inputs: ["doc/_meta/logical-boundaries.yaml", "doc/_meta/structural-issues.yaml#STRUCT-001"]
    rationale: "Layered style consistent except for two coupling violations in myapp-webapp."
  D2_modularity_coupling:
    score: ...
  # ... D3 through D12
overall:
  weighted_score: <float>           # average; weighting policy below
  weakest_dimensions: ["D5", "D6"]
  strongest_dimensions: ["D11"]
  trajectory: "first_run"           # or "improving"/"stable"/"regressing" if prior run exists
caps_applied:
  - dimension: "D6"
    cap: 2
    reason: "Multiple CI systems unreconciled (P9 pending)"
```

## Weighting policy

Default: simple arithmetic mean across non-`n/a` dimensions.

If the operator declares the application as `mission_critical: true` in `app-profile.yaml`, weight D7, D8, D12 by 1.5x.

If declared as `legacy: true`, weight D5, D10 by 1.5x.

Always record the weighting used.

## Coverage targets (gate for P8 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Each dimension D1–D12 has a score or `n/a` with reason | 100% | yes |
| Each score cites at least one input file | 100% | yes |
| Caps applied are recorded | yes | yes |
| Weighted overall computed | yes | yes |

## Blocking questions

Use `governance/blocking-question-loop` only when scoring needs an input that the operator can give:

- whether the application is mission-critical or legacy;
- whether dependency CVE data is accessible (for D8);
- whether prior maturity scorecards exist (for trajectory).

## Status update

```yaml
pipeline:
  p8_code_maturity:
    status: covered|partial|blocked
    last_run: "..."
    overall_score: <float>
    weakest: []
    strongest: []
    blocks_next_pass: true|false
```

## Anti-patterns

Do not:

- score from intuition; every score must point at evidence;
- assign 4 or 5 without explicit signals;
- compare with other codebases the operator has not authorized;
- mask weaknesses by overweighting strong dimensions;
- proceed to P9 without all dimensions scored or marked `n/a`.
