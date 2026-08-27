---
type: architecture-zone
status: active
confidence: confirmed
source: pack
last_validated:
title: "Architecture — Boundary Contract"
description: "This zone holds the **sanctuarized boundary contract**: the single"
---

# Architecture — Boundary Contract

This zone holds the **sanctuarized boundary contract**: the single
machine-readable source of truth for everything that crosses this application's
boundary (inbound/outbound integrations).

| File | Role |
|---|---|
| `boundary.yaml` | **Source of truth** — strict, machine-readable inbound/outbound contract. |
| `BOUNDARY.md` | **Derived** human view + mermaid diagram. Regenerated from `boundary.yaml`; never hand-edited. |
| `ECOSYSTEM.md` | **Derived** cross-app topology, recomposed by scanning peers' `boundary.yaml` (written by `sources/ecosystem-corpus-discovery`). |

Conventions, schema, population and validation are owned by
[`governance/boundary-contract`](../../.github/skills/governance/boundary-contract/SKILL.md).
The formal shape is [`schemas/boundary.yaml.schema.yaml`](../../schemas/boundary.yaml.schema.yaml).

Rules:

- **Scope is boundary-crossing only** — exposed/called APIs, produced/consumed
  events, shared datastores, external systems, file exchanges. Internal calls,
  UI and internal batches are out of scope.
- `boundary.yaml` is the **implementation contract** derived at P3/P5 from a
  named code revision. `doc/prod/SERVICE_FLOWS.md` records environment- and
  revision-scoped runtime observations; reconcile deployment/configuration
  drift without erasing either claim.
- Every channel is **normalized** so one app's `outbound` joins another app's
  `inbound` — that join is how the ecosystem graph recomposes.
- The derived views (`BOUNDARY.md`, `ECOSYSTEM.md`) are regenerated, never
  edited by hand.
