---
type: api-catalog
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# API catalog

| Method | Path | Operation | Auth | Feature |
|---|---|---|---|---|
| POST | `/v1/orders` | Create order (checkout) | OAuth2 | orders-checkout |
| GET | `/v1/orders/{id}` | Get order | OAuth2 | order-history |
| POST | `/v1/orders/{id}/cancel` | Cancel order | OAuth2 | orders-checkout |
| GET | `/v1/orders` | List customer orders | OAuth2 | order-history |
