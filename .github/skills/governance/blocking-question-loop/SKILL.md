---
name: blocking-question-loop
category: governance
description: "Make corpus kickstart interactive when missing information blocks better coverage."
---
# Blocking Question Loop

## Purpose

Make corpus kickstart interactive when missing information blocks better coverage.

The `Corpus` agent must not quietly move blocking points to `doc/_meta/open-questions.md` when the operator is present and could answer. It should ask a short, targeted question, explain why it matters, then update the corpus based on the answer.

## When to use

Use this skill whenever a missing input blocks or weakens:

- repository role or application identity;
- Jira project keys, boards, issue filters or MCP attachment;
- Confluence spaces, page roots or search terms;
- Dynatrace tenant, environment, service/entity mapping or MCP attachment;
- custom MCP/source registration;
- production discovery;
- feature/domain naming;
- handover owner, AI champion or team scope.

## Question policy

Ask questions before storing blockers, unless:

- the operator is not available;
- the answer requires another team/person;
- the source genuinely needs tooling setup outside the current session;
- asking would require secrets or credentials;
- the question is low-value and does not affect the current phase.

## Interaction shape

Ask at most 3 questions at a time. Prefer 1 question when it unlocks the next step.

Each question should include:

```text
Blocking question
- Need:
- Why it matters:
- Best answer format:
- What I will do with it:
```

Example:

```text
Blocking question
- Need: Jira project key for this application.
- Why it matters: without it I cannot sample the last 50 created/updated issues.
- Best answer format: one or more project keys, e.g. APP or APP,OPS.
- What I will do with it: run Jira readiness/smoke test, then update discovery coverage.
```

## Response handling

After the operator answers:

1. Update the relevant corpus files.
2. Update `doc/_meta/blocking-questions.md`.
3. Update `doc/_meta/open-questions.md` only for unresolved items.
4. Update `doc/_meta/discovery-coverage.md` if coverage changed.
5. Update `doc/_meta/kickstart-progress.md`.
6. Continue with the next bounded action.

## Canonical files

```text
doc/_meta/blocking-questions.md
doc/_meta/open-questions.md
doc/_meta/kickstart-progress.md
doc/_meta/discovery-coverage.md
doc/_meta/mcp-readiness.md
doc/_meta/mcp-source-wizard.md
```

## Statuses

Use these statuses in `doc/_meta/blocking-questions.md`:

| Status | Meaning |
|---|---|
| `to_ask` | The question should be asked before continuing. |
| `asked` | The question has been asked and is waiting for an answer. |
| `answered` | The operator answered and the corpus was updated. |
| `deferred` | The answer needs another person/tool/time. |
| `blocked` | Cannot progress without setup or access. |
| `not_needed` | The question no longer matters. |

## No-secret rule

Do not ask the operator to paste secrets, tokens, passwords, private keys or raw connection strings.

Ask for:

- source name;
- project key;
- space key;
- environment name;
- owner/team;
- whether tools are attached;
- where setup should happen.

## Anti-patterns

Do not:

- dump ten open questions at once;
- ask vague questions like "anything else?";
- continue with lower-quality coverage when a single answer would unlock the source;
- mark something as open without explaining whether it blocks coverage;
- ask for credentials in chat.
