---
name: clarify
category: development
description: "Bounded interrogation between a raw need and a complete specification: an eleven-category ambiguity sweep, at most five questions ranked by impact times uncertainty, asked one at a time, each answer folded back into the owning section immediately."
---

# Clarify

## Purpose

Close the gap between a need and a specification **before** anyone writes the
specification, so that no interpretation is chosen in silence.

This is the step the factory was missing. Its first invariant is *never pick an
interpretation and implement quietly*; without a bounded way to ask, that
invariant depends on an agent noticing its own uncertainty — which is exactly
what a confident model does not do.

## When

Between `authoring/spec-from-need` and the specification being declared
complete. Skip it only for a change whose acceptance criteria are already
written and testable.

```text
need -> clarify -> complete specification -> briefing -> approval gate
```

Catching a wrong turn in a paragraph is nearly free. Catching the same wrong
turn in three hundred lines of code is not.

## Detection — eleven categories

Score each **Clear / Partial / Missing** against the need and the corpus slice:

| # | Category |
|---|---|
| 1 | Functional scope and behaviour |
| 2 | Domain and data model |
| 3 | Interaction and flow |
| 4 | Non-functional quality attributes |
| 5 | Integration and external dependencies |
| 6 | Edge cases and failure handling |
| 7 | Constraints and trade-offs |
| 8 | Terminology consistency |
| 9 | Completion signals — what "done" observably means |
| 10 | Exercisability — can the change be observed at all, on some environment |
| 11 | Placeholders and unresolved markers |

Hunt specifically for **adjectives that carry no measurement**: robust,
intuitive, fast, seamless, secure. Each is a decision someone will make later,
alone, probably during implementation.

Category 10 is the pack's addition, and it is the one most often skipped. A
specification whose acceptance cannot be observed anywhere is not complete,
however clear its prose — it has simply moved the problem to the person who
will be asked to prove it.

## Bounding

- **At most five questions** per session. Retries on one question do not count.
- Rank by **impact × uncertainty**; ask only what changes architecture, the
  data model, decomposition, test design, behaviour, operability or
  compliance. If the answer changes nothing, it is curiosity.
- **One at a time.** Never reveal the queue — a visible list invites batch
  answers, and batch answers are guesses.
- Each question is answerable either as **2–5 mutually exclusive options** or
  in **five words or fewer**.
- Lead a multiple-choice question with `**Recommended:** <option> — <why>`, so
  the operator can answer "yes" and still have made a decision.

An open question with a recommendation is a decision offered. An open question
without one is homework.

## Fold-back — per answer, immediately

Do not batch. After **each** answer:

1. Ensure a `## Clarifications` section exists with a dated subsection.
2. Append `- Q: <question> → A: <answer>`.
3. Route the answer into the section that owns it — functional ambiguity into
   the requirements, a data shape into the model, a vague adjective into a
   measurable success criterion.
4. **Replace the statement the answer invalidated. Do not append beside it.**
   Two statements, one obsolete, is worse than the original ambiguity: the
   reader now has to guess which one is current.
5. Save immediately. A clarification lost to a context reset has to be asked
   again, and asking twice spends the operator's patience faster than anything
   else in the chain.
6. Re-check the specification's own completeness list and report the movement,
   including anything that regressed.

## Exit

- Every category is Clear, or explicitly deferred with a recorded reason.
- No unresolved blocking question remains — an unresolved blocker at the
  briefing becomes a silent assumption at implementation.
- Every remaining assumption is written down as an assumption, not as a fact.

Record the session and its outcome in `JOURNAL.md`. Where the corpus could not
answer, that gap is itself a finding: route it to
`doc/_meta/update-candidates.md` so the next specification on this area starts
from a better corpus.
