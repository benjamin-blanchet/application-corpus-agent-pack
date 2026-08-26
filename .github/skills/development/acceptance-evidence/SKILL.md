---
name: acceptance-evidence
category: development
description: "Execute a traceable acceptance campaign on one immutable candidate, normalize honest outcomes, hash replayable evidence, minimize sensitive data and reject stale or incomplete proof."
---

# Acceptance and Evidence

## Preconditions

Require an acceptance plan, validated environment/CI contracts and a full
`candidate_sha`. Preflight verifies deployed revision, build, schema, dataset,
auth mode and required dependencies before cases run.

Every specification criterion maps to at least one case, executable oracle and
required proof, or an approved waiver. A screenshot is evidence, not an oracle
by itself.

## Shipped execution boundary

The installable pack does not yet provide the process/filesystem sandbox,
credential broker, enforceable egress policy or bounded mutation API required
to run candidate code safely. `factory-acceptance.mjs` therefore validates the
contracts and produces the structured
`acceptance-execution-boundary-unavailable` blocker before lifecycle or adapter
execution, including for a `deny_by_default` network profile. A GitHub
Environment, signed receipt, runner label or empty allowlist is not proof of
host isolation. Candidate execution becomes eligible only when an external
executor and its trusted machine verifier are integrated as one boundary.

## Verdict integrity

Case outcomes are `passed`, `failed`, `blocked`, `skipped` or `waived`.
`waived` requires reason, approver and timestamp. A user-visible error, missing
dependency after a mutation, incomplete cleanup, retry-only success or absent
case cannot be converted to `passed` by the report generator.

The campaign continues after independent failures so coverage remains visible.
Aggregation is derived from case outcomes; never hand-write “N/N passed”.
Playwright oracles are recorded explicitly after their assertion; the reporter
does not synthesize oracle success from the test status. Persist
`user_visible_error` separately and force the case away from `passed` when it
is true, including across retries.

## Provenance and artefacts

The generated manifest records run id, `candidate_sha`, `tested_sha`, source
tree digest, environment/build/schema/dataset/toolchain identities, cases,
oracles, mutations/cleanup and each artefact's checksum. When acceptance is
applicable, `tested_sha == candidate_sha`.

Scripts/specs are versioned in Git. Reports, traces, screenshots and videos are
CI artefacts by default. Evidence-only commits are allowed only when validation
proves that no candidate source path changed. Scan artefact names/content for
credentials, cookies and avoidable PII before publication.

Derive an artefact media type from validated bytes within the allowlist, never
from its extension or adapter header alone. Pixel-bearing evidence requires the
plan-approved `masked_or_synthetic` policy and a concrete external redaction
checkpoint reference; absent policy or attestation blocks because pixel PII
cannot be inferred safely. Reject archives unless their files are extracted and
scanned individually. A required cleanup marked passed must reference at least
one hashed artefact from the same run and carry the lifecycle runner's exact
declared-operation digest, timestamps and successful exit code.
