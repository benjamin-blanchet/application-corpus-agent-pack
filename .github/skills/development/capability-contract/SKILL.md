---
name: capability-contract
category: development
description: "Resolve and enforce deny-by-default role capabilities before reads, writes, commands, network calls, git actions, pull-request operations or data mutations."
---

# Capability Contract

## Rule

A sentence saying “do not push” is not a security boundary. Before each action,
the controller/provider adapter checks the role contract under
`.github/templates/software-factory/roles/role-capabilities.yaml` and the
work-package scope. Missing capability means deny.

## Dimensions

Validate separately: readable artefacts · exact/prefix write claims · allowed
commands/operations · network destinations · `git_commit` · `git_push` ·
`open_pr` · `data_mutation`.

Role capability and operator authorisation are cumulative, not alternatives.
A role denied `git_push` cannot gain it from a conversational “go”. A role
allowed test-data mutation still needs the environment contract, cleanup and
any approval required by its risk policy.

## Result

Record action id, role, capability checked, scope, decision and policy version.
Never record credentials. A denied action returns a structured blocker before
the command/provider call runs.

The global forbidden set — approve PR, mark ready, merge, force-push, deploy,
change branch protection and write secrets — cannot be overridden by a work
package.
