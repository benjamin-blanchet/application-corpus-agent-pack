---
name: risk-analysis-checklist
category: development
description: "Produce the structured risk picture that the spec must address — covering regression, code quality, performance and (when multi-repo is declared) cross-repo concerns. This is the input to `IMPACTS.md` and `TESTS.md` of the spec package."
---
# Risk Analysis Checklist

## Purpose

Produce the structured risk picture that the spec must address — covering regression, code quality, performance and (when multi-repo is declared) cross-repo concerns. This is the input to `IMPACTS.md` and `TESTS.md` of the spec package.

## When to use

In **Step 4** of the developer lifecycle, after the change surface has been mapped (Step 3). The depth applied depends on the class from `development/change-triage`:

- Trivial: mental check only, no table produced.
- Small: 4.1 (regression) only.
- Standard: 4.1 + 4.2 (quality) + 4.3 (performance).
- Large: all four (4.1–4.4), with explicit cross-repo entries.

## 4.1 Regression risk

| Regression zone | How to detect | Mitigation in spec |
|---|---|---|
| **Direct call sites** | Fan-in from `doc/_graph/edges.yaml`; `grep` confirms | List each caller; explicit regression test or rationale to skip |
| **Inherited / overridden behavior** | Subclasses, interface impls | Verify each impl; cover with regression test |
| **Shared utility usage** | High fan-in node | Cover representative call sites; flag risky ones |
| **Behavior covered by integration test** | Integration test catalog | Run the integration suite locally if feasible |
| **Behavior visible to a public API / contract** | `doc/project/apis/CATALOG.md`, message contract, schema | Define backward-compat plan or version bump |
| **Behavior touched by a known prior incident** | `doc/prod/known-bugs/`, `incidents/` | Read the playbook; ensure mitigation isn't undone |

## 4.2 Code quality risk

| Quality risk | How to detect | Action |
|---|---|---|
| **P7 structural risk in the file/module** | `doc/prod/structural-risks/RISK-CODE-*` | Read the risk; do not extend the smell |
| **God file / class** | Oversized file flagged in P7 | Touch only the targeted symbol; do not refactor opportunistically |
| **Parallel implementation** | P7 finding | Reconcile or stop. **Do not extend the duplicate path.** |
| **Dead code in proximity** | P7 finding | Do not bring dead code back to life by accident |
| **Style/naming deviation** | P6 sheet says X, code says Y | Code wins for now; flag as a P9 reconciliation candidate |
| **Missing or stale tests near the change** | Empty/sparse test sibling | Add minimal coverage **before** modifying the symbol |

## 4.3 Performance risk

| Perf risk | How to detect | Action |
|---|---|---|
| **Hot path** | Function on a request path, batch loop, scheduled job inner loop | Profile expectation; avoid N+1, avoid allocations in tight loops |
| **Database query change** | Inline SQL / ORM query | Verify index; request query plan if production tools allow; chunk if scanning |
| **External call introduced or moved** | New / moved RPC, HTTP, queue write | Timeout, retry policy, circuit / bulkhead; sync vs async decision documented |
| **Memory / object lifetime** | New large allocation, cache, in-memory aggregation | Bound the size; explicit eviction strategy |
| **Concurrency / locking change** | Transaction scope, lock, lease | Document isolation level; avoid widening the critical section |
| **Batch sizing** | New batch step or window change | Explicit chunk size; failure / restart semantics |

## 4.4 Cross-repo risk (multi-repo declared)

Only applies when `application.multi_repo.status == declared` in `doc/_meta/app-profile.yaml`.

| Cross-repo risk | How to detect | Action |
|---|---|---|
| **Sibling consumer impacted** | Change to a contract in `multi_repo.consumed_by[i].contracts` | Spec must include a sibling sync recommendation per `sync_policy` |
| **Sibling library upgrade implied** | Internal library bump touches `adjacent_repos[i]` | Spec must list the sibling repos to run after merge |

## Required output

The skill produces a **risk picture block** to paste into `IMPACTS.md`:

```markdown
## Regression zones
- <zone>: <call sites or scope> — Mitigation: <test or rationale>

## Code quality risk
- <risk>: <detection> — Action: <what we do>

## Performance impact
- <risk>: <expected effect> — Verification: <method>

## Cross-repo impact
- <sibling>: <contract touched> — Recommendation: <per sync_policy>
```

Rows marked **N/A** must include a reason ("N/A — no public contract touched"). Never leave a row silent.

## Rules

- **Do not skip rows silently.** Each applicable sub-table must be fully addressed at the depth the triage class requires.
- **Cite the evidence.** A regression zone with no call-site reference is not a regression zone — it's speculation. Use the graph, P7 findings, prod knowledge files.
- **P7 findings are not optional reading.** If a `RISK-CODE-*` exists for the file you're touching, you must have read it before producing the risk picture.
- **Cross-repo risk is binary: on or off.** It's on if and only if `multi_repo.status == declared`. Otherwise the entire 4.4 block is omitted.
