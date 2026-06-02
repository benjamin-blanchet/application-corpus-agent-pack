# Pattern: Deprecated Rules Table

**Where**: `BUSINESS_RULES.md`, last section.

**Purpose**: Keep deprecated BR-NNs visible for historical traceability. Never delete or reuse a BR-NN.

## Template

```markdown
## <N>. Deprecated rules

| # | Rule | Deprecated on | Replaced by | Why |
|---|------|---------------|-------------|-----|
| BR-<NN> | <Short name of deprecated rule> | YYYY-MM-DD | BR-<NN> (or "—" if removed) | <reason for deprecation> |
| BR-<NN> | <Short name> | YYYY-MM-DD | — (removed) | <reason> |
```

## Anti-patterns

- Deleting deprecated rules: breaks references in old commits, ADRs, Jira tickets
- Reusing the deprecated number for a new rule: confusion guaranteed
- Forgetting the "Replaced by" column: readers don't know what to use today
