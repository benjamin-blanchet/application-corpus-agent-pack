# Procedure — actionable brick readiness (Step 9 of kickstart)

Loaded by `modes/corpus-kickstart` after P1→P9 and source discovery.

## Sequence

1. `actionable/brick-inventory` — identify all significant work bricks.
2. `actionable/brick-deep-dive` — on critical/high bricks until they are actionable.
3. `actionable/closeout-consistency-pass` — refresh indexes, source registry, production routing, question status and state files.
4. `governance/post-kickstart-completeness-audit` — ensure indexes, graph, coverage, repository map and source inventory are not skeletons.
5. `actionable/readiness-gate` — decide honestly whether the corpus is:
   - `baseline_created_not_actionable`
   - `partially_actionable`
   - `actionable_for_priority_scope`
   - `adoption_ready`

## Rules

- **Do not** describe the corpus as ready for team adoption while
  `corpus.actionable_readiness_status != covered`.
- **Do not** describe the kickstart as finished while important generated
  knowledge is invisible through empty indexes, a skeleton graph, stale
  coverage matrix or unknown repository map.

## What "actionable" means

For each critical/high brick, the corpus should contain enough detail for
downstream consumers without forcing them to rediscover the application:

- **Delivery workflows**: safe code change boundaries, impact notes, tests,
  risks.
- **Spec / impact-analysis workflows**: workflows, business rules, entities,
  related tickets/docs.
- **Reliability / incident workflows**: runtime topology, signals, failure
  modes, playbooks/watchlist.

If a consumer would need to reread the whole repository to perform a
normal task on the brick, the brick is **not actionable** and the corpus
is not ready for strong team adoption.

## Validator hard-rejects

The validator hard-rejects:

- pipeline passes covered out of order;
- pipeline passes covered with missing artifacts or missing diagrams;
- adoption/handover material when `code_analysis_status != covered` or `actionable_readiness_status != covered`;
- durable corpus writes from multiple subagents in parallel;
- P4 features documented without companion files or interviews.
