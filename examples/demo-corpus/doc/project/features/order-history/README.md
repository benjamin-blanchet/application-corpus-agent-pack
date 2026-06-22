---
type: feature
status: documented
confidence: confirmed
source: code
criticality: medium
last_validated: 2026-05-29
title: "Order History"
description: "Read-only views for a customer's past orders: `GET /v1/orders` (list) and `GET /v1/orders/{id}` (detail)."
timestamp: "2026-05-29"
---

# Order History

Read-only views for a customer's past orders: `GET /v1/orders` (list) and `GET /v1/orders/{id}` (detail). Backed by a read replica.

```mermaid
flowchart LR
  C[Client] --> API[OrderQueryController]
  API --> RO[(read replica)]
```
