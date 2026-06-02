# Pattern: Change Discipline Checklist

**Where**: `AI_AGENT_GUIDE.md`, last section.

**Purpose**: "When you change X, also update Y, Z, W". Prevents documentation drift when code changes.

## Template

```markdown
## When you change something here

1. **<Kind of change A>**: update <code file> AND <doc file> AND <other doc>. Add unit tests for <new scenario> AND for <related scenarios that could regress>.

2. **<Kind of change B>**: <enumeration of co-updates>. <Specific discipline like "include indexes in same migration (no orphan index PRs)">.

3. **<Kind of change C>**: <co-updates>. <Reference to relevant skill if applicable>.

4. **<Deprecation>**: move to "Deprecated rules" section in `BUSINESS_RULES.md` with date and replacement. Keep the BR-NN reserved (don't reuse).
```

## Real example

See `doc/project/features/_example-cross-channel-request/AI_AGENT_GUIDE.md` "When you change something here" — 6 numbered disciplines covering state machine, business rules, errors, integrations, schema, deprecations.

## Anti-patterns

- Vague "remember to update docs" — be specific about WHICH docs
- Forgetting tests in the discipline
- Not addressing deprecation: people will delete and lose history
