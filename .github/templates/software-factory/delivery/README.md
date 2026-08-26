# Delivery templates

`factory-ci.yaml` declares repository operations and policy. Validate its
placeholders only with `validate-delivery.mjs --lint-template`; canonical
validation fails when repository contracts are absent. `pr-draft.yaml`
declares the only supported external action: opening a draft pull request for
an already-pushed branch after explicit authorization. Neither contract grants
push, approval, ready-for-review, deployment, or merge authority.

Evidence manifests and stakeholder reports are generated from run results.
They must never be hand-edited into a passing state. The default publication
mode is a CI artifact bound to the tested SHA; it does not require an evidence
commit. An evidence-only commit is optional and receives a separate provenance
check when selected.

The intended sequence is `factory-preflight.mjs`, the declared acceptance
adapter, `factory-evidence.mjs`, `factory-report.mjs`, then `factory-pr.mjs`.
Report and PR commands must receive the same plan, environment contract, and
artifact root so their hashes and coverage can be rechecked. `factory-pr.mjs`
is a dry run unless both `--execute` and the contract's exact `--approval-ref`
are supplied; even then it can only create or reuse a draft PR for an existing
remote branch. Execution requires an external authorization receipt bound to
the exact SHA, base and head; a repository string is not authorization.
