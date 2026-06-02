---
name: p7-structural-issues
category: pipeline
description: "Surface the **structural truth** of the codebase: coupling, cycles, dead code, parallel implementations, deprecated paths, abandoned migrations, leaky abstractions, hot files, dangerous patterns."
---
# Structural Issues (Pass 7 / 9)

## Purpose

Surface the **structural truth** of the codebase: coupling, cycles, dead code, parallel implementations, deprecated paths, abandoned migrations, leaky abstractions, hot files, dangerous patterns.

This pass produces the engineering risk register. P8 turns it into a maturity scorecard.

## Prerequisite

`p6_code_style_naming.status == covered`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/_meta/cross-cutting-state.yaml`
4. `doc/_meta/code-style-state.yaml`
5. All feature `_evidence.yaml` from P4
6. `doc/project/architecture/INTEGRATION_MAP.md`, `MODULES.md`, `LAYERS.md`
7. `doc/project/technical/CROSS_CUTTING.md`
8. `doc/_meta/code-activity-signals.yaml` (if it exists — see Prioritization input below)

## Prioritization input

If `doc/_meta/code-activity-signals.yaml` exists with `meaningful_history: true`, **boost the severity ranking** of findings that touch hot files or hot folders. A god-class in a hot folder is more urgent than the same god-class in a dormant folder — same code shape, very different real-world risk.

Concretely, when ranking the findings produced below:

- If a finding's file appears in the `hot_files` list of the signals, **raise** its surfaced rank within its severity bucket (it appears earlier in `structural-issues.yaml` and is more likely to be promoted to `doc/prod/structural-risks/RISK-CODE-*`).
- If a finding's file appears in the `dormant_areas` list, **lower** its surfaced rank (still recorded, but grouped under "Dormant code" so the operator can decide whether it warrants action).
- Do not change a finding's severity (`critical` / `high` / `medium` / `low`) based on activity — severity reflects structural risk; activity reflects exposure to that risk. Both deserve to be visible.

When the signal is missing or `meaningful_history: false`, fall back to severity-only ranking and note this in the output header.

## Required behavior

For each category below, scan systematically. Record findings with **file:line** citations and severity. Do not editorialize; describe the smell + cite the code + propose the impact.

## Categories to scan (every category mandatory; "none found" must be explicit)

### A. Coupling & dependencies

- **Cross-layer violations** — domain importing infrastructure, controller calling DAO directly, etc. Cite the imports.
- **Cross-module cycles** — based on actual code imports (P2 only checked declared deps).
- **God classes** — classes with > 500 LOC OR > 30 public methods OR > 15 dependencies. List the worst 10.
- **Hot files** — files imported by > N other files. List top 20.
- **Static state** — singletons holding mutable state, global registries.

### B. Parallel implementations / migrations in flight

- Two classes/methods that do the same thing with different names (e.g. `OldFooService` + `FooServiceV2`).
- Toggles / feature flags switching between old and new behavior.
- Half-applied refactors: new pattern in some modules, old pattern in others.
- Comment markers: `// LEGACY`, `// DEPRECATED`, `// TODO migrate`, `// remove after`.
- Database tables with both `OLD_` and `NEW_` siblings, or `*_V2` columns.
- Two CI systems both wired (P1 reconciliation hook lives here too).

### C. Dead and dying code

- Public methods never called within the repo (cross-reference scan).
- Files not imported anywhere (excluding tests and entry points).
- Endpoints not wired to any route.
- Migration files referencing tables/columns dropped later.
- Disabled tests (`@Disabled`, `@Ignore`, `xit`, `skip`) — list every one with the reason if present.
- TODO/FIXME/HACK/XXX/REVIEW markers — count, locations, oldest.

### D. Error handling smells

- Empty catches.
- `catch (Exception)` swallowing.
- Generic logging instead of typed handling.
- Re-throwing as a different type without preserving cause.
- Inconsistent error response formats per controller.
- Silent failures (returning null/empty instead of signalling).

### E. Concurrency hazards

- `synchronized` on shared objects without clear protocol.
- Use of `ThreadLocal` without cleanup.
- Async work without timeout or backpressure.
- Race-prone patterns (check-then-act on shared resources).
- Database transaction scope leaks (transactional method calling external service).

### F. Persistence smells

- N+1 query patterns (`@OneToMany` lazy in a loop).
- Open-ended queries (no `LIMIT`, no pagination) in production paths.
- Schema drift: ORM entity ≠ migration table.
- Migrations modifying earlier migrations instead of additive.
- Raw SQL alongside ORM with no clear policy.

