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

## Verdict integrity

Case outcomes are `passed`, `failed`, `blocked`, `skipped` or `waived`.
`waived` requires reason, approver and timestamp. A user-visible error, missing
dependency after a mutation, incomplete cleanup, retry-only success or absent
case cannot be converted to `passed` by the report generator.

The campaign continues after independent failures so coverage remains visible.
Aggregation is derived from case outcomes; never hand-write “N/N passed”.

## Provenance and artefacts

The generated manifest records run id, `candidate_sha`, `tested_sha`, source
tree digest, environment/build/schema/dataset/toolchain identities, cases,
oracles, mutations/cleanup and each artefact's checksum. When acceptance is
applicable, `tested_sha == candidate_sha`.

Scripts/specs are versioned in Git. Reports, traces, screenshots and videos are
CI artefacts by default. Evidence-only commits are allowed only when validation
proves that no candidate source path changed. Scan artefact names/content for
credentials, cookies and avoidable PII before publication.
