---
type: meta
status: active
confidence: confirmed
source: pack
last_validated:
title: "Source Inventory"
description: "Record the sources used to build or enrich the corpus."
---

# Source Inventory

Record the sources used to build or enrich the corpus.

| Source | Type | Location / query | Used for | Confidence | Notes |
|---|---|---|---|---|---|
| Repository files | code | local workspace | stack detection, source mapping | unknown | Fill during kickstart. |


## Registry

Durable source profiles, transports, allowed uses and safety constraints are maintained in `doc/_meta/information-sources.yaml`. Historical evidence and freshness are maintained separately in `doc/_meta/source-coverage.yaml`.

A source must be registered there before agents rely on it for durable corpus claims.
Current runtime visibility is deliberately absent from both files; probe it immediately before use.
