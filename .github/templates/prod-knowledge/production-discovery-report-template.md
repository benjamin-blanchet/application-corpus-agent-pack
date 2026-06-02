---
type: production-discovery
status: draft
confidence: unknown
source: prod
last_validated:
time_window:
related_features: []
related_components: []
related_risks: []
related_bugs: []
---

# Production Discovery Snapshot — YYYY-MM-DD

## Executive summary

Summarize the initial runtime state in a few factual bullets. Mention whether production observability is available, partial or unavailable.

## Source availability

| Source | Environment | Time window | Status | Notes |
|---|---|---|---|---|
| Dynatrace / APM | unknown | unknown | unknown | Fill only after verification. |

## Runtime topology observed

| Runtime component | Evidence | Related repo component | Confidence | Notes |
|---|---|---|---|---|

## Runtime architecture and ecosystem

| Observed product component | Runtime entity ids/names | Environment | Related repo component | Confidence | Notes |
|---|---|---|---|---|---|

## Inbound flows

| Caller / source | Entry service | Endpoint / operation | Protocol | Window | Volume | Failure / latency signal | Evidence |
|---|---|---|---|---|---|---|---|

## Outbound flows

| Source service | Dependency / target | Type | Protocol | Window | Volume | Failure / latency signal | Evidence |
|---|---|---|---|---|---|---|---|

## Logs / metrics / traces sampled

| Signal type | Query / filter | Window | Sample size | Finding | Routed to |
|---|---|---|---|---|---|

## Key signals

| Signal | Evidence / query | Severity | Confidence | Follow-up |
|---|---|---|---|---|

## Surprises / rapport d'étonnement

| Observation | Why it is surprising | Evidence | Impact | Next action |
|---|---|---|---|---|

## Candidate durable knowledge

| Finding | Destination | Action |
|---|---|---|
| Recurring confirmed bug | `doc/prod/known-bugs/` | Create BUG file if evidence is strong. |
| Systemic risk | `doc/prod/structural-risks/` | Create RISK file if pattern is systemic. |
| Reusable investigation method | `doc/prod/root-cause-playbooks/` | Create PLAYBOOK file if reusable. |
| Signal to monitor | `doc/prod/watchlist/` | Create WATCH file if useful for future monitoring. |
| Feature-specific runtime behavior | `doc/project/features/<feature>/OPERATIONS.md` | Update feature operations. |

## Unknowns and limitations

List missing access, ambiguous service mappings, unsupported queries, incomplete data windows and assumptions.
