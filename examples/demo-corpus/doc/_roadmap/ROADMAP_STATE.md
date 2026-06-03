---
type: corpus-roadmap-state
status: draft
confidence: unknown
source: pack
last_validated:
---

# Roadmap State

## Current Mode

| Field | Value |
|---|---|
| Corpus mode | continuous_enrichment |
| Active node | root |
| Last completed node | unknown |
| Last run | unknown |
| Resume hint | If the operator says `continue`, resume the active node unless context is insufficient. |
| Adoption guide status | not_started |

## Coverage Snapshot

| Area | Status | Notes |
|---|---|---|
| Roadmap generated | not_started | Initial skeleton only. |
| Graph generated | not_started | Initial skeleton only. |
| Run ledger initialized | not_started | Initial skeleton only. |
| Initial code discovery | not_started | |
| Initial production discovery | not_started | |
| Initial Atlassian discovery | not_started | |

## Resume Protocol

If context is clear:

```text
Resume the active node from the last run ledger entry.
```

If context is unclear:

```text
I do not know what to continue. Here are the last active nodes and next actions. Which one should I resume?
```
