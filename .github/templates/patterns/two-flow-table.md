# Pattern: Two-Flow Comparison Table

**Where**: `README.md`, near the top after Overview.

**Purpose**: Disambiguate two flows that look similar but are legally, operationally, or technically distinct. Prevents the most common source of feature confusion.

**When to use**: Feature has flows like cancel vs retract, manual vs auto, B2B vs B2C, draft vs published, active vs archived — where users routinely confuse them.

## Template

```markdown
## Two flows at a glance — <Flow A> vs <Flow B>

These two flows look similar but are <legally / operationally / technically> distinct. Confusing them is <the #1 / a common> source of bugs in this feature historically (see `_transverse/<TRANSVERSE>.md` and incidents `<incident-folders>`).

| Aspect | <Flow A> | <Flow B> |
|--------|----------|----------|
| When | <trigger conditions> | <trigger conditions> |
| Triggered by | <actor + channel> | <actor + channel> |
| Legal basis | <reference> | <reference> |
| Service method | `<Service.methodA()>` | `<Service.methodB()>` |
| State transition | `<FROM → TO>` | `<FROM → TO>` |
| Effect on <X> | <effect> | <effect> |
| Effect on <Y> | <effect> | <effect> |
| Documents generated | <list> | <list> |
| Reversible? | <yes/no> | <yes/no> |
| Time limit | <none / Nd from X> | <none / Nd from X> |
| Refund | <none / partial / full> | <none / partial / full> |
| Reporting | <KPI name> | <KPI name> |

When in doubt, the right question to ask is: "<diagnostic question that points to the right flow>". If <condition>, it's <Flow A>. Otherwise it's <Flow B>.
```

## Real example

See `doc/project/features/_example-cross-channel-request/README.md` "Cancellation vs Retraction" table.

## Anti-patterns

- Listing only 3-4 aspects: too thin. Aim for 10+ rows so the comparison is genuinely useful.
- Using prose instead of a table: humans scan tables faster.
- Omitting the diagnostic question at the end: that's the punchline that makes the table actionable.
