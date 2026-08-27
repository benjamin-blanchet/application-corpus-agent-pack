# Acceptance package

Copy this directory into a validated specification package. The plan and test
sources are committed before the subject revision is frozen. Generated reports
and policy-approved screenshots are evidence for that exact revision; they are not test
inputs.

The application repository must provide `@playwright/test` when the Playwright
adapter is selected. The corpus pack deliberately does not install a browser
runtime or add it to its own dependencies.

`campaign.adapter: playwright` may declare a `bootstrap_operation` whose CI
operation installs the exact browser selected by the repository lockfile.
`campaign.adapter: command` must instead declare one side-effect-free CI
`operation`; the command adapter executes it without a shell and emits the
same explicit results and evidence contracts.

The shipped adapter CLIs validate their frozen inputs but deliberately stop
before spawning candidate code. The pack currently has no process/filesystem
isolation and no enforceable egress boundary; a protected environment or a
signed receipt cannot provide those controls. Integrate an external isolated
executor before enabling replay. The future executor entry point will retain
this command shape:

```text
node scripts/adapters/playwright/run.mjs --plan <acceptance-plan> --environment <environment-contract> --ci <ci-contract> --observation <run-observation> --config <playwright-config> --subject-sha <full-commit-sha> --run-id <run-id> --evidence-root <run-directory>
```

Start and stop the application through the operation IDs declared by the
environment and CI contracts. The Playwright config accepts only the
preflighted `FACTORY_BASE_URL`; it does not execute an ad-hoc shell command.

Prefer locator-level checkpoints over full-page captures. Never attach browser
storage state, cookies, credentials, secrets, or unredacted personal data.
Evidence media types are recomputed from a finite set of byte signatures and
UTF-8 formats; an attachment name or browser `Content-Type` is only a claim and
cannot select the recorded type. Archives are rejected. Pixel-bearing evidence
must be approved in the plan with `media_pii_policy: masked_or_synthetic` and
bound to a protected attestation receipt for the exact media digest; a
candidate-authored `pii_attestation_ref` is not proof. The installable workflow
has no pixel attestor, so planned screenshots/videos and Playwright's automatic
failure trace/video/screenshot remain in local quarantine and block their
requirement. The published envelope retains their path/digest/size inventory,
never their raw bytes. The default template therefore uses an inspectable JSON
checkpoint; add pixel evidence only when an external protected attestor is
integrated.

Every oracle must be recorded explicitly after its assertion with
`recordOracle`. The reporter never turns a passing Playwright test into a list
of passing oracles. If an application error becomes visible, call
`recordUserVisibleError` before the failing assertion; that fact is retained
across retries, propagated to the manifest and prevents a passed campaign.

The installable worker blocks every candidate lifecycle/adapter process,
including secret-free `deny_by_default` profiles. It cannot prove that an
ordinary child process cannot read the runner home, sibling checkouts or reach
the network. It also does not support `ephemeral_storage_state` or another
`secret_refs` mode. A deployment may add an external ephemeral sandbox,
credential broker plus attestable host egress enforcement, but must not enable
the feature merely by passing a secret or self-declared receipt.

For every declared mutation, attach a cleanup proof and call
`recordMutationResult` with its attachment name in `cleanupEvidence` after the
cleanup has been verified. A required cleanup marked `passed` without an
artifact from the same run blocks the manifest. Missing, failed or pending
cleanup also blocks; the reporter never infers success from a passing UI
assertion. The lifecycle runner independently executes the exact cleanup
operation declared by the plan/CI contracts and records its contract digest,
timestamps and exit code; a test annotation cannot self-attest that operation.
The shipped worker nevertheless blocks mutation campaigns before lifecycle
until mutation execution is moved behind an isolated non-production broker
with a signed, run-bound authorization receipt.
