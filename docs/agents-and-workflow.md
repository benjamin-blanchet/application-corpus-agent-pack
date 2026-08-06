# Agents & workflow

← [Back to README](../README.md)

## Human-facing agent set

The deployable pack intentionally keeps the agent set small. These are the agents humans are expected to select directly:

| Agent | Role |
|---|---|
| **Corpus** | Owns continuous corpus enrichment: roadmap, graph, runs, kickstart, deep code analysis pipeline (P1 → P9), exploration, reconciliation, quality checks, knowledge capture and adoption guide material. |
| **Functional Analyst** | Turns needs, tickets and source material into specs and impact analyses. |
| **Developer** | Implements validated specs using the corpus (especially P4 feature folders) as context. |
| **Reliability Analyst** | Investigates production incidents and captures operational knowledge. |

Repository orientation, code analysis passes, adoption guide material, roadmap maintenance and production discovery are technical **skills** used by these agents — not separate agents.

## Development lifecycle

For significant development work, the pack enforces a corpus-first loop:

```text
read relevant corpus -> create/validate spec -> implement -> test -> update/reconcile corpus
```

The `Developer` agent should not start from a raw ticket alone. It must ground itself in the corpus (especially the P4 feature folders), use or create a spec package, implement from repository evidence, then update and reconcile the corpus at the end.

## Authoring and development skills

The `Developer`, `Functional Analyst` and `Reliability Analyst` agents draw from two skill families:

| Family | Purpose | Skills |
|---|---|---|
| `authoring/` | Produce and validate corpus artifacts (specs, feature folders, incident analyses, Jira tickets, knowledge capture, reconciliation). | `spec-from-need`, `spec-writing`, `spec-completeness-check`, `implement-spec`, `implementation-guard`, `feature-folder-creation`, `incident-investigation`, `analyze-incident`, `jira-ticket-writing`, `jira-bug` / `jira-story` / `jira-task` templates, `knowledge-capture`, `modification-tracking`, `reconciliation`, `scope-deepening` |
| `development/` | Corpus-loop guardrails around code changes (triage, risk, verify, PR-readiness, closeout). | `change-triage`, `risk-analysis-checklist`, `verify-by-change-type`, `pr-readiness`, `corpus-closeout-delegation` |

## Spec path contract

Specs follow the path contract `doc/spec/<version>/<jira>/`, where `<version>` is derived from the Jira `fixVersion` field. The `Functional Analyst` and `Developer` agents enforce this layout when creating or validating spec packages.
