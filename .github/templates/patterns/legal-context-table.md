# Pattern: Legal/Regulatory Context Table

**Where**: `README.md` or `BUSINESS_RULES.md` §1.

**Purpose**: Make explicit the laws, regulations, internal policies, and accounting standards that shape the feature. Anchors rules to authoritative sources.

## Template

```markdown
## Legal / Regulatory context

| Reference | Scope | Impact on this feature |
|-----------|-------|------------------------|
| <Law / regulation citation> | <Distance selling / consumer protection / GDPR / etc.> | <Specific drive on this feature> |
| <Standard / directive> | <Scope of applicability> | <Specific drive> |
| <Internal policy / framework agreement> | <Scope> | <Specific drive> |
| <Accounting standard if relevant> | <e.g., IFRS 15 for revenue> | <How it shapes data model or flow> |
```

## Real example

See `doc/project/features/_example-cross-channel-request/README.md` "Legal / Regulatory context" table — references Consumer Code art. L221-18, EU directive 2011/83/EU, GDPR art. 17, IFRS 15.

## Anti-patterns

- Generic citations without specifying which article or section
- Naming the law but not saying how it shapes the feature
- Missing internal policies (group commercial framework, internal compliance policy) — they shape behavior as much as external law
