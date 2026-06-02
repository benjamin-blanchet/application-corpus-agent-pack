---
name: p4-feature-silo-deep-dive
category: pipeline
description: "For every feature candidate produced by P3, perform an exhaustive **silo** read of the code that implements it, then **interview the operator** to fill the gaps the code cannot answer. Output a non-stub feature folder."
---
# Feature Silo Deep Dive (Pass 4 / 9)

## Purpose

For every feature candidate produced by P3, perform an exhaustive **silo** read of the code that implements it, then **interview the operator** to fill the gaps the code cannot answer. Output a non-stub feature folder.

This is the most expensive pass. It is also the one that makes the corpus actually useful.

## Prerequisite

`p3_feature_candidates.status == covered`.

## Mandatory first reads

Per feature processed:

1. `doc/_meta/feature-candidates.yaml`
2. `doc/project/features/<slug>/_evidence.yaml`
3. `doc/project/architecture/MODULES.md`
4. `doc/_meta/logical-boundaries.yaml`
5. The current `doc/project/features/<slug>/README.md` (the candidate scaffold from P3)

Also keep at hand:

- `doc/CORPUS_MANIFEST.md`
- `doc/_indexes/by-business-entity.md` (read after the first features to keep entity naming consistent)

## Prioritization input

If `doc/_meta/code-activity-signals.yaml` exists with `meaningful_history: true`, iterate features in **score-ranked order** (P3 already ranked the candidate list — honor that order here). The first 5–8 features documented are the most-active areas of the codebase; the operator sees useful corpus depth on the team's current focus within the first 1–2 hours of P4 instead of after a full alphabetical sweep.

When the signal is missing or `meaningful_history: false`, fall back to the order P3 produced (typically module-order). Note the fallback in the per-feature interview transcript so the operator knows the prioritization is not activity-driven.

The iteration still covers every feature candidate — the order changes, not the set.

## Iteration model

Process features **one at a time, in this order** (per the Prioritization input above):

1. Run the silo read.
2. Write the draft feature folder from code evidence only.
3. Run the per-feature interview using `pipeline/per-brick-interview`.
4. Reconcile the draft with the operator answers.
5. Mark the feature `status: documented` and move to the next.

Do **not** batch-write all features then interview at the end. Each feature is closed before the next begins.

For large repositories, use the pacing rules from `pipeline/per-brick-interview` before starting the first full interview:

- if P3 produced 6-20 candidates, run a triage interview to prioritize and merge/split obvious candidates;
- if P3 produced 21+ candidates, group candidates by module/domain/risk and ask for batch prioritization first;
- still close each documented feature individually, but avoid forcing full 15-question rounds for low-risk legacy bricks unless the operator asks.

## Silo read protocol

For the feature being processed, read transitively from each entry point:

1. Open the entry-point file. Read it in full.
2. List every type/function it calls and every type/function it implements/extends.
3. For each callee, open it. Read it in full.
4. Stop descending when you reach:
   - a framework/library boundary outside the repo;
   - a generic shared utility (record the dependency, do not deep-read);
   - a layer below the application (driver, raw protocol).
5. Record every file actually read in `_evidence.yaml` under `files_read_in_silo`.

You must read **at minimum**:

- the entry-point file;
- every direct DTO/request/response type;
- every direct service/use-case;
- every repository/DAO touched;
- every external client invoked;
- every domain entity referenced;
- every database migration that touches a table mentioned in the silo;
- every test file whose name matches the feature slug or the entry-point symbol;
- every config block (yaml/properties keys) referenced by class names in the silo.

When the silo crosses module boundaries, follow the dependency. Do not stop at the module wall.

## What to extract per feature

| Extract | Source | Goes into |
|---|---|---|
| Purpose (one paragraph, evidence-cited) | code + operator | `README.md` |
| Architecture diagram (mermaid or ASCII) | call graph | `ARCHITECTURE.md` |
| Workflow (step-by-step end-to-end) | call graph + state changes | `WORKFLOWS.md` |
| Business rules (conditions, validations, limits, branches) | `if/else`, validators, annotations, switch tables | `BUSINESS_RULES.md` |
| Operational behavior (retries, timeouts, DLQ, schedules, idempotency) | config + retry policies + cron annotations | `OPERATIONS.md` |
| Data model touched (tables, columns, FKs, constraints) | migrations + JPA/ORM annotations | `BUSINESS_RULES.md` or `ARCHITECTURE.md` |
| External systems and contracts | clients + WSDL/OpenAPI/proto | `ARCHITECTURE.md` |
| Error paths (exceptions, error codes, fallback behavior) | catch blocks, error mappers | `OPERATIONS.md` |
| Permissions / roles required | `@PreAuthorize`, route guards, RBAC checks | `BUSINESS_RULES.md` |
| Observability hooks (logs, metrics, traces) | logger calls, `@Timed`, span annotations | `OPERATIONS.md` |
| Test coverage (which scenarios are tested) | test file contents | `OPERATIONS.md` (Test coverage section) |
| Known TODOs / FIXMEs / deprecated markers in the silo | comments | `AI_AGENT_GUIDE.md` (warnings) |
| Suggested entry points for an agent making a change | call graph | `AI_AGENT_GUIDE.md` |
| Risks specific to this feature | code + tests + open questions | links to `doc/prod/structural-risks/` |

## Output files (per feature, all required, all non-stub)

