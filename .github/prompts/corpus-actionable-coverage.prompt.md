---
name: corpus-actionable-coverage
description: Run actionable corpus coverage with VS Code subagents by default when available.
agent: Corpus
tools: ['agent', 'runSubagent', 'read', 'search', 'edit']
---

Run the actionable corpus readiness flow.

Use subagents by default if the `agent` / `runSubagent` tool is available:

- `corpus-brick-feature-subagent` for feature/screen/user-flow bricks.
- `corpus-brick-runtime-subagent` for API, batch, job, scheduler and consumer/listener bricks.
- `corpus-brick-data-integration-subagent` for entities, persistence, contracts and integrations.
- `corpus-brick-reliability-subagent` for known bugs, risks, production signals, watchlist and playbooks.
- `corpus-control-plane-subagent` for indexes, graph, roadmap, coverage matrix, repository map, source inventory and run ledger consistency.

Keep subagents read-only. The main `Corpus` agent must integrate results and write corpus files.

If subagent tooling is available but not used for a broad scope, record why in `doc/_runs/RUN_LEDGER.md`.

Run:

1. `actionable/brick-inventory`
2. `actionable/brick-deep-dive` for critical/high bricks
3. `actionable/closeout-consistency-pass`
4. `governance/post-kickstart-completeness-audit`
5. `actionable/readiness-gate`
6. `node scripts/validate-corpus.mjs`

Report whether the corpus is `baseline_created_not_actionable`, `navigation_incomplete`, `partially_actionable`, `actionable_for_priority_scope` or `adoption_ready`.
