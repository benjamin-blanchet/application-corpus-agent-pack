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
commit. An evidence-only commit remains an optional V3 publication mode, but
its Git SHA is bound by the external `evidence_committed` event (and passed as
`--evidence-commit-sha` when needed), never written into its own manifest.

The intended sequence is `factory-acceptance.mjs` (declared lifecycle,
preflight, then the plan-selected adapter), `factory-stage-evidence.mjs`
(quarantine to a new scanned allowlisted directory), `factory-evidence.mjs`,
`factory-report.mjs`, `factory-release.mjs` with a signed independent review,
then `factory-pr.mjs`.
Report and PR commands must receive the same V3 `factory/plan.v3.json`,
environment contract, and artifact root so their hashes and coverage can be
rechecked. `factory-pr.mjs`
is a dry run unless both `--execute` and a signed external authorization
receipt are supplied; even then it can only create or update a draft PR for an
existing remote branch. The receipt is bound to the exact candidate SHA, PR
head SHA, refs, issuer, gate and expiry, and is verified with the non-secret
public key held by the protected controller checkout. The candidate contract's
key reference remains frozen provenance, but is never the execution trust
anchor. A repository string is not authorization; the private signing key
remains outside the repository.

The installable workflow scaffolds in this directory cover four distinct
gates: `factory-policy.workflow.yml`, `factory-acceptance.workflow.yml`,
`factory-release.workflow.yml` and `factory-draft-pr.workflow.yml`. Copy the selected files into
`.github/workflows/`, remove the `.workflow` segment, bind all inputs to the
repository contracts, and configure `Factory policy / validate` plus the
ordinary application CI check as required branch checks. Acceptance is an
attested delivery gate, not a candidate branch check: `repository_dispatch`
runs are attached to the protected default-branch workflow SHA, while the
attestation separately binds the tested candidate SHA. Configure the protected
`factory-acceptance`, `factory-release` and `factory-delivery` environments with
`FACTORY_CONTROLLER_SHA` set to one full commit SHA from a protected ref. The
delivery environment also defines `FACTORY_AUTHORIZATION_PUBLIC_KEY_PATH`, a
path confined to that controller checkout. The release environment defines
`FACTORY_REVIEW_PUBLIC_KEY_PATH`, also confined to the controller checkout,
and receives a signed structured review receipt bound to the candidate,
acceptance run, evidence/spec/plan digests, reviewer identity/model provenance
and any approved independence exception. The controller never invents the
review verdict or `fresh_context`.

Dispatch `factory-acceptance`, `factory-release` and `factory-draft-pr` through
the GitHub repository-dispatch API with the matching event type and
`client_payload`; do not add `workflow_dispatch`. GitHub then loads each
privileged workflow from the protected default branch. Every job additionally
fails closed unless that workflow revision equals `FACTORY_CONTROLLER_SHA`.
Consequently, the pinned controller commit must remain the current default-
branch HEAD for the whole acceptance → release → draft-PR sequence. If the
default branch advances, the jobs stop closed; repin to the newly reviewed
controller commit and restart the protected chain rather than weakening the
guard.
Runs produced by the former `workflow_dispatch` contract and V1 acceptance
attestations are incompatible and must be replayed; they are never migrated
or accepted as protected evidence.

Activate `factory-policy.yml` only after its controller version has landed on
the protected default branch. Set the repository Actions variable
`FACTORY_CONTROLLER_SHA` to that exact 40-hex commit (never a branch, tag or PR
head), install the workflow through a protected change, then open a real draft
PR and require `Factory policy / validate`. Its deliberate
`pull_request_target` trigger makes GitHub load the workflow definition from
the protected base. The workflow has exactly `contents: read`, references no
secret, persists no checkout credential, and checks out three disjoint trees:
the pinned controller, the exact candidate, and the exact PR base used only as
published learning data. All pack validators execute from the controller
checkout with the candidate passed as `--root`/`--subject-root`; changing a
validator or workflow in the PR cannot replace the running guard. It executes
no candidate script, dependency or declared operation. Never add secrets,
write permissions, candidate actions, dependency-install steps or direct
candidate scripts to this workflow.

Application tests remain a separate ordinary PR check:
`checks[id=factory-application-ci]` in `FACTORY_CI.yaml`. Configure its concrete
provider name as a second required branch check alongside
`Factory policy / validate`. `factory-ci-check.mjs` can dispatch that operation
with an allowlisted environment and fresh temporary home in ordinary CI, but
environment scrubbing is **not** a process/filesystem/egress sandbox: same-user
process inspection, runner files and network may remain reachable. Give this
ordinary job no secret or elevated token and never use its execution as proof
of controller isolation. A future privileged application test needs a real
externally attested executor boundary, not a declarative capability string.

`required_checks` describes the checks expected after the draft exists; it is
not a pre-creation attestation. Delivery never accepts a check solely by its
display name and candidate SHA: a candidate workflow can emit a homonymous
check, and `pull_request_target` policy cannot run before the PR exists. The
draft stays non-mergeable until the repository's protected post-creation
checks and human review complete; Delivery has no mark-ready or merge authority.

The installable acceptance worker deliberately receives **no application
secret** and does not install dependencies or spawn candidate tests, configs
or declared CI operations. An ordinary runner process has access to its home,
sibling workspaces and network even when the contract says
`deny_by_default`; therefore every profile stops before lifecycle until a real
ephemeral process/filesystem sandbox and enforceable egress boundary are
integrated. Secret and mutation support additionally require isolated brokers.
A signed declarative receipt or GitHub Environment approval alone is not a
sandbox.

When a protected external executor provider is configured, the acceptance
workflow delegates the complete declared lifecycle and campaign to it. The
provider runs those operations inside its broker and returns the resulting
observation, lifecycle and adapter record; the controller does not spawn the
candidate directly. The workflow returns a blocking execution-boundary finding
when no provider is configured; a valid provider must export `apiVersion = 1` and
`executeAcceptance(request)` and return a response bound to the frozen run and
attested isolated boundary. Adapter output first lands in a quarantine that
is never uploaded. The protected stager copies only referenced, inspectable,
secret-scanned files into a fresh directory, writes an exact recursive
path/digest/size inventory, and the first upload is exactly that minimized
directory as `factory-evidence-bundle-<acceptance-run-id>`. Automatic traces,
videos, screenshots and raw HTML stay in quarantine; the envelope retains
their checksums but not their bytes. Every upload takes its retention from the selected, validated CI
contract rather than a workflow constant. Before draft
delivery, the controller must publish a separate
`factory-release-envelope-<run-id>` artifact containing the canonical V3 event
log and its exact `release_ready` derived state. The draft workflow downloads
the minimized acceptance bundle, acceptance envelope and exact release
envelope from the named producer runs; it never invents control-plane events
or state. Dispatch release only with the candidate SHA, the successful
acceptance workflow run id, package/plan/environment/CI paths and the signed
review receipt. Dispatch draft delivery with the resulting release workflow
run id; its GitHub attestation must resolve the protected workflow, controller
SHA, candidate SHA, artifact id/name/digest and successful conclusion exactly.
The repository lockfile must pin `@playwright/test`; the CI contract declares
`acceptance-browser-bootstrap`, and the workflow runs that exact local binary
to install Chromium and its runner dependencies before the campaign. Replace
the browser set in both places together when the acceptance plan requires
Firefox or WebKit; never rely on runner images having browsers preinstalled.
