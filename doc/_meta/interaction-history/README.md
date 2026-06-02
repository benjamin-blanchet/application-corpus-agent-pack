---
type: meta
status: active
confidence: confirmed
source: pack
last_validated:
---

# Interaction History

This directory records synthetic histories of important interactions with the `Corpus` agent.

The goal is to improve the kickstart and continuous enrichment process: identify unclear questions, repeated blockers, useful operator inputs, prompt improvements and adoption friction.

This is not a raw transcript archive and not a people-performance tool.

## Files

| Path | Purpose |
|---|---|
| `SESSION-template.md` | Template for a kickstart, continuous enrichment or adoption-preparation session log. |
| `YYYY-MM-DD-corpus-kickstart-session.md` | One synthesized session log per substantial kickstart session. |
| `patterns/recurring-questions.md` | Questions that repeatedly help or slow down kickstarts. |
| `patterns/friction-points.md` | Process issues that made the operator lose visibility or control. |
| `patterns/prompt-improvements.md` | Improvements to prompts, skills and agent behavior. |

## Rules

- Summarize interactions; do not paste raw transcripts by default.
- Redact secrets, credentials, personal data and sensitive internal details.
- Track process friction, not individual performance.
- Link to generated corpus files when possible.
- Promote recurring lessons into `patterns/`.
