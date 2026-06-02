---
name: subagent-coverage-orchestration
category: actionable
description: "Use VS Code subagents by default to accelerate actionable brick coverage while keeping `Corpus` as the single owner of durable corpus writes and state transitions."
---
# Subagent Coverage Orchestration

## Purpose

Use VS Code subagents by default to accelerate actionable brick coverage while keeping `Corpus` as the single owner of durable corpus writes and state transitions.

Subagents are a speed and context-isolation tool. They do not replace gates, validation or the main agent's responsibility.

For serious/full kickstarts and broad continuous enrichment runs, parallel subagent coverage is the nominal path when `runSubagent` or `agent` is available. Sequential analysis is the fallback, not the default.

## Required VS Code setup

The main `Corpus` agent must have the `runSubagent` or `agent` tool available. The pack enables both in `corpus.agent.md` frontmatter:

```yaml
tools: ['agent', 'runSubagent', 'search', 'codebase', 'editFiles', 'runCommands']
```

If VS Code ignores unavailable tools, continue without subagents and record the limitation in `doc/_meta/actionable-readiness.md`, `doc/_runs/RUN_LEDGER.md` and the current run summary.

Do **not** require recursive subagents. Keep `chat.subagents.allowInvocationsFromSubagents` disabled by default. If the operator enables recursion, keep the pack policy to one orchestration level unless explicitly requested.

## Internal subagents

| Subagent | Scope |
|---|---|
| `corpus-brick-feature-subagent` | features, screens, user flows |
| `corpus-brick-runtime-subagent` | APIs, batches, jobs, schedulers, consumers/listeners |
| `corpus-brick-data-integration-subagent` | integrations, persistence, entities, contracts, data flows |
| `corpus-brick-reliability-subagent` | production signals, risks, known bugs, watchlist, playbooks |
| `corpus-control-plane-subagent` | indexes, graph, roadmap, coverage matrix, repository map, source inventory, run ledger consistency |

These agents are `user-invocable: false`; they are internal helpers.

## When to use

Use during:

- `actionable/brick-inventory` when many bricks must be classified;
- `actionable/brick-deep-dive` when critical/high bricks can be split by domain;
- `actionable/closeout-consistency-pass` for independent consistency checks;
- `governance/post-kickstart-completeness-audit` to check control-plane completeness;
- `actionable/readiness-gate` to get independent assessments by agent family;
- any operator request equivalent to "analyse complète", "full kickstart", "continue large scope", "coverage", "audit", or "adoption readiness".

If a run has more than one independent brick family or more than roughly 10 critical/high items, use subagents when available. If subagents are available but not used, record a short justification in the run ledger.

## Orchestration rules

1. The main `Corpus` agent reads the state and chooses bounded subagent scopes.
2. Each subagent receives only the relevant brick list and required output contract.
3. Subagents are read-only by default and return reports.
4. The main `Corpus` agent reviews reports, reconciles contradictions and writes corpus updates.
5. The main agent updates `doc/_meta/brick-inventory.yaml`, `doc/_meta/actionable-readiness.md`, indexes and state files.
6. Never let two subagents own the same output file.
7. Never mark a brick actionable from a subagent report alone; the main agent must verify evidence and update the corpus.
8. Record which subagents were invoked, skipped or unavailable in `doc/_runs/RUN_LEDGER.md`.
9. Keep subagent scopes independent. Prefer domain split over arbitrary file-count split.

## Default parallel batches

For a serious/full corpus run, launch a first wave with up to five read-only subagents when their scopes exist:

```text
Batch 1:
- feature subagent: top priority feature/screen bricks
- runtime subagent: API + batch/job bricks
- data/integration subagent: entities + external integrations
- reliability subagent: known bugs + risks + production signals
- control-plane subagent: indexes + graph + roadmap + meta consistency
```

Then the main `Corpus` agent integrates the findings and decides the next batch.

Run additional waves while critical/high bricks remain unactionable:

```text
Batch 2+:
- split by product domain, feature family, runtime family, data boundary or reliability theme
- keep each subagent scope bounded enough to return a useful report without context saturation
- stop after one coherent wave if the main agent needs to integrate or ask the operator a high-value question
```

Do not use recursion by default. Subagents must not invoke other subagents.

## Subagent prompt template

```text
You are running as an internal Corpus subagent.
Scope: <brick ids / files / domain>
Read only the relevant source and corpus files.
Return a coverage report using the required output contract.
Do not edit files.
Do not invoke subagents.
Focus on whether this scope is actionable for developer, functional-analyst and/or reliability-analyst work.
```

## Run ledger trace

Each orchestrated run must leave a trace:

```text
Subagent orchestration
- Tool availability: available | unavailable | unknown
- Invoked:
- Skipped:
- Unavailable:
- Reports integrated:
- Main-agent writes:
- Follow-up wave:
```

## Failure modes

If subagent tooling is unavailable:

- record `subagent_orchestration: unavailable` in `doc/_meta/actionable-readiness.md`;
- record the skipped parallel plan in `doc/_runs/RUN_LEDGER.md`;
- continue sequentially;
- do not lower the quality bar.

If subagent reports disagree:

- use source priority ranking from `foundations/core-rules`;
- record contradictions in `doc/_meta/reconciliation-ledger.yaml` or `doc/_meta/actionable-readiness.md`;
- ask a blocking question when evidence cannot resolve the conflict.

## Anti-patterns

Do not:

- use subagents to bypass MCP readiness or validation;
- allow subagents to write durable corpus files in parallel;
- enable recursive subagent delegation by default;
- leave available subagents unused on a broad scope without explanation;
- treat subagent summaries as evidence unless they cite the files/queries read;
- let subagent speed reduce required brick depth.
