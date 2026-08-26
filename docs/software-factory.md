# Software factory V3

The software factory consumes a complete, human-approved specification and
produces an evidence-backed draft pull request. Workshops, business decisions,
final approval, merge and deployment stay human responsibilities.

## What V3 adds

V1 documented a disciplined lifecycle. V3 makes the failure-sensitive parts
executable:

- a hash-chained JSONL event log is the canonical history;
- a pure reducer derives phases, gates, lots, blockers and provenance;
- a pure scheduler respects reviewed dependencies and path reservations;
- deny-by-default capabilities prevent role-crossing side effects;
- durable source contracts are separate from runtime adapter availability;
- environment/CI contracts make startup and acceptance reproducible;
- acceptance results and evidence are bound to one immutable candidate;
- a dedicated Delivery role can create/update a draft PR, never merge it.

## Package layout

```text
doc/spec/<version>/<ticket>/
├── README.md
├── SPECIFICATION.md
├── IMPACTS.md
├── TESTS.md
├── SUMMARY.md
├── SUGGESTIONS.md
├── CHANGELOG.md
├── JOURNAL.md
├── TECHNICAL_PLAN.md
├── acceptance/
│   ├── acceptance-plan.yaml
│   └── tests/
└── factory/
    ├── plan.v3.json
    ├── events.v3.jsonl
    ├── state.v3.json
    └── evidence-manifest.v3.json
```

`plan.v3.json` is approved input. `events.v3.jsonl` is append-only and written
only through the controller. `state.v3.json` is a cache that CI rebuilds and
compares. The evidence manifest is generated from acceptance results and
artefacts; an agent does not type checksums by hand.

## Lifecycle

1. The Functional Analyst completes the spec, impacts and acceptance plan.
2. The operator approves the spec digest.
3. The Planner creates the human TIP and V3 machine plan; the operator approves
   the plan/allocation digest.
4. The Controller initializes events/state and reserves the next runnable,
   path-disjoint wave.
5. Implementers receive bounded work packages. Reviewers receive fresh-context
   diffs/results, not author transcripts.
6. Integration verification and consolidated review pass.
7. Corpus closes every affected claim and contradiction.
8. The candidate commit is frozen. Acceptance preflight proves the environment
   serves that revision, then executes every mapped case.
9. Evidence is normalized, scanned and checksummed. Release review rejects any
   stale basis or incomplete case.
10. Delivery creates or updates a draft PR from an existing remote branch after
    explicit authority. A person reviews, marks ready and merges.

## Application adoption contract

The pack does not guess how an application starts. Adoption fills:

- `doc/project/runtime/ENVIRONMENTS.yaml`: build/start/health/stop/reset,
  dependencies, auth, data isolation, cleanup and revision probe;
- `doc/project/runtime/LOCAL_STARTUP.md`: the same path for a human;
- `doc/project/cicd/FACTORY_CI.yaml`: operations, required checks, protected
  acceptance, permissions and evidence retention;
- `doc/_meta/information-sources.yaml`: durable logical source requirements;
- `doc/_meta/source-coverage.yaml`: what previous runs actually consulted.

A runtime source probe, environment observation or login failure is attached to
one run. It never rewrites the application contract as “unavailable globally”.

## Role boundaries

See `doc/_agents/software-factory.md` and the shipped role capability template.
No implementation/review/acceptance agent can commit, push or open a PR. The
Delivery identity has pull-request metadata permission only and cannot push,
approve, mark ready, merge or deploy.

## Validation and migration

Run the complete pack suite, not an isolated self-test:

```bash
npm test
node scripts/validate-factory.mjs
node scripts/validate-corpus.mjs --json
```

V1 packages are imported conservatively with
`scripts/migrate-factory-v1-to-v3.mjs`. The migrator hashes and preserves the
legacy files, records observed facts, and never invents historical reviews,
valid evidence or a candidate SHA.
