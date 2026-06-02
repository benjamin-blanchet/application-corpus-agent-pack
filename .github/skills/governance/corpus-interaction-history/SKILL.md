---
name: corpus-interaction-history
category: governance
description: "Make corpus initialization observable and improvable by recording a synthetic history of the interaction between the human operator and the `Corpus` agent."
---
# Corpus Interaction History

## Purpose

Make corpus initialization observable and improvable by recording a synthetic history of the interaction between the human operator and the `Corpus` agent.

This skill exists because a kickstart can otherwise feel vague: the agent produces text, the operator says "continue", and nobody has a clear shared view of the current phase, generated artifacts, open decisions or next action.

## Principles

- Track the process, not individual performance.
- Prefer synthetic interaction notes over raw transcript capture.
- Make the current state visible before asking the operator to continue.
- Preserve useful questions, blockers and prompt improvements for future kickstarts.
- Do not store secrets, credentials, personal data or sensitive raw incident details.

## Canonical paths

```text
doc/_meta/kickstart-progress.md
doc/_meta/interaction-history/
  README.md
  SESSION-template.md
  YYYY-MM-DD-corpus-kickstart-session.md
  patterns/
    recurring-questions.md
    friction-points.md
    prompt-improvements.md
```

## When to use

Use this skill:

- at the start of a corpus kickstart;
- whenever the operator says "continue" or asks where the process stands;
- after each meaningful kickstart phase;
- when the agent asks a question whose answer changes the corpus plan;
- when a blocker or missing access is discovered;
- before adoption guide generation, to extract process improvements.

## Operator cockpit

Maintain `doc/_meta/kickstart-progress.md` as the live cockpit for the kickstart.

It should answer, in one glance:

- current phase;
- what has been generated;
- what is reliable;
- what is uncertain;
- what is blocked;
- what the agent will do next;
- what the operator must decide or provide.

Before continuing a long kickstart pass, the `Corpus` agent should show a short checkpoint:

```text
Kickstart checkpoint
- Phase: code exploration
- Done: app profile draft, repository map, source inventory
- Generated: doc/_meta/app-profile.yaml, doc/_meta/repository-map.yaml
- Open: production source access, Jira project key
- Next: inspect API entry points and initialize indexes
```

## Session history

Maintain one session file under `doc/_meta/interaction-history/` for each substantial kickstart, continuous enrichment or adoption-preparation session.

The session log is not a full transcript. It is a structured summary of:

- user intent;
- agent questions;
- human answers;
- decisions made;
- generated artifacts;
- friction points;
- unclear prompts;
- improvements to make the next kickstart smoother.

## Required session sections

```markdown
## Session Goal

## Timeline

## Questions And Answers

## Decisions

## Generated Or Updated Artifacts

## Current Operator View

## Friction Points

## Prompt And Process Improvements

## Privacy And Redaction Notes
```

## Update rules

After each meaningful phase:

1. Update `doc/_meta/kickstart-progress.md`.
2. Append or update the active session file.
3. Add unresolved questions to `doc/_meta/open-questions.md`.
4. Add future process improvements to `doc/_meta/interaction-history/patterns/prompt-improvements.md`.
5. Add repeated confusion or unclear operator experience to `doc/_meta/interaction-history/patterns/friction-points.md`.

## Handling "continue"

When the operator says "continue" during kickstart, do not continue silently.

First provide a concise checkpoint:

- phase;
- last completed step;
- generated files;
- unresolved inputs;
- next action.

Then continue with the next bounded step.

End the response with the `Corpus status` footer from `foundations/corpus-status-footer` so the operator has a persistent view of corpus completeness by sector.

If the next step depends on missing human input, ask one precise question instead of producing broad prose.

## Privacy and safety

Do not store:

- credentials, tokens, secrets or connection strings;
- raw personal data;
- raw private messages;
- full incident payloads unless explicitly approved and redacted;
- contributor ranking or individual performance scoring.

If sensitive information appears in the conversation, record only a redacted summary and add a note under `Privacy And Redaction Notes`.

## Quality bar

A good interaction history should help answer:

- where did the kickstart slow down?
- which questions were useful?
- which questions were premature?
- which missing source or access blocked progress?
- which prompt or agent instruction should be improved?
- what should the operator prepare before the next repository kickstart?
