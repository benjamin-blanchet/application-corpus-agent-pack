# Pattern: Business Rules Table with Sources

**Where**: `BUSINESS_RULES.md`, the main rules table per category, AND the cross-reference table.

**Purpose**: Every rule has stable ID, condition, consequence — AND traces to where it's enforced (code), decided (Jira), documented (Confluence).

## Template (main table)

```markdown
## <N>. <Category — e.g., Retraction rules>

| # | Rule | Condition | Consequence |
|---|------|-----------|-------------|
| BR-<NN> | **<Rule name in bold>** | <When the rule is checked> | <What happens; mention error code if relevant> |
| BR-<NN> | **<Rule name>** | <Condition> | <Consequence> |
```

## Template (cross-reference table)

```markdown
## Cross-references to enforcement

| Rule | Enforced in (code) | Decided in (Jira) | Documented in (Confluence) |
|------|--------------------|-------------------|-----------------------------|
| BR-<NN> | `<repo> path:<file>:<line-range>` | <TICKET-NNN> | confluence:<page-id> |
| BR-<NN> | DB constraint `<CK_NAME>` AND `<repo> path:<file>:<line>` | <TICKET-NNN> | confluence:<page-id> |
```

## Real example

See `doc/project/features/_example-cross-channel-request/BUSINESS_RULES.md` — 23 rules across 7 sections with full cross-reference table.

## Anti-patterns

- BR-NN without a code reference: rule exists in doc only, may already be missing in code
- Reusing a deprecated BR-NN for a new rule: breaks traceability — always use the next free number
- Generic "see code" without path: useless
