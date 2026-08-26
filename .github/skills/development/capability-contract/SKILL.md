---
name: capability-contract
category: development
description: "Resolve deny-by-default role capabilities at every shipped executor/provider boundary, require host enforcement attestations for dangerous actions, and state honestly where generic IDE tools are not sandboxed."
---

# Capability Contract

## Rule

A sentence saying “do not push” is not a security boundary. Before a shipped
executor or provider performs an action, it checks the role contract under
`.github/templates/software-factory/roles/role-capabilities.yaml`, the work
package, operator authorisation when required, and the effective host-control
attestation. Missing evidence means deny.

## Enforcement boundary

The pack directly controls only its CLIs, adapters and protected workflows.
Those entry points must check before side effect and cannot accept an actor's
self-declared capability as proof.

Generic IDE file/command tools are **not** made into a sandbox by this YAML.
For them, the host must provide filesystem, credential and egress isolation;
otherwise the role is ineligible for network, secrets, data mutation, Git
write or provider actions. Repository delta attestation at lot return detects
unreserved writes, but is explicitly post-action detection, not prevention.

## Dimensions

Validate separately: readable artefacts · exact/prefix write claims · allowed
commands/operations · network destinations · secret exposure · `git_commit` ·
`git_push` · `open_pr` · `data_mutation` · the host control that enforces each
dangerous dimension.

Role capability and operator authorisation are cumulative, not alternatives.
A role denied `git_push` cannot gain it from a conversational “go”. A role
allowed test-data mutation still needs the environment contract, cleanup and
any approval required by its risk policy.

### Acceptance conditional capabilities

The V3 Controller shipped by this pack does not create, operate or verify an
isolated acceptance executor. Consequently its Acceptance event actor is
always exactly `read` + `execute`: `network` and `data_mutation` remain absent
from the effective capability set. A `capability_grants` object, a signed
string, a GitHub Environment approval, or the word `protected` cannot change
that decision and is rejected by the event contract and reducer.

An external integration may become eligible only when a trusted verifier can
machine-verify an executor-bound receipt against a configured trust anchor,
the exact candidate and policy digests, and real process/filesystem,
credential, egress and mutation controls. Until that verifier and executor
are implemented together, the installable Acceptance runtime blocks before
candidate lifecycle or adapter execution. Operator approval remains necessary
for an allowed mutation, but is never proof that isolation exists.

## Result

For each supported entry point, record a non-secret receipt containing action
id, role, capability checked, exact scope/destination, decision, policy digest,
host-control identity and attestation reference. A denied or unattested action
returns a structured blocker before the command/provider call runs.

Do not emit a synthetic receipt for work already performed. For generic source
editing, record the independently recomputed workspace delta and describe the
boundary as detection rather than pre-action enforcement.

The global forbidden set — approve PR, mark ready, merge, force-push, deploy,
change branch protection and write secrets — cannot be overridden by a work
package.
