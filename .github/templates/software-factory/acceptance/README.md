# Acceptance package

Copy this directory into a validated specification package. The plan and test
sources are committed before the subject revision is frozen. Generated reports,
screenshots and traces are evidence for that exact revision; they are not test
inputs.

The application repository must provide `@playwright/test` when the Playwright
adapter is selected. The corpus pack deliberately does not install a browser
runtime or add it to its own dependencies.

Replay a frozen campaign from the repository root:

```text
node scripts/adapters/playwright/run.mjs --plan <acceptance-plan> --environment <environment-contract> --observation <run-observation> --config <playwright-config> --subject-sha <full-commit-sha> --run-id <run-id> --evidence-root <run-directory>
```

Start and stop the application through the operation IDs declared by the
environment and CI contracts. The Playwright config accepts only the
preflighted `FACTORY_BASE_URL`; it does not execute an ad-hoc shell command.

Prefer locator-level checkpoints over full-page captures. Never attach browser
storage state, cookies, credentials, secrets, or unredacted personal data.

For every declared mutation, call `recordMutation` after its cleanup has been
verified. Missing, failed or pending cleanup blocks the manifest; the reporter
never infers success from a passing UI assertion.