### G. Security & secrets smells

- Hardcoded URLs/IPs in source (excluding test fixtures).
- Hardcoded credentials or tokens (this overlaps with the validator's secret check; record findings here too).
- Unsanitized inputs reaching SQL/HTML/shell.
- Missing auth annotations on endpoints listed in P5 CATALOG.
- Logging that may leak PII (operator interview required).

### H. Configuration debt

- Config keys defined but never read.
- Config keys read but never defined (default-only at runtime).
- Environment-specific code branches (`if (env == "prod")`).
- Multiple config sources for the same key with unclear precedence.

### I. Test debt

- Test files without assertions.
- Tests mocking the entity under test.
- Disabled / commented-out tests.
- Integration tests requiring a live external system without skip-when-unavailable.
- Snapshot tests with stale snapshots (last updated > N months ago).

### J. Build / dependency debt

- Multiple versions of the same library on classpath.
- Pinned-but-EOL framework versions (record version + EOL date if known).
- Direct dependencies on transitive deps (fragile).
- CI building artifacts that nothing publishes.

### K. Documentation debt

- Public classes/methods missing Javadoc/JSDoc/docstring where a convention exists.
- README references to files that no longer exist.
- Outdated diagrams (Confluence vs. code mismatch — flag for P9).

## Output files

```text
doc/project/technical/STRUCTURAL_ISSUES.md          # human-readable report grouped by category
doc/_meta/structural-issues.yaml                    # machine-readable, one entry per finding
doc/prod/structural-risks/RISK-CODE-<slug>.md       # one file per HIGH or CRITICAL finding
doc/_indexes/by-risk.md                             # updated
doc/_meta/code-pipeline-state.yaml                  # P7 status
```

### `structural-issues.yaml` schema

```yaml
findings:
  - id: "STRUCT-001"
    category: "coupling|parallel|dead|error|concurrency|persistence|security|config|test|build|docs"
    severity: "low|medium|high|critical"
    title: "Two parallel archiving listeners (Kafka + JMS) with no migration plan"
    evidence:
      - "myapp-webapp/.../ArchiveKafkaListener.java"
      - "myapp-webapp/.../DocListenerMsgUpstream.java"
    impact: "Maintenance cost x2; risk of behavior drift between paths"
    operator_action_needed: true|false
    promoted_to_risk_file: "doc/prod/structural-risks/RISK-CODE-001-parallel-archiving-paths.md"
counts_by_category:
  coupling: <int>
  parallel: <int>
  dead: <int>
  error: <int>
  # ...
counts_by_severity:
  low: <int>
  medium: <int>
  high: <int>
  critical: <int>
markers:
  todo: <int>
  fixme: <int>
  hack: <int>
  xxx: <int>
  oldest_marker: { file: "...", text: "...", added: "YYYY-MM-DD if known" }
disabled_tests: []
god_classes_top10: []
hot_files_top20: []
```

## Coverage targets (gate for P7 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Each category A–K explicitly addressed (findings or "none found" with method) | 100% | yes |
| Every HIGH/CRITICAL finding has a `RISK-CODE-*.md` file | 100% | yes |
| Every disabled test listed with location | 100% | yes |
| Marker counts (TODO/FIXME/HACK/XXX) recorded | yes | yes |
| Top-10 god classes / Top-20 hot files lists present (or explicit small-codebase note) | yes | yes |

## Blocking questions

Use `governance/blocking-question-loop` for:

- A `// remove after <date>` marker past its date — ask if the cleanup happened.
- Two parallel implementations — ask which is the target and what the deprecation plan is.
- Apparent dead endpoints — ask if any external consumer still uses them.
- A disabled test with no reason — ask the team why and whether to re-enable or delete.

## Status update

```yaml
pipeline:
  p7_structural_issues:
    status: covered|partial|blocked
    last_run: "..."
    findings_total: <int>
    critical: <int>
    high: <int>
    medium: <int>
    low: <int>
    risk_files_created: <int>
    blocks_next_pass: true|false
```

## Anti-patterns

Do not:

- list smells without file:line evidence;
- mark every finding HIGH ("alarm fatigue makes the report useless");
- merge all coupling issues into a single line item;
- promote a finding to a risk file without operator confirmation when the finding is debatable;
- skip a category because "this codebase is well-written";
- proceed to P8 without recording marker counts.
