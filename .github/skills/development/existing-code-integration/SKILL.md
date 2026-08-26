---
name: existing-code-integration
category: development
description: "Make bounded changes in the repository's observed stack and conventions without opportunistic refactoring; escalate only a demonstrated implementation blocker with the smallest viable refactor."
---

# Existing-Code Integration

## Before editing

Read adjacent implementations, tests, build/lint rules and the relevant corpus
slice. Put the observed examples and conventions in the work package. “Best
practice” means the best safe implementation that fits this repository's
supported language/stack and existing architecture — not importing a new
architecture because it is fashionable.

## During the lot

Use the smallest change that satisfies the approved criteria. Match naming,
error handling, dependency injection, persistence, tests and formatting already
used in the owned area. Do not fix neighbouring defects, create speculative
abstractions, replace libraries or normalize unrelated code.

## Refactor escalation

Stop only when evidence shows the current structure makes the approved outcome
unsafe or impossible. Return:

- the concrete blocker and locations;
- why an in-place implementation fails;
- the smallest refactor that removes it;
- alternatives, blast radius, tests and migration/rollback impact.

The operator may amend the plan. Until then, record the issue and keep it out
of the diff. A dislike of existing style is not a blocker.
