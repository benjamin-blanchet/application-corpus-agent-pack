# Pattern: Decision Tree ASCII

**Where**: `AI_AGENT_GUIDE.md`, near the top.

**Purpose**: Branching logic an agent (or human) should follow when faced with a user request. Faster than prose, exhaustive on key branches.

## Template

```markdown
## Quick decision tree

```
User <wants / asks about> <action>:
    │
    ├─ <Discriminating question>?
    │       │
    │       ├─ YES → <Action / Flow A> (BR-<NN>)
    │       │       │
    │       │       ├─ <Sub-condition>? → <fine-grained action>
    │       │       └─ <Other sub-condition>? → <other action>
    │       │
    │       └─ NO → <Action / Flow B>
    │               └─ <method()>
    │
    └─ <Other major branch>?
            └─ <Action> (with reason)

User <wants other thing>:
    │
    ├─ <condition>?
    │       └─ <action>
    │
    └─ <other condition>?
            └─ <action>
```
```

## Real example

See `doc/project/features/_example-cross-channel-request/AI_AGENT_GUIDE.md` "Quick decision tree" — three top-level branches (terminate, change plan, reactivate).

## Anti-patterns

- Tree of only one level: just a list, no decision logic
- Forgetting the BR-NN references on rejections: agent doesn't know why
- Too deep (>4 levels): unreadable; split into multiple trees
