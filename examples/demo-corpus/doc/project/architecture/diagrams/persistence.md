---
type: diagram
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
title: "Persistence (P5)"
timestamp: "2026-05-28"
---

# Persistence (P5)

```mermaid
flowchart TB
  subgraph PostgreSQL[PostgreSQL — orders schema]
    t1[orders]
    t2[order_lines]
    t3[payments]
    t4[outbox]
  end
```
