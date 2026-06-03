---
type: corpus-run-index
status: active
confidence: confirmed
source: pack
last_validated:
---

# Corpus Runs

This directory records continuous enrichment sessions.

Each run should say what was attempted, which roadmap node was worked, which sources/tools were consumed, what was learned, what was capitalized and what should happen next.

## Files

| File | Purpose |
|---|---|
| `RUN_LEDGER.md` | Global chronological run ledger. |
| `RUN_TEMPLATE.md` | Template for one run record. |
| `YYYY-MM-DD-<run-id>.md` | Individual run records. |

## Run Discipline

- Read-only external actions are allowed by default when tools are available.
- Mutating external systems requires explicit operator request.
- Logs and sensitive data are summarized by default.
- A run may produce little durable knowledge, but it must record that honestly.
