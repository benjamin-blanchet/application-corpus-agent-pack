---
type: diagram
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
title: "Module dependency graph (P2)"
timestamp: "2026-05-28"
---

# Module dependency graph (P2)

```mermaid
flowchart TD
  api["api (REST controllers)"] --> app["application (use cases)"]
  app --> domain["domain (entities, rules)"]
  app --> ports["ports (interfaces)"]
  infra["infra (JPA, Kafka)"] -.implements.-> ports
  messaging["messaging (consumers)"] --> app
  api --> dto["dto"]
```
