---
type: meta
status: active
confidence: confirmed
source: code
last_validated: 2026-08-26
title: "Local Startup"
description: "How to run this pack locally for validation and factory acceptance."
---

# Local Startup

This repository is a copy-into-repo corpus pack and CLI, not a server
application. The local execution contract is therefore command-based.

## Prerequisites

- Node.js `>=18`.
- A Git checkout of this repository.
- No application database, browser profile, long-running server, or persistent
  credential is required for the pack test suite.

## Build, Start, Health, Stop, Reset

| Role | Operation | Command / outcome |
|---|---|---|
| Build | `pack-build` | `npm pack --dry-run --json` verifies package assembly without publishing. |
| Start | not applicable | The pack has no local server process. |
| Health | not applicable | `npm test` and validators are the health signal. |
| Stop | not applicable | No persistent process is started. |
| Reset | not applicable | Tests use temporary folders and clean their own fixtures. |
| Revision probe | `pack-revision` | `git rev-parse HEAD` returns the candidate revision. |

## Non-applicable runtime surfaces

This CLI profile declares endpoint, authentication, and application data as
structured `not_applicable` surfaces with explicit reasons. No fake base URL,
credential identity, dataset id, or dataset version is needed to run the pack
tests. The candidate revision remains observable through `pack-revision`.

For a real application generated from this pack, replace this file and
`doc/project/runtime/ENVIRONMENTS.yaml` with stack-specific build/start/health,
revision, stop and reset evidence.
