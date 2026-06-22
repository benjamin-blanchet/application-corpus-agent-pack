---
type: agent-guide
status: active
confidence: confirmed
source: pack
last_validated:
related_features: ["_example-cross-channel-request"]
related_components: []
related_risks: []
related_bugs: []
title: "Cross-channel Request Handling — AI Agent Guide"
---

# Cross-channel Request Handling — AI Agent Guide

## Safe operations

- Add tests around documented transitions.
- Clarify validation rules when linked to source evidence.
- Add observability notes when based on real log/metric fields.
- Propose idempotency improvements when duplicate processing is plausible.

## Dangerous operations

- Changing status transition rules without reviewing workflows and business rules.
- Assuming notification success is part of the same transaction as request persistence.
- Treating async worker failures as user input errors.
- Renaming identifiers used for production correlation without checking logs and support workflows.

## Decision tree

```text
Need to modify request creation?
  -> Read BUSINESS_RULES.md
  -> Read WORKFLOWS.md
  -> Check OPERATIONS.md for known failure modes
  -> Check prod/known-bugs and prod/structural-risks
  -> Then produce implementation/spec impact
```
