# Pattern: Roles Matrix

**Where**: `AI_AGENT_GUIDE.md`, after Safe/Dangerous ops.

**Purpose**: Operation × required role(s) matrix. Reference for code reviewers and developers checking authorization logic.

## Template

```markdown
## Roles required

| Operation | Required role(s) |
|-----------|------------------|
| <Read own X> | `<CUSTOMER_ROLE>` (and must be owner) |
| <Read any X> | `<SUPPORT_ROLE>` |
| <Create X for self> | `<CUSTOMER_ROLE>` |
| <Create X for others> | `<SUPPORT_ROLE>` with `reason` field |
| <Modify own X> | `<CUSTOMER_ROLE>` |
| <Modify any X> | `<SUPPORT_ROLE>` with reason |
| <Elevated action> | `<ELEVATED_SUPPORT_ROLE>` (subset of support; explicit grant) |
| <Internal webhook> | `<INTERNAL_SYSTEM_ROLE>` (set via filter on webhook endpoints) |
```

## Anti-patterns

- Listing roles without specifying ownership constraints (own vs any)
- Missing the internal/system role for webhooks
- Forgetting elevated-permission operations that exist
