---
name: multi-repo-workspace-detection
category: foundations
description: "Detect and declare local sibling repositories and remote peer corpora before kickstart scopes cross repository boundaries."
references:
  - procedure-detection-interview.md
  - procedure-state-and-access.md
  - procedure-downstream.md
---
# Multi-Repo Workspace Detection

Use this skill at the start of kickstart, before repository role detection;
when a sibling or remote peer is added or moved; and before creating the first
cross-repository graph edge.

## Invariants

- A monorepo is not a multi-repo workspace.
- Filesystem proximity is a signal, never operator consent.
- Local siblings and remote peer corpora share a declared `source` contract,
  but downstream access always goes through `sources/peer-corpus-access`.
- Never store credentials. Authentication remains in the operator's runtime.
- Read and merge current state; do not overwrite unrelated profile fields.
- `unsure` remains `unsure` until a targeted operator answer resolves it.

## Procedure dispatch

1. Read `procedure-detection-interview.md` to collect evidence and consent.
2. Read `procedure-state-and-access.md` to write the declarations and resolve
   peers safely.
3. Read `procedure-downstream.md` to scope kickstart and later corpus passes.
