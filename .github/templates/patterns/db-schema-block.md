# Pattern: Database Schema Block

**Where**: `ARCHITECTURE.md`, "Database Schema" section.

**Purpose**: Complete table description. reference-grade quality means: every column, every type with precision (not just VARCHAR but VARCHAR(255)), every constraint, every index, every check.

## Template

```markdown
### <TABLE_NAME>

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `<COL>` | `<TYPE(N)>` | <PK / NOT NULL / FK → other.col / UNIQUE / DEFAULT> | <purpose, business meaning> |
| `<COL>` | `VARCHAR(NN)` | <constraint> | <purpose> |
| `<COL>` | `TIMESTAMP` | <constraint> | <purpose, time semantics e.g. UTC anchor> |
| `<COL>` | `INTEGER` | NOT NULL, DEFAULT 0 | <purpose> |
| `VERSION` | `INTEGER` | NOT NULL, DEFAULT 0 | Optimistic lock (`@Version`) |

**Indexes**:
- `<IX_NAME>` on (`<col1>`, `<col2>`) — <why this index exists>
- `<IX_NAME_PARTIAL>` on (`<col>`) WHERE `<predicate>` — <why partial>

**Check constraints**:
- `<CK_NAME>`: <constraint expression> — <business reason>
- `<CK_NAME>`: <constraint expression> — <business reason>
```

## Real example

See `doc/project/features/_example-cross-channel-request/ARCHITECTURE.md` "SUBSCRIPTIONS" table with 12 columns + 3 indexes + 2 check constraints.

## Anti-patterns

- Type without precision: "VARCHAR" instead of "VARCHAR(255)"
- Missing UNIQUE on what's logically unique
- Listing FKs without specifying the target table.column
- Forgetting check constraints — they encode invariants critical for correctness
- Not explaining WHY each index exists (the access pattern that justifies it)
