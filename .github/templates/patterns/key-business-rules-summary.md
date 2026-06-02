# Pattern: Key Business Rules Summary

**Where**: `README.md`, after legal context, before Documentation Contents.

**Purpose**: 3-7 most-cited rules with one-line restatement. Functions as a quick reference so readers don't have to open BUSINESS_RULES.md to remember the basics.

## Template

```markdown
## Key business rules summary

These are the <N> most-cited rules. Full catalog of <total N> rules in `BUSINESS_RULES.md`.

1. **BR-<NN> — <Short rule name>**: <One-line restatement of condition and consequence>

2. **BR-<NN> — <Short rule name>**: <One-line restatement>

3. **BR-<NN> — <Short rule name>**: <One-line restatement>
```

## Real example

See `doc/project/features/_example-cross-channel-request/README.md` Key business rules summary section — 5 rules summarized.

## Anti-patterns

- Including more than 7 rules: defeats the "quick" purpose
- Restating in 3 paragraphs what should be 1 line
- Not citing the BR-NN: breaks traceability
