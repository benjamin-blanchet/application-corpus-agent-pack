---
type: handover-guide
status: draft
confidence: confirmed
source: pack
last_validated:
---

# AI Champion Guide

The AI champion is the team relay for corpus quality and agent usage after the initial kickstart.

## Responsibilities

- Keep the corpus useful, not exhaustive.
- Make sure durable knowledge is captured through `Corpus`.
- Review important corpus updates for correctness and confidence level.
- Encourage the team to use the right agent for the right work.
- Prevent append-only accumulation by asking for reconciliation when facts evolve.
- Keep open questions visible and owned.

## Agent routing

| Need | Agent |
|---|---|
| Add or reconcile durable knowledge | Corpus |
| Explore and structure a feature | Corpus |
| Turn a need or ticket into a spec | Functional Analyst |
| Implement a validated spec | Developer |
| Investigate an incident or reliability issue | Reliability Analyst |

## Daily usage examples

```text
Corpus, capture what we learned about this feature and reconcile the affected indexes.
```

```text
Functional Analyst, use the corpus and this ticket to produce a spec package with impacts and tests.
```

```text
Developer, implement this validated spec. Use the corpus first and do not modify unrelated areas.
```

```text
Reliability Analyst, analyze this incident using the prod corpus and capture any new durable finding.
```

## Review checklist for corpus changes

- Is the claim evidenced?
- Is the confidence level explicit?
- Are indexes updated?
- Are related feature, risk, bug or incident files linked?
- Did the update remove or mark contradictions?
- Are unknowns captured in `doc/_meta/open-questions.md`?

## Anti-patterns

- Asking every agent to write documentation directly.
- Creating large monolithic files instead of atomic knowledge entries.
- Accepting confident claims without sources.
- Letting old decisions remain in summaries after a later decision supersedes them.
- Treating the corpus as a one-shot deliverable instead of a team memory.
