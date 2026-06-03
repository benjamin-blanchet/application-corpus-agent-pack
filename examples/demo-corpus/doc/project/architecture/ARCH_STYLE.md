---
type: architecture
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# Architectural style

Hexagonal (ports & adapters) on Spring Boot. Domain has no framework dependency; adapters live in `infra`. Transactional outbox guarantees event publication.
