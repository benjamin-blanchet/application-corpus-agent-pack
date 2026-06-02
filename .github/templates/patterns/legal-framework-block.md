# Pattern: Legal Framework Block

**Where**: `BUSINESS_RULES.md`, §1 at the top.

**Purpose**: Anchor the rules to authoritative sources before listing them. Distinct from the Legal Context table in README — this one is for the rules side, listing the legal anchors that ground specific BR-NN rules.

## Template

```markdown
## 1. Legal / Regulatory framework

| Rule | Source | Detail |
|------|--------|--------|
| <Rule name> | <Law / regulation reference> | <Specific shape this gives to BR-NNs below> |
| <Standard name> | <Standard reference> | <Impact on data model or flow> |
| <Internal policy> | <Internal reference> | <Constraint imposed> |
```

## Real example

See `doc/project/features/_example-cross-channel-request/BUSINESS_RULES.md` §1 — references L221-18, L221-28, IFRS 15.

## Anti-patterns

- Citing the law without saying which BR-NNs flow from it
- Mixing legal and internal sources without distinction
