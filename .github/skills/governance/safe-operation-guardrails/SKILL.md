---
name: safe-operation-guardrails
category: governance
description: "Prevent destructive, irreversible, high-risk or uncontrolled actions by any agent. Keep agents read-only by default unless the user explicitly requests a bounded change and the required safety gates are satisfied."
---
# Safe Operation Guardrails

## Purpose

Prevent destructive, irreversible, high-risk or uncontrolled actions by any agent. Keep agents read-only by default unless the user explicitly requests a bounded change and the required safety gates are satisfied.

This skill applies to code, files, Git, databases, production systems, tickets, CI/CD, cloud resources and connected tools.

## Default stance

```text
read-only by default
small diff by default
dry-run before execution when available
no destructive action without explicit approval
no broad unbounded operation
no YOLO execution
```

## Always blocked unless explicitly requested and safety-gated

Agents must not perform the following actions on their own initiative:

### Files and repository

- delete many files or directories;
- rewrite large parts of the repository without a spec;
- apply broad regex replacements across the repo without showing scope;
- overwrite configuration, lock files, migrations or generated artifacts without justification;
- remove tests to make a build pass;
- remove security checks, validation or error handling to simplify implementation.

### Git

- `git push`, especially to shared branches;
- `git push --force` or `--force-with-lease`;
- deleting branches or tags;
- rewriting history: `rebase`, `reset --hard`, `filter-branch`, history surgery;
- changing remotes or credentials.

### Databases

- `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `MERGE`;
- stored procedure execution with side effects;
- locks or administrative commands;
- schema migrations against non-local environments;
- unbounded SELECT queries on large production tables.

### Production / runtime

- deploy, rollback, restart or scale services;
- purge queues or caches;
- change feature flags;
- modify secrets, certificates or credentials;
- change firewall/network/IAM/cloud resources;
- trigger jobs or batch runs with side effects.

### Work tracking and collaboration tools

- transition Jira/ServiceNow tickets;
- close incidents;
- assign people;
- send notifications or comments on behalf of a human;
- bulk edit tickets/pages;
- publish Confluence pages as final truth without review.

## Safety gates for any high-risk action

A high-risk action requires all of the following:

1. explicit human request for the exact action;
2. clear environment and scope;
3. expected impact;
4. rollback or recovery path when applicable;
5. dry-run, preview, diff or SELECT equivalent when available;
6. small bounded execution plan;
7. confirmation that the action is allowed for this agent and context.

If any gate is missing, do not execute. Produce a safe plan, a dry-run command, or an update candidate instead.

## SQL guardrails

Default SQL mode is read-only.

Allowed without extra approval when source access is already authorized:

```sql
SELECT ... WHERE <bounded filters> LIMIT <bounded limit>
```

Required for production-like datasets:

- explicit time window;
- row limit;
- environment filter when available;
- no personal-data extraction unless required and approved;
- record query and limitations in the resulting corpus file.

Blocked by default:

```sql
INSERT
UPDATE
DELETE
DROP
TRUNCATE
ALTER
CREATE
MERGE
CALL
EXEC
LOCK TABLE
```

## Command execution guardrails

Before running any command, classify it:

| Class | Examples | Rule |
|---|---|---|
| read-only | `ls`, `find`, `grep`, `git log`, `npm test`, `mvn test` | allowed when useful |
| local build/test | `npm test`, `mvn test`, `composer test` | allowed if repo-local and no deploy side effect |
| write-local-safe | formatting, generating docs, editing corpus | allowed when scoped |
| write-local-risky | migrations, generated code, broad rewrites | require preview/scope |
| external-side-effect | deploy, push, ticket transition, DB write | blocked unless explicitly requested and gated |

Do not run package scripts blindly when they may deploy, publish, migrate, seed or alter external state. Inspect scripts first.

## Agent-specific application

- `Corpus`: **never** edits application source code, in any mode. Write surface is strictly `doc/**`, `.github/agents/**`, `.github/skills/**` and pack-shipped `scripts/` files. Everything else in the repo (production code, configs, manifests, migrations, tests, CI/CD, IaC) is read-only. When a code change is needed, write it to `doc/_meta/update-candidates.md` — the follow-up is outside the corpus scope, the operator decides. See `AGENTS.md` § "Write boundaries — hard rule" and the corpus agent definition.
- `Functional Analyst`: may create/update `doc/spec/`; must not change application source.
- `Developer`: may edit application source only after corpus-first lifecycle and spec gate; must update/reconcile corpus after implementation.
- `Reliability Analyst`: read-only by default; may produce incident analysis, playbooks, risks and watchlist entries; must not restart, deploy, purge, write DB state or close incidents.

### Corpus agent — hard prohibitions

If you are running as `corpus` (or one of its subagents) and you find yourself about to:

- open an editor on a file outside `doc/`, `.github/` or pack `scripts/`,
- run a code-modifying command (`sed -i`, `mv`, `rm`, `git mv`, formatter with `--write` on app sources, codemod, refactoring tool),
- accept an operator request phrased as "fix the code", "apply this patch", "rename this function", "remove that import",

stop and reroute. Decline plainly: "I never edit the source code. I can write the update candidate under `doc/_meta/update-candidates.md`; the follow-up is your decision." Write the suggestion into `doc/_meta/update-candidates.md` and surface it in the run recap. Never edit "just this once".

## Safe fallback

When an action is blocked, produce one of:

- a read-only diagnostic plan;
- a dry-run command;
- a bounded SQL SELECT;
- a patch/diff for human review;
- a corpus update candidate in `doc/_meta/update-candidates.md`;
- an open question in `doc/_meta/open-questions.md`.

## Final response requirement

When a risky action was considered, state:

- what was blocked or avoided;
- what safe alternative was used;
- what evidence was collected;
- what remains for a human to approve or execute.
