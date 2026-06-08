# Copilot surfaces — where the pack runs and how roles are entered

The pack ships four human-facing roles (`corpus`, `functional-analyst`,
`reliability-analyst`, `developer`). The mechanism that selects a role
differs by surface. This note exists because the founding model — a
selectable agent as the entry point — only holds where an agent picker
exists.

## Surface map

| Surface | Agent picker | `tools:` enforced | How a role is entered |
|---|---|---|---|
| VS Code Chat | yes | yes | select the agent from the picker |
| GitHub coding agent (github.com) | yes | yes | select the custom agent (agents panel / on issue assignment) |
| **GitHub Copilot app** (desktop) | **no** | **no** | adopt a role from intent (`copilot-instructions.md` routing) |
| Web chat (github.com) | no | no | adopt a role from intent |

Skills (`.github/skills/`), `AGENTS.md`, `copilot-instructions.md` and path
instructions are honored on every surface. Only the *role entry* differs.

On picker surfaces the write boundary is mechanical: an agent's `tools:` list
decides what it can touch, so `corpus` cannot edit source code even if asked.
On the Copilot app and web chat there is no such enforcement — the write
boundary is a contract the model holds, reinforced by the re-anchoring footer
(below) and the `foundations/` discipline skills.

## Using the Copilot app as a non-developer

Analysts, POs and managers are the first audience here. The three read-only
roles — `functional-analyst`, `corpus`, `reliability-analyst` — never touch
application source code, so they are safe to run without a developer in the
loop.

1. **One task, one session.** State the task at the start: "impact analysis
   on the payment feature", "enrich the corpus on the batch module". The
   model adopts the matching role and names it back to you.
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
(§ Picker-less surfaces); the `corpus` role uses the richer
`foundations/corpus-status-footer` during kickstart and continuous runs.
