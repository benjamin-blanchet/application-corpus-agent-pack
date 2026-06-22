---
type: feature-index
status: active
confidence: confirmed
source: pack
last_validated:
title: "Features"
description: "Feature folders capture behavior that matters to the team."
---

# Features

Feature folders capture behavior that matters to the team.

## Standard feature folder

```text
<feature>/
  README.md
  ARCHITECTURE.md
  WORKFLOWS.md
  BUSINESS_RULES.md
  OPERATIONS.md
  AI_AGENT_GUIDE.md
```

## File roles

| File | Purpose |
|---|---|
| `README.md` | Overview, boundaries, actors, source links. |
| `ARCHITECTURE.md` | Components, modules, files, data structures, dependencies. |
| `WORKFLOWS.md` | Main flows, alternate flows, state transitions, sequence diagrams. |
| `BUSINESS_RULES.md` | Rules with IDs, conditions, consequences and sources. |
| `OPERATIONS.md` | Production behavior, logs, monitoring, known bugs, risks, incidents. |
| `AI_AGENT_GUIDE.md` | Safe/dangerous operations, common traps, agent decision tree. |

## Reference example

A neutral example lives at `_example-cross-channel-request/`. It is not a target domain. It only calibrates expected depth and structure.

| Feature | Folder | Status | Notes |
|---|---|---|---|
| Cross-channel request handling | `_example-cross-channel-request/` | example | Fictional, stack-agnostic reference. |
