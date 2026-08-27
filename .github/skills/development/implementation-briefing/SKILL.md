---
name: implementation-briefing
category: development
description: "Present the concise implementation briefing in chat once a complete specification exists and before asking the operator to approve it. Four questions, linked to the full package. Never a substitute for the specification."
---

# Implementation Briefing

## Purpose

Make the intended implementation understandable **before** the approval gate.

The briefing is a chat summary of a complete specification. It is not a
lightweight specification, and approving it is not approving the change: the
operator approves `SPECIFICATION.md`.

## When

After the specification package is complete and self-checked, before asking for
approval. Before any plan exists and before any code work.

```text
complete specification -> briefing in chat -> human approval -> plan
```

Do not brief a specification with unresolved blocking questions. Resolve or
surface them first — a briefing that hides an open question converts it into a
silent assumption.

## The four questions

1. **What changes?** Observable behaviour, contracts and acceptance criteria
   affected.
2. **How will it be implemented?** Technical approach, boundaries crossed and
   verification, at outcome level. Do not invent detail the specification does
   not contain.
3. **Which decisions and risks need attention?** Operator decisions, material
   assumptions, regression, security, data, rollout and dependency risk. Say
   `none identified` only when the evidence supports it.
4. **What deliberately stays unchanged?** The non-goals and protected
   boundaries that prevent scope drift.

## Shape

```markdown
## Implementation briefing

Complete contract: `doc/spec/<version>/<ticket>/SPECIFICATION.md`

1. **What changes?**
   - <observable change, and the acceptance criteria it touches>
2. **How will it be implemented?**
   - <technical outcome, boundary crossed, primary verification>
3. **Decisions and risks needing attention**
   - <decision or risk; owner; consequence>
4. **Deliberately unchanged**
   - <non-goal or protected boundary>

This briefing summarises the complete specification. Approve or request changes
to `SPECIFICATION.md`; no plan and no code work start before that approval.
```

Trivial and small changes keep all four answers, one line each. Standard and
large ones cite criterion IDs and name the areas that will need a plan
decision.

## Gate handling

- Record the briefing and the operator's response in `JOURNAL.md`.
- The controller has no `spec_approved` event until explicit approval is
  captured against the current spec digest. **Silence is not approval, and
  approving a plan is not approving a specification.** A later spec change
  makes the attestation stale.
- On requested changes: revise the specification, re-check it, brief again.

## Rules

- No model allocation, no worker delegation, no lots, no code before the gate.
- Do not compress away safety, migration, security or acceptance risk — those
  are the reasons a briefing exists.
- If the briefing and the specification disagree, the specification wins.
