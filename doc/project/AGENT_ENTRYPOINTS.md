---
type: agent-entrypoints
status: active
confidence: confirmed
source: pack
last_validated:
---

# Agent Entrypoints

Only human-facing agents are listed here. Repository orientation is handled by the technical skill `exploration/repo-explain`, used internally by any agent when needed.

| Task | Agent | Main skills |
|---|---|---|
| Kickstart corpus | `corpus` | `foundations/kickstart-setup`, `foundations/corpus-kickstart`, `exploration/repo-explain` |
| Create or enrich feature knowledge | `corpus` | `authoring/feature-folder-creation`, `exploration/code-exploration` |
| Capture durable knowledge after a task | `corpus` | `governance/corpus-update`, `authoring/knowledge-capture` |
| Write a spec from a need | `functional-analyst` | `authoring/spec-from-need`, `authoring/spec-writing`, `exploration/repo-explain` |
| Implement a validated spec | `developer` | `authoring/implement-spec`, `authoring/implementation-guard`, `exploration/repo-explain` |
| Investigate an incident | `reliability-analyst` | `authoring/analyze-incident`, `authoring/incident-investigation`, `exploration/repo-explain` |
| Audit corpus quality | `corpus` | `governance/corpus-quality-check` |

## Technical non-agent capability

| Capability | Skill | Used by |
|---|---|---|
| Repository orientation, stack detection and file localization | `exploration/repo-explain` | Any human-facing agent |


## Corpus-first development lifecycle

For `developer`, the normal flow is:

```text
read relevant corpus -> use/create spec package -> implement -> test -> update/reconcile corpus
```

Use `functional-analyst` when the need is functionally unclear. Use `corpus` when durable knowledge must be captured, reconciled or quality-checked.
