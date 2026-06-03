---
type: meta
status: active
confidence: confirmed
source: pack
---

# Code Interview Logs

This directory holds per-brick interview transcripts produced by `pipeline/per-brick-interview`.

One file per brick (feature, module, integration, structural finding, cross-cutting concern):

```
doc/_meta/code-interview/<brick-slug>.md
```

The interviews are mandatory output for:

- every feature processed by P4 (`pipeline/p4-feature-silo-deep-dive`) unless explicitly skipped in the feature's `_evidence.yaml`;
- any P5 catalog entry the code alone cannot disambiguate;
- any HIGH/CRITICAL P7 finding that needs human judgement;
- any P9 contradiction the code cannot resolve.

Use `SESSION-template.md` as the starting structure. Keep transcripts synthetic — never paste sensitive material verbatim.
