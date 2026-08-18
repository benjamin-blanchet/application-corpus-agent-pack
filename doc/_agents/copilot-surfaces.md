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

## Agent file contract

The pack ships its roles as `.github/agents/<slug>.agent.md`. Both `<slug>.md`
and `<slug>.agent.md` are valid GitHub custom-agent files, and the name minus
that suffix is what deduplicates repository-level agents against org-level
ones — so a repo-local `corpus.agent.md` overrides an org-level `corpus.md`.

What the pack sets, and why:

| Field | Pack choice | Why |
|---|---|---|
| `description` | always present | the only **required** field; it is also what the model matches on when it picks an agent by itself |
| `name` | display name (`Corpus`, `Developer`, …) | what a human sees in the picker |
| `target` | unset | defaults to *both* `vscode` and `github-copilot`; the roles are meant to be selectable everywhere |
| `tools` | dual vocabulary — see below | one file has to work on IDE and cloud surfaces |
| `user-invocable` | `false` on the five `corpus-brick-*` / `corpus-control-plane-*` subagents | they are invoked by `corpus`, never chosen by a human; without this they would clutter every picker |

### Why `tools:` lists two vocabularies

VS Code and the cloud surfaces do not name tools the same way (`editFiles` /
`runCommands` / `codebase` on one side, `edit` / `execute` / `read` on the
other). GitHub resolves this explicitly: **all unrecognized tool names are
ignored**, precisely so a single profile can carry product-specific names.

So each human-facing role lists the IDE names *and* their cloud equivalents.
Each surface keeps what it knows and drops the rest, and the same file grants
a working toolset everywhere instead of an agent that can search but not read
on half the surfaces.

The read-only subagents deliberately stay on `read` / `search` / `codebase` —
no `edit`, no `execute` — on every surface.

### MCP on cloud surfaces

In an IDE, MCP servers are attached to the session by the IDE. On the cloud
agent they are not: a custom agent can declare its own servers through the
`mcp-servers` frontmatter object (ignored by VS Code and other IDEs), or the
org can provision them. The pack ships **no** server configuration — sources
are per-organization — but `sources/mcp-readiness-check` treats a missing
server the same way on every surface: record it as `not_attached_to_agent`
and never silently fall back to repository-only evidence.

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
