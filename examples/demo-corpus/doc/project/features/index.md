<!-- OKF-GENERATED: regenerate via scripts/build-okf-indexes.mjs — do not edit by hand -->

# Subdirectories

* [_example-cross-channel-request](_example-cross-channel-request/index.md) — This is a fictional stack-agnostic example.
* [order-history](order-history/index.md) — Read-only views for a customer's past orders: `GET /v1/orders` (list) and `GET /v1/orders/{id}` (detail).
* [orders-checkout](orders-checkout/index.md) — Turns a validated cart into a persisted order, authorizes payment synchronously, and publishes `orders.created` for downstream fulfillment.
* [payment-capture](payment-capture/index.md) — Consumes `payments.captured` from payments-service and moves the order from `AUTHORIZED` to `PAID`, then triggers fulfillment.

# Concepts

* [Features](README.md) — Feature folders capture behavior that matters to the team.
