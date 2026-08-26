# Agents & workflow

← [Back to README](../README.md)

## Human-facing agent set

The deployable pack separates semantic work from coordination and external
delivery. Humans may select the domain roles directly; the Factory Controller
routes factory work through bounded handoffs.

| Agent | Role |
|---|---|
| **Corpus** | Owns continuous corpus enrichment: roadmap, graph, runs, kickstart, deep code analysis pipeline (P1 → P9), exploration, reconciliation, quality checks, knowledge capture and adoption guide material. |
| **Functional Analyst** | Turns needs, tickets and source material into specs and impact analyses. |
| **Planner** | Turns an approved spec into the human TIP, dependency DAG and bounded V3 work packages without implementing them. |
| **Developer** | Implements validated specs using the corpus (especially P4 feature folders) as context. |
| **Reliability Analyst** | Investigates production incidents and captures operational knowledge. |
| **Factory Controller** | Owns typed events, derived state, scheduling, path reservations and handoffs — never spec/code/review/corpus/acceptance content. |
| **Code Reviewer** | Reviews one exact lot or integrated changeset in fresh context and returns structured findings without fixing it. |
| **Acceptance** | Executes the approved campaign on one frozen candidate and generates normalized results/evidence. |
| **Delivery** | Creates or updates one authorised draft PR from an existing remote branch; never pushes, approves, merges or deploys. |

Repository orientation, planning, code-analysis passes, roadmap maintenance and
production discovery remain technical **skills**, not extra state-owning agents.

## Development lifecycle

For significant development work, the pack enforces a spec-to-draft-PR loop:

```text
read corpus -> approved spec -> approved plan -> bounded implementation/review
-> verified integration -> corpus closeout -> frozen candidate
-> acceptance/evidence -> release review -> draft PR -> human merge
```

The `Developer` does not start from a raw ticket or own global workflow state.
It receives an approved, capability-bounded work package grounded in the corpus,
matches the repository's existing stack/conventions and returns a result to the
Controller for independent review. Corpus closeout and acceptance are separate
roles/gates. See [Software factory V3](software-factory.md).

## Authoring and development skills

The `Developer`, `Planner`, `Functional Analyst` and `Reliability Analyst`
agents draw from two skill families:

| Family | Purpose | Skills |
|---|---|---|
| `authoring/` | Produce and validate corpus artifacts (specs, feature folders, incident analyses, Jira tickets, knowledge capture, reconciliation). | `spec-from-need`, `spec-writing`, `spec-completeness-check`, `implement-spec`, `implementation-guard`, `feature-folder-creation`, `incident-investigation`, `analyze-incident`, `jira-ticket-writing`, `jira-bug` / `jira-story` / `jira-task` templates, `knowledge-capture`, `modification-tracking`, `reconciliation`, `scope-deepening` |
| `development/` | Executable software-factory contracts around a change. | `change-triage`, `model-routing`, `factory-control-plane`, `capability-contract`, `technical-intervention-plan`, `subagent-implementation-orchestration`, `existing-code-integration`, `pre-commit-review`, `environment-discovery`, `acceptance-evidence`, `factory-release-readiness`, `draft-pr-delivery`, `corpus-closeout-delegation` |

## Spec path contract

Specs follow the path contract `doc/spec/<version>/<jira>/`, where `<version>` is derived from the Jira `fixVersion` field. The `Functional Analyst` and `Developer` agents enforce this layout when creating or validating spec packages.
