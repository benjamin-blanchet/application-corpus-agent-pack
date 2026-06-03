---
type: feature
status: active
confidence: confirmed
source: code
criticality: high
last_validated: 2026-05-29
---

# Payment Capture

Consumes `payments.captured` from payments-service and moves the order from `AUTHORIZED` to `PAID`, then triggers fulfillment.

## State transition

```mermaid
stateDiagram-v2
  [*] --> AUTHORIZED
  AUTHORIZED --> PAID: payments.captured
  AUTHORIZED --> CANCELLED: timeout 30m
  PAID --> FULFILLING: shipping ack
```

Idempotent on the capture id; a duplicate `payments.captured` is a no-op.
