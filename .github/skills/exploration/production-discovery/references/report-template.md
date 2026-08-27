# Reference — production discovery snapshot template

Structure for `doc/prod/snapshots/YYYY-MM-DD-production-discovery.md`:

```markdown
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

## Source contract, runtime observation and historical coverage

| Source | Environment | Time window | Status | Notes |
|---|---|---|---|---|

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

## Surprises / fresh-eyes notes

| Observation | Why it is surprising | Evidence | Impact | Next action |
|---|---|---|---|---|

## Candidate durable knowledge

| Finding | Destination | Action |
|---|---|---|

## Unknowns and limitations
```
