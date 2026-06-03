---
type: prod-index
status: active
confidence: confirmed
source: pack
last_validated:
---

# Production Knowledge

This directory captures what the application does in real environments: failure modes, risks, incidents, monitoring signals and operational constraints.

## Sections

| Section | Purpose |
|---|---|
| `known-bugs/` | Confirmed recurring or active bugs. |
| `structural-risks/` | Risk patterns that can produce several bugs or incidents. |
| `root-cause-playbooks/` | Reusable investigation methods. |
| `watchlist/` | Signals to monitor after changes or incidents. |
| `incidents/` | Incident analyses. |
| `reliability-analyses/` | Broader reliability studies. |
| `snapshots/` | Time-bounded production snapshots, including the initial production discovery / surprise report. |
| `sql-analyses/` | Database-oriented investigations when relevant. |
| `memory-analyses/` | Memory/runtime analyses when relevant. |
| `RUNTIME_ARCHITECTURE.md` | Runtime entity map, observed ecosystem and production topology from Dynatrace/APM. |
| `SERVICE_FLOWS.md` | Inbound/outbound service flows, dependencies, async flows and trace samples. |

Production knowledge must distinguish facts from hypotheses.
