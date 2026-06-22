---
type: feature
status: active
confidence: confirmed
source: code
criticality: critical
last_validated: 2026-05-29
title: "Orders — Checkout"
description: "Turns a validated cart into a persisted order, authorizes payment synchronously, and publishes `orders.created` for downstream fulfillment."
timestamp: "2026-05-29"
---

# Orders — Checkout

Turns a validated cart into a persisted order, authorizes payment synchronously, and publishes `orders.created` for downstream fulfillment. Entry point: `POST /v1/orders`.

## Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant O as CheckoutUseCase
  participant P as payments-service
  participant K as Kafka
  C->>O: POST /v1/orders
  O->>O: validate cart + price
  O->>P: POST /v1/charge
  P-->>O: authorized
  O->>K: orders.created (outbox)
  O-->>C: 201 Created
```

Key rules: total recomputed server-side; payment authorized before the order is confirmed; event emitted via transactional outbox so it cannot be lost.
