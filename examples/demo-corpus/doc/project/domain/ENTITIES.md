---
type: domain
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
title: "Domain entities"
timestamp: "2026-05-28"
---

# Domain entities

| Entity | Description | Key invariants |
|---|---|---|
| Order | Customer order aggregate root | total = sum(lines); status transitions guarded |
| OrderLine | A purchased product + quantity | quantity > 0 |
| Payment | Capture reference for an order | one active capture per order |
| Customer | Buyer reference | — |
