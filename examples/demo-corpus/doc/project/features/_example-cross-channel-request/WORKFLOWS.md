---
type: workflow
status: active
confidence: confirmed
source: pack
last_validated:
related_features: ["_example-cross-channel-request"]
related_components: []
related_risks: []
related_bugs: []
---

# Cross-channel Request Handling — Workflows

## Main flow

```text
User/System
  -> Entry point
  -> Validation
  -> Request service
  -> Persistence
  -> Processing worker
  -> Notification/status update
```

## Status lifecycle

```text
DRAFT -> SUBMITTED -> ACCEPTED -> PROCESSING -> COMPLETED
                         |             |
                         v             v
                      REJECTED       FAILED
```

## Alternate flows

| Flow | Trigger | Expected behavior |
|---|---|---|
| Invalid input | Missing or inconsistent fields | Reject before persistence or store as draft depending on business rule. |
| Duplicate request | Same requester and same payload inside a defined window | Reject, merge, or reuse existing request depending on rule. |
| External notification failure | Provider unavailable | Retry or mark notification pending without rolling back core request. |
| Worker failure | Async processing error | Mark failed or retry according to retry policy. |