```text
doc/project/features/<slug>/README.md          # purpose + status: documented + entry points + index
doc/project/features/<slug>/ARCHITECTURE.md    # components, integrations, diagram
doc/project/features/<slug>/WORKFLOWS.md       # step-by-step flows, sequence diagrams
doc/project/features/<slug>/BUSINESS_RULES.md  # rules with code/source citations
doc/project/features/<slug>/OPERATIONS.md      # retries, errors, observability, tests
doc/project/features/<slug>/AI_AGENT_GUIDE.md  # entry points, gotchas, sample change recipe
doc/project/features/<slug>/_evidence.yaml     # updated with everything read + interview log ref
```

Update:

```text
doc/_indexes/by-feature.md                 # status flipped from candidate to documented
doc/_indexes/by-component.md               # any new component discovered
doc/_indexes/by-business-entity.md         # any new entity discovered
doc/_indexes/by-screen.md                  # if UI screens
doc/_indexes/by-api.md                     # if HTTP/RPC routes
doc/_meta/code-pipeline-state.yaml         # P4 progress per feature
doc/_meta/blocking-questions.md            # interview Qs unresolved
```

## Non-stub bar (per file)

A companion file is non-stub only if **all** of the following hold:

| File | Minimum content |
|---|---|
| `README.md` | Purpose paragraph + entry-point table + at least 3 cross-references to other corpus files |
| `ARCHITECTURE.md` | **Mandatory mermaid component diagram** (the feature's slice across layers, with cited file paths in node labels) + components table + integrations table |
| `WORKFLOWS.md` | **Mandatory mermaid sequence diagram** for the canonical flow + at least one step-by-step text flow with source-cited transitions. If multiple flows exist (happy path + variants), one sequence per flow. |
| `BUSINESS_RULES.md` | At least 3 rules with **file:line** citations OR a documented "no business rules in this feature, only orchestration" with evidence. When the feature drives state transitions, include a mermaid `stateDiagram-v2`. |
| `OPERATIONS.md` | Retry/timeout/error-handling section + observability section + test coverage table |
| `AI_AGENT_GUIDE.md` | Entry points to touch + at least one "do not touch" warning + a sample change recipe |

Diagram rules (apply to every diagram inside a feature folder):

- Mermaid only, inline. No external images.
- Every node/edge label cites a real symbol or file path from the silo read.
- `source: code` in the diagram block's caption; never `confluence`.
- A diagram contradicting a Confluence diagram for the same scope is the canonical one (code wins, rank 1 vs rank 7). Reference the Confluence page under "External references" but do not import its shapes.

If a section legitimately does not apply to a feature, the file must say so explicitly with the reason — not be left empty.

## Per-feature interview (mandatory)

After the draft is written from code, invoke `pipeline/per-brick-interview` with the feature slug. The interview must:

1. Show the operator the **list of hypotheses** the agent inferred from code that need confirmation.
2. Ask **5–15 questions** targeted at zones the code cannot answer:
   - business intent behind a confusing branch;
   - which path is the canonical/active one when two coexist;
   - external contracts the code only hints at;
   - operational facts (what happens in prod when X fails);
   - historical context (why is this code shaped this way);
   - upcoming changes that affect documentation longevity.
3. Cap the round at 15 questions. If more are needed, schedule a follow-up.
4. Record every question and answer in `doc/_meta/code-interview/<slug>.md`.
5. Flow the answers back into the feature folder. Mark the affected sections with the interview reference.

Do **not** mark a feature `documented` until the interview round has happened (or has been explicitly skipped by the operator with a reason recorded in `_evidence.yaml`).

## Coverage targets (gate for P4 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Features in `feature-candidates.yaml` processed | 100% (each → `documented`, `merged`, `split`, `rejected`) | yes |
| All 6 companion files present and non-stub for each `documented` feature | 100% | yes |
| Per-feature interview log present (or explicit operator skip) | 100% | yes |
| Each feature has ≥ 1 source-citation in `BUSINESS_RULES.md` (or documented "orchestration only") | 100% | yes |
| Each feature lists every test file that covers it | 100% | yes |
| `by-feature.md` reflects the final status of every candidate | 100% | yes |

## Allowed candidate outcomes

Each candidate ends in one of:

| Outcome | Action |
|---|---|
| `documented` | Folder fully populated, interview done. |
| `merged` | Folder absorbed into another feature. The merge target's `_evidence.yaml` records the absorbed slug. |
| `split` | Replaced by N new feature folders, each going through P4. |
| `rejected` | Not a real feature (e.g. dead code, legacy stub). Record the reason in `_meta/feature-candidates.yaml` under `rejected`. |

A `partial` or `blocked` outcome **forbids** marking P4 covered for that candidate. Record the blocker.

## Status update

```yaml
pipeline:
  p4_feature_silo_deep_dive:
    status: covered|partial|blocked
    last_run: "..."
    candidates_total: <int>
    candidates_documented: <int>
    candidates_merged: <int>
    candidates_split: <int>
    candidates_rejected: <int>
    candidates_pending: <int>
    interviews_completed: <int>
    interviews_skipped: <int>
    blocks_next_pass: true|false
```

## Anti-patterns

Do not:

- read the entry point and stop there;
- write a feature folder without per-feature interview;
- copy-paste the same boilerplate "Operations" section across features;
- treat absence of a section as "no rules" — explicit "no rules" with reason is required;
- batch-process all features then ask one global question;
- mark P4 covered while interviews are pending.
