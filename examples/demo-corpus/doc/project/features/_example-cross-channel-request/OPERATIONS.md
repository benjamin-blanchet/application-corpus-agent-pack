---
type: operations
status: active
confidence: confirmed
source: pack
last_validated:
related_features: ["_example-cross-channel-request"]
related_components: []
related_risks: []
related_bugs: []
title: "Cross-channel Request Handling — Operations"
description: "This file captures how the feature behaves in production."
---

# Cross-channel Request Handling — Operations

This file captures how the feature behaves in production.

## Useful production signals

| Signal | Meaning | Related corpus target |
|---|---|---|
| Increased validation errors | Input contract drift, UI regression or caller issue. | `prod/watchlist/` |
| Worker backlog | Processing capacity or downstream dependency issue. | `prod/structural-risks/` |
| Repeated notification failures | External provider or credentials issue. | `prod/known-bugs/` or `prod/incidents/` |
| Status stuck in PROCESSING | Worker failure, retry loop or missing callback. | `prod/root-cause-playbooks/` |

## Known operational questions

| Question | Why it matters |
|---|---|
| Where are request identifiers logged? | Needed for incident correlation. |
| Which metric reflects processing backlog? | Needed for reliability monitoring. |
| Which errors are user-facing vs internal? | Needed for support triage. |

## Agent guidance

Do not record production hypotheses as facts. Use `suspected` or `probable` until logs, traces, metrics or team validation confirm the behavior.
