---
type: agents-reference
audience: operator
status: stable
source: pack
title: "Copilot surfaces — where the pack runs and how roles are entered"
description: "The pack ships four human-facing roles (`corpus`, `functional-analyst`,"
---

# Copilot surfaces — where the pack runs and how roles are entered

The pack ships four human-facing roles (`corpus`, `functional-analyst`,
`reliability-analyst`, `developer`). The mechanism that selects a role
differs by surface — every current surface offers explicit selection, and
intent-based routing remains the fallback when no agent was selected.

## Surface map

| Surface | How a role is selected | Fallback |
|---|---|---|
| VS Code Chat | agent picker, or `@<agent-name>` in the chat input | intent routing |
| GitHub coding agent (github.com) | dropdown in the agents tab / panel, or on issue assignment | intent routing |
| **GitHub Copilot app** (desktop) | **`/agent` in a session** | intent routing |
| GitHub Copilot CLI | custom agent selection supported | intent routing |
| JetBrains / Eclipse / Xcode | agent picker (public preview) | intent routing |

Skills (`.github/skills/`), `AGENTS.md`, `copilot-instructions.md` and path
instructions are honored on every surface. Only the *role entry* differs.

An agent's `tools:` list filters the tools available to it — that is what
makes the write boundary mechanical rather than declarative, so `corpus`
cannot edit source code even if asked. GitHub does not document that
enforcement surface by surface, so **do not assume it** on a surface where
no agent was explicitly selected: there the write boundary is a contract the
model holds, reinforced by the re-anchoring footer (below) and the
`foundations/` discipline skills.

> Surface capabilities move fast. This map reflects the GitHub Copilot
> documentation as of August 2026 — re-check
> [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
> and [Customizing the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
> before relying on a "no" anywhere.

## Using the Copilot app as a non-developer

Analysts, POs and managers are the first audience here. The three read-only
roles — `functional-analyst`, `corpus`, `reliability-analyst` — never touch
application source code, so they are safe to run without a developer in the
loop.

1. **Select the role, or state the task.** In the Copilot app, type `/agent`
   and pick `corpus`, `functional-analyst` or `reliability-analyst`. If you
   skip that, just state the task at the start ("impact analysis on the
   payment feature", "enrich the corpus on the batch module") and the model
   adopts the matching role and names it back to you.
2. **Stay in Interactive or Plan mode**, not Autopilot. You approve each
   step; nothing runs unattended.
3. **Switch task → new session.** A role does not survive a topic change
   cleanly; a fresh chat keeps each session role-pure.
4. **Read the footer.** Every response ends with
   `— [Role] write:… · source:read-only · next: …`. If it ever shows a role
   you did not intend, or drops `source:read-only` outside the Developer
   role, restate your intent or start a new session.

`developer` edits source code and is meant for implementing a validated spec;
it is the one role that is not read-only.

## Why the footer

`copilot-instructions.md` is re-injected every turn, so the hard rules never
decay. Your opening request is just one message — it gets buried and may be
dropped when a long session is summarized. The footer is always recent, so
re-reading it re-establishes the active role each turn. Dropping it is the
usual cause of role drift (a corpus session quietly proposing source edits
twenty turns in). The full footer spec is in `copilot-instructions.md`
(§ Unselected sessions); the `corpus` role uses the richer
`foundations/corpus-status-footer` during kickstart and continuous runs.
