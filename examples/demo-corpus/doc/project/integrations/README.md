---
type: integrations
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# Integrations

How the Orders Service sits in the information system.

### Inbound

| Caller | Protocol | Endpoint | Status |
|---|---|---|---|
| Web BFF | REST | POST /v1/orders | active |
| Mobile BFF | REST | POST /v1/orders | active |
| payments-service | Kafka | payments.captured | active |
| Back-office | REST | POST /v1/orders/{id}/cancel | active |

### Outbound

| Target | Protocol | Endpoint | Status |
|---|---|---|---|
| payments-service | REST | POST /v1/charge | active |
| shipping-service | Kafka | orders.created | active |
| billing-service | Kafka | orders.created | active |
| SAP | SFTP | nightly IDoc export | active |
| Dynatrace | OTLP | traces/metrics | active |
