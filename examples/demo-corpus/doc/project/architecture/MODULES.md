---
type: architecture
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# Modules

| Module | Responsibility | Key packages |
|---|---|---|
| `api` | REST controllers, request/response DTOs | `com.acme.orders.api` |
| `application` | Use cases / orchestration | `com.acme.orders.app` |
| `domain` | Entities, value objects, pricing rules | `com.acme.orders.domain` |
| `infra` | JPA repositories, Kafka publishers, HTTP clients | `com.acme.orders.infra` |
| `messaging` | Kafka consumers | `com.acme.orders.msg` |
