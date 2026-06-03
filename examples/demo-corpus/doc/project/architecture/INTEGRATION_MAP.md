---
type: architecture
status: active
confidence: confirmed
source: code
last_validated: 2026-05-28
---

# Integration map

| Direction | Counterparty | Channel | Protocol |
|---|---|---|---|
| inbound | Web BFF | `POST /v1/orders` | REST |
| outbound | payments-service | `POST /v1/charge` | REST |
| outbound | shipping-service, billing-service | `orders.created` | Kafka |
| inbound | payments-service | `payments.captured` | Kafka |
| outbound | SAP | nightly IDoc export | SFTP |
