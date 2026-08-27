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
- supported entry points and workflows reject undeclared capabilities and
  role-crossing side effects by default;
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
├── acceptance-plan.yaml
├── PR_DESCRIPTION.md
├── pr-draft.yaml
├── acceptance/                 # adapter-dependent replay assets
│   ├── playwright.config.mjs     # UI campaigns only
│   ├── tests/                    # when the selected adapter needs them
│   └── runs/                    # generated locally, or replaced by CI artefacts
└── factory/
    ├── plan.v3.json
    ├── events.v3.jsonl
    ├── state.v3.json
    └── evidence-manifest.v3.json   # generated output; external in ci_artifact mode
```

`plan.v3.json` is approved input. `events.v3.jsonl` is append-only and written
only through the controller. `state.v3.json` is a cache that CI rebuilds and
compares. The evidence manifest is generated from acceptance results and
artefacts; an agent does not type checksums by hand. The `acceptance/` subtree
depends on the selected adapter: a command campaign can run without
repository-owned browser tests, while Playwright configuration, screenshots
and traces are required only for relevant UI journeys. With `ci_artifact`
publication, run results, media and the evidence manifest remain in the
attested CI bundle rather than the candidate tree.

## Lifecycle

1. Upstream workshops and the Functional Analyst deliver the complete spec,
   impacts and executable pre-candidate acceptance plan.
2. The Controller initializes the package, append-only event log and derived
   state, then records the proposed specification digest.
3. The operator confirms that exact specification digest through typed events;
   the factory never turns an incomplete draft into an implicit approval.
4. The Planner creates the human TIP and V3 machine plan; the operator approves
   the proposed plan/allocation digest.
5. The Controller resolves the runtime model policy. For each dependency-ready
   lot, a read-only worker observes repository conventions before reservation;
   the Controller records their sorted rules and committed example bytes in a
   content-addressed `lot_conventions_observed` event.
6. Only lots with a current convention contract can enter the next runnable,
   path-disjoint reserved wave. Implementers receive bounded work packages.
   Reviewers receive fresh-context
   diffs/results, not author transcripts.
7. Integration verification and consolidated review pass.
8. Corpus closes every affected claim and contradiction.
9. After corpus closeout, an authorized operator or publisher materializes and
   publishes the commit; the Controller records that exact SHA as the frozen
   candidate. Acceptance preflight then proves the environment serves that
   revision and executes every mapped case.
10. Evidence is normalized, scanned and checksummed. Release review rejects any
   stale basis or incomplete case.
11. Delivery creates or updates a draft PR from an existing remote branch after
    explicit authority. A person reviews, marks ready and merges.

The committed package may therefore stop honestly at `corpus_closed`.
`candidate_frozen`, acceptance, evidence, release review and Delivery are a
post-commit continuation derived in protected CI from the exact published SHA.
A draft PR that already existed before that continuation is useful for
collaboration, but is not by itself evidence of a V3 Delivery run.

The V2 candidate binding resolves the intentional commit boundary without
weakening review identity. Relative to the exact reviewed commit, only corpus
paths plus that package's `factory/events.v3.jsonl` and `factory/state.v3.json`
may change. The event log must preserve the reviewed bytes and append exactly
`integration_verified`, a passing fresh-context `consolidated_reviewed` bound
to the same snapshot, then `corpus_closed`. The committed state must be the
exact reducer projection at that tail. Base/candidate log and state digests,
the appended event IDs/bytes and the complete transition digest are covered by
the candidate-binding digest. Protected release reconstructs this proof from
Git objects; candidate scripts are not executed to establish it.

## Proof envelopes and replay modes

Every lot result is bound to a full base revision, the digest of its
preimplementation convention contract and an exact inventory of
present and deleted paths. Present files are checked against their current byte
digest; deleted files are checked for absence. Handoff outputs are independently
hashed: direct bytes for a file, or a recursively sorted file inventory for a
directory. The result digest also covers outputs, verification evidence and
blockers. Append and full-package validation recompute these proofs and reject
symlinks, path escapes, stale output trees and any declared file whose bytes
have drifted since the result was reported.

The convention contract is created before `wave_reserved`, binds the approved
plan and exact source revision, and uses regular committed examples inside the
lot's read claims (`path`, SHA-256, byte count). `lot_started` must use that same
revision. The result then reattests the identical rule IDs/rules with current
post-implementation examples, so “fit existing code” is a before/after proof
rather than retrospective prose.

`package_initialized.run_mode` distinguishes a live execution from a
`retrospective_attestation`. Retrospective mode may attest the final observable
state of earlier work, but it must not invent missing intermediate attempts or
reviews. Approvals and runtime observations cannot postdate the event that
records them. When an automatic attempt budget is exhausted, only an explicit,
plan- and diff-bound operator event grants one additional attempt.

## What these proofs do not establish

Four limits, stated here because a guarantee people believe in is more
dangerous than one they know they lack. None of them is a defect to be worked
around; each is the honest edge of what the control plane can establish on its
own, and each is where a human still has to look.

**The event chain is tamper-evident, not authenticated.** `events.v3.jsonl` is
chained with plain SHA-256 and nothing signs it. Anyone who can write to the
repository can rewrite the log, recompute every digest in it, regenerate
`state.v3.json` and produce a package that validates. The chain catches an
accidental edit, a truncated write, a rebase that dropped an event — it does not
establish who wrote what, and it is not evidence against someone who controls
the tree. The authenticated anchors in this system are elsewhere: the Ed25519
review and authorization receipts, and the GitHub Actions run attestations.
Where a claim must hold against an adversary rather than an accident, it rests
on those, never on the log alone.

**Workspace observation is bounded to a lot, and in live mode it is attested
rather than recomputed.** A lot result carries a workspace delta; the controller
checks that the delta binds its `lot_started` snapshot, that the baseline was
clean, that the exclusions are the closed controller policy, and it refuses
paths outside the lot's reservation. That is a real gate, and it is the reason
an unreserved write fails at lot return. But in `live` mode the snapshot is the
worker's own: the controller re-derives the delta from the repository only in
`retrospective_attestation` mode. Between lots, and after the last lot is
integrated, nothing observes the tree at all — the one repository-state check in
the reducer is conditioned on a valid `candidate` gate, so it applies only after
the candidate is frozen. A module added once the lots have closed sits outside
every digest and produces no finding.

**The acceptance chain is deliberately blocked, and has never run green end to
end.** `factory-acceptance.mjs` pushes an execution-boundary finding
unconditionally, before any adapter is selected, so every campaign exits
blocked. That is not a defect: the installable pack has no attestable isolated
process, filesystem and egress executor, and a signed receipt cannot turn an
ordinary child process into one, so the runner fails closed instead of
pretending. The consequence is worth being explicit about — the acceptance,
release and draft-PR workflows cannot complete until an external isolated broker
is integrated, and the per-campaign scoped acceptance credentials described in
the environment contract are a contract, not an implementation. The adapter
execution code beneath that boundary is unreachable today; the day the boundary
is lifted, it becomes candidate code running in a privileged context, and that
is the review to do first.

**Gate invalidation is declarative.** `artifact_change_observed` records what an
operator or an agent *states* about a change; nothing in the pipeline derives
those classes from an observed Git delta. The control plane therefore proves the
integrity of a perimeter that a human draws. Drawing it wrong is not a condition
it can detect, and reviewing what falls outside it stays a human
responsibility.

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
Supported Controller, review and acceptance paths refuse commit, push and PR
capabilities; Delivery receives only the narrow draft-PR operation. Personas
are contracts, not a universal sandbox: effective isolation still requires the
workflow, tool, filesystem, egress and credential boundaries documented by the
pack. Shipped executor/provider entry points fail before a dangerous side
effect when their host-control attestation is absent. Generic IDE source edits
are checked again from the real Git delta at handoff; that is detection, not a
claim that the IDE was sandboxed.

Concretely, the shipped `factory-acceptance.mjs` always returns the structured
`acceptance-execution-boundary-unavailable` blocker before candidate lifecycle
or adapter execution. This remains true for `deny_by_default`: an empty egress
allowlist, GitHub Environment approval, signed receipt or runner label does not
isolate a same-user process. Applications must integrate an external
process/filesystem/egress executor and its trusted verifier before claiming an
executed Acceptance campaign.

## Validation and migration

In this pack repository, run the complete maintainer suite. In an installed
application repository, the protected policy runs the portable Factory suite
from its pinned controller checkout. It never treats the application's
`npm test` as a pack regression suite and never executes candidate code.

The required PR policy is defined by the protected base, not by the candidate
branch. Before enabling it, merge the controller scripts and workflow into the
protected default branch, set repository variable `FACTORY_CONTROLLER_SHA` to
that exact full commit SHA, and require `Factory policy / validate`. The
read-only `pull_request_target` workflow uses separate pinned controller,
candidate and published-base checkouts with no persisted credentials. Every
pack validator runs from the controller checkout against the candidate root;
candidate edits to `scripts/validate-*.mjs` or the workflow therefore cannot
turn the protected validators into an `exit 0`. Configure the ordinary provider
declared by `checks[id=factory-application-ci]` as a second required branch
check for application tests. It must run without secrets or an elevated token.
The optional `factory-ci-check.mjs` helper scrubs its child environment, but
that is not host isolation: it does not block same-user process inspection,
runner filesystem access or network egress.

These branch checks are post-creation merge protections, not evidence consumed
by draft Delivery. A check display name plus candidate SHA is spoofable by a
homonymous candidate workflow, and the protected `pull_request_target` policy
does not exist before the PR. Delivery therefore relies only on its typed
Acceptance/Release attestations, creates or updates a draft, and leaves the
subsequent check enforcement, ready transition and merge outside its authority.

Acceptance, Release and draft Delivery are separate attested gates triggered
with the exact `factory-acceptance`, `factory-release` and `factory-draft-pr`
`repository_dispatch` event types. GitHub loads those privileged definitions
from the default branch; each job also requires `github.sha` to equal the
pinned `FACTORY_CONTROLLER_SHA`. The pin must therefore remain the current
default-branch HEAD for the complete protected sequence. A default-branch
advance invalidates the sequence and requires a replay from the newly reviewed
controller commit. The acceptance attestation V2 binds `workflow_sha` and
`subject_sha` separately. Acceptance is consequently not a candidate branch
check: the mandatory release/delivery attestation proves it against the exact
candidate. Former `workflow_dispatch` runs and V1 attestations are rejected.

```bash
# Pack maintainers
npm test

# Installed consumers / policy job
node <protected-controller>/scripts/test-factory-suite.mjs \
  --subject-root <candidate> --baseline-root <published-base> \
  --baseline-sha <full-pr-base-sha>
# Separate ordinary, secret-free application CI job
node <protected-controller>/scripts/factory-ci-check.mjs \
  --root <candidate> --ci doc/project/cicd/FACTORY_CI.yaml \
  --check factory-application-ci --json

node scripts/validate-factory.mjs
node scripts/validate-delivery.mjs --lint-template --json
node scripts/validate-delivery.mjs --package 'doc/spec/<version>/<ticket>' \
  --environment doc/project/runtime/ENVIRONMENTS.yaml \
  --ci doc/project/cicd/FACTORY_CI.yaml --json
node scripts/validate-corpus.mjs --json
```

V1 packages are imported conservatively with
`scripts/migrate-factory-v1-to-v3.mjs`. The migrator hashes and preserves the
legacy files, records observed facts, and never invents historical reviews,
valid evidence or a candidate SHA.
