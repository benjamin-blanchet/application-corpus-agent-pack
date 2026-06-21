---
type: prod-section
status: draft
confidence: unknown
source: pack
last_validated:
title: "Production Snapshots"
description: "Create one folder or file per analysis."
---

# Production Snapshots

Create one folder or file per analysis. Keep evidence, time window, sources and confidence explicit.

During kickstart, when Dynatrace/APM or another production source is available, `Corpus` should create an initial snapshot:

```text
YYYY-MM-DD-production-discovery.md
```

This file is the production state review / rapport d'étonnement for the application. It should capture runtime topology, key signals, surprises, unknowns and candidate durable knowledge without inventing root causes.

When the operator asks to understand production problems over several recent days, do not stop at the snapshot. Run `exploration/production-temporal-correlation` and store the analysis under `doc/prod/reliability-analyses/`.
