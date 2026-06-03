---
type: architecture
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# Persistence

PostgreSQL (schema `orders`). Outbox pattern for Kafka publication.

| Table | Purpose |
|---|---|
| `orders` | Order header (status, totals) |
| `order_lines` | Line items |
| `payments` | Capture references |
| `outbox` | Pending domain events |
