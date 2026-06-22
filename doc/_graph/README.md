---
type: corpus-graph-index
status: active
confidence: confirmed
source: pack
last_validated:
title: "Corpus Graph"
description: "This directory stores a repo-native knowledge graph in YAML/Markdown."
---

# Corpus Graph

This directory stores a repo-native knowledge graph in YAML/Markdown.

The graph is intentionally simple and versionable. It can later be exported to JSON or a graph database if useful, but the repository remains the source of durable corpus knowledge.

## Files

| File | Purpose |
|---|---|
| `nodes.yaml` | Known knowledge nodes: features, APIs, batches, runtime services, tickets, pages, signals, risks, questions and roadmap nodes. |
| `edges.yaml` | Relationships between nodes. |
| `evidence.yaml` | Evidence records linked to nodes and edges. |

## Node Creation Rule

Create child nodes automatically when the value is obvious. Mention created nodes in the chat/run summary so the operator can redirect if needed.
