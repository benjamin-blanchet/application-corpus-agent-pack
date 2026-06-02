# Pattern: Documentation Contents Table

**Where**: `README.md`, mid-document.

**Purpose**: List all scope files in the folder with their purpose and presence/absence indicator. Aligns with `scopes_present` in frontmatter and with `corpus-state.yaml.corpus_inventory`.

## Template

```markdown
## Documentation Contents

| File | Purpose | Status |
|------|---------|--------|
| [README.md](./README.md) | This file — overview, navigation | ✅ |
| `ARCHITECTURE.md` | Classes, packages, DB schema, dependencies | ✅ |
| `WORKFLOWS.md` | Sequence diagrams, state machine, transitions | ✅ |
| `BUSINESS_RULES.md` | Numbered rules with conditions and consequences | ✅ |
| `AI_AGENT_GUIDE.md` | Decision tree, safe ops, dangerous ops, common issues | ✅ |
| ERRORS.md | Error codes catalog — <reason if not produced> | ☐ |
| DOCUMENTS.md | Generated documents — <reason if not produced> | ☐ |
| ALGORITHMS.md | <reason if not produced or not applicable> | ☐ |
| PERFORMANCE.md | <reason> | ☐ |
| CONFIGURATION.md | <reason> | ☐ |
```

## Anti-patterns

- Showing ☐ for files that don't apply without explanation — explain WHY they don't exist
- Showing ✅ for a file that has only the template placeholder — be honest, audit will catch you
- Forgetting to update the table when adding/removing a scope file
