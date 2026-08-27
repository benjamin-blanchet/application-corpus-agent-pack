# Local startup contract

This runbook is the human-readable companion to `environment-contract.yaml`.
Replace every placeholder with repository evidence before declaring an
environment usable for acceptance.

## Prerequisites

- Runtime and package-manager versions: `<documented versions>`
- Local services or containers: `<list or none>`
- Network access and tunnels: `<list or none>`
- Logical credential references: `<names only; never values>`

## Build and start

1. Build: `<operation id from factory-ci.yaml>`
2. Start: `<operation id, or external preview deployment>`
3. Health: `<operation id and expected success signal>`
4. Revision probe: `<operation id returning the full deployed revision>`
5. Stop: `<operation id and expected stopped signal>`
6. Reset: `<operation id and post-reset verification>`

## Data and dependencies

- Dataset identity and version: `<how they are obtained>`
- Seed/reset: `<operation ids or not applicable>`
- Cleanup: `<operation id and how completion is verified>`
- Required dependency probes: `<operation ids>`

## Authentication

Document whether acceptance uses a service identity, an ephemeral browser
state, or an explicitly interactive session. Human credentials and persistent
browser profiles are never committed or uploaded as evidence.

For a CLI or library with no network endpoint, authentication, or dataset,
declare each absent surface explicitly as
`{not_applicable: true, reason: <why this runtime has no such surface>}`.
This structured form is valid only for `runtime_type: cli|library`; server and
remote-service profiles must keep concrete endpoint, auth, and data contracts.

## Known limits

Record availability windows, non-local dependencies, unsupported workflows,
and the exact operator action required when a prerequisite is unavailable.
