# Cross-application corpus and ecosystem graph

← [Back to README](../README.md)

A corpus is not limited to its own repository. The pack can read the corpora of *other* applications and stitch them into a single integration picture.

## Read a peer corpus

`sources/peer-corpus-access` reaches a declared peer application's corpus via a local workspace checkout, a sparse `doc/` git clone, or the GitHub MCP (no clone), with a SHA-gated freshness diff so each session consumes an up-to-date copy. `scripts/sync-peer-corpus.mjs` runs the deterministic git path.

## Boundary contract

Each application declares its inbound/outbound surface — exposed and called APIs, produced and consumed events, shared datastores, external systems, file exchanges — in `doc/architecture/boundary.yaml`, the sanctuarized machine-readable source of truth (schema in `schemas/boundary.yaml.schema.yaml`, conventions in `governance/boundary-contract`).

It is a first-class P3/P5 output and is reconciled against runtime flows — code wins.

## Ecosystem graph

`sources/ecosystem-corpus-discovery` discovers peer corpora across a Git org via the GitHub MCP and maintains the `doc/_meta/ecosystem-map.yaml` identity registry.

`scripts/recompose-ecosystem.mjs` joins every app's `boundary.yaml` — one app's outbound to another's inbound — into `doc/_graph/ecosystem.yaml` + `doc/architecture/ECOSYSTEM.md`, surfacing orphan events, unknown producers and contract drift as captured knowledge.
