---
type: operations-guide
audience: operator
status: stable
confidence: confirmed
source: pack
title: "Agent context discipline"
description: "Practical rules for keeping permanent instructions small and loading only task-relevant knowledge."
---

# Agent context discipline

The pack does not estimate cost or promise token savings. Runtime hosts load
instructions, tools and caches differently, so a single numeric report would
be misleading. Instead, the pack follows structural practices that avoid
unnecessary context.

## Permanent surfaces

- Keep `AGENTS.md`, Copilot instructions and agent personas focused on
  invariants, routing and write boundaries.
- Put detailed procedures in skills; put scenario-specific depth in referenced
  procedure files.
- Avoid repeating the same rule in agents, skills and operator docs.
- Do not store generated reports, source payloads or changing runtime state in
  permanent instructions.
- Treat main skill files over the progressive-disclosure guideline as a signal
  to split them; run `node scripts/validate-skills.mjs`.

## Per-task loading

- Select one role for the bounded task.
- Load only the skill selected by the request, then only the referenced
  procedure matching the current scenario.
- Use `node scripts/corpus-load.mjs --task "<task>"` to retrieve a targeted
  corpus slice. Increase its budget or use `--expand` only when the omitted
  list shows necessary material.
- Read indexes and state before opening whole knowledge families.
- Summarize completed exploration before switching to unrelated work.

## Source adapters

Attach only the tools needed for the active phase:

| Phase | Typical adapters |
|---|---|
| State, pack checks, P1→P3 | Local filesystem and Git. |
| P4→P9 | Repository access required for the analyzed code. |
| Jira/Confluence | Atlassian adapter for that bounded lane. |
| Production | Declared observability/data adapter for that bounded lane. |
| Peer corpus | Declared workspace, Git or MCP transport. |

Probe an adapter before using it and keep the point-in-time availability in
the current run. Do not attach every possible source merely because the pack
supports it.

## Session hygiene

- Keep the chosen role/model stable during one bounded execution when the host
  supports prompt caching.
- Avoid editing always-loaded instructions mid-execution.
- Compact or start a fresh session at natural task boundaries, not mid-step.
- Keep raw logs and payloads out of conversation when a bounded summary and
  evidence reference are sufficient.
- Never persist secrets while trying to preserve source context.

These practices are portability and clarity rules, not a billing guarantee.
