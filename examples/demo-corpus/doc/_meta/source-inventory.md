---
type: meta
status: active
confidence: confirmed
source: mixed
last_validated: 2026-05-30
title: "Source Inventory"
description: "Record the sources used to build or enrich the corpus."
---

# Source Inventory

Record the sources used to build or enrich the corpus.

| Source | Type | Location / query | Used for | Confidence | Notes |
|---|---|---|---|---|---|
| Repository files | code | fictional demo workspace | stack detection, source mapping | confirmed | Historical demo evidence from `demo-2026-05-30`; not current runtime availability. |
| Jira | project-activity | fictional bounded demo query | project trajectory | confirmed | Historical demo evidence; freshness is stale. |
| Dynatrace | metrics | fictional bounded demo sample | runtime architecture | confirmed | Historical demo evidence; coverage is partial and stale. |


## Registry

Durable source profiles, allowed uses and safety constraints are maintained in `doc/_meta/information-sources.yaml`; historical evidence is maintained in `doc/_meta/source-coverage.yaml`.

A source must be registered there before agents rely on it for durable corpus claims.
Current runtime visibility is deliberately absent from both files; probe it immediately before use.
