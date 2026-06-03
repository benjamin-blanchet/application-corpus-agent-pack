---
type: business-rules
status: active
confidence: confirmed
source: pack
last_validated:
related_features: ["_example-cross-channel-request"]
related_components: []
related_risks: []
related_bugs: []
---

# Cross-channel Request Handling — Business Rules

| ID | Rule | Source | Confidence |
|---|---|---|---|
| BR-001 | A submitted request must have a requester, channel and payload. | example | confirmed |
| BR-002 | A completed request must not return to processing without an explicit reopen operation. | example | confirmed |
| BR-003 | Duplicate detection must be deterministic and documented. | example | confirmed |
| BR-004 | A notification failure must not necessarily invalidate the core request. | example | confirmed |

## Agent guidance

When converting real code to rules, always link each rule to evidence: code path, test, ticket, Confluence page, API contract or human confirmation.
