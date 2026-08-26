---
name: runtime-source-probe
category: sources
description: "Check the point-in-time capabilities of any declared source transport before use, without persisting session availability as corpus state."
---
# Runtime Source Probe

## Purpose

Check whether this agent runtime can safely use the transport needed for a
declared information source. The result belongs to this run only. It must
never be written as a global or current corpus property.

This skill is transport-neutral. MCP, SQL, API, CLI, browser, clone, file
export and local filesystem transports all follow the same contract.

## Mandatory reads

1. `doc/_meta/information-sources.yaml` — durable source and transport policy.
2. `doc/_meta/source-coverage.yaml` — evidence collected before this run.
3. The source's `operational_doc` from its contract.
4. `doc/_meta/app-profile.yaml` when consent or environment mapping matters.
5. `governance/safe-operation-guardrails` before any probe with side effects
   or material cost.

## Three truths that must remain separate

- **Source contract**: persistent declaration, policy, mappings and safe probe
  definition in `information-sources.yaml`.
- **Runtime observation**: point-in-time visibility, connectivity, permission
  and probe outcome for this run. Emit it in the response or attach it to the
  dated run record only.
- **Source coverage**: historical evidence actually collected, maintained in
  `source-coverage.yaml` and summarized in `discovery-coverage.md`.

Never copy runtime state into `corpus-state.yaml` or the source contract.

## Procedure

1. Select the logical source and transport from the durable contract.
2. Verify that the intended use is allowed and the access mode is safe.
3. Inspect which required tools or capabilities this runtime actually exposes;
   a `usable` observation must name every `required_tools` capability.
4. Run the contract's bounded, read-only `safe_probe` when it is both possible
   and necessary. Record the applied limit and observed result count; neither
   may exceed `safe_limit`.
5. Produce one observation conforming to
   `schemas/runtime-source-observation.schema.yaml`.
6. Gate the requested discovery on that observation.
7. If evidence was collected, update source coverage and the source's
   operational documentation. If access failed, report the reduced scope and
   add a precise blocking question when operator action is required.

Use `node scripts/check-runtime-sources.mjs --source <id> --json` to print a
probe plan. Pipe or pass a JSON serialization of the point-in-time observation
(JSON is a YAML-compatible representation of the schema) back with
`--observation -` or `--observation <temporary-file>` for contract validation.
The script prints only; it never writes a current-state file.
`--allow-partial` is only a reduced-scope acknowledgement for explicitly
selected optional sources. It never neutralizes a required source. Required
source continuation would need a separate structured operator waiver carrying
approver, reason and timestamp; this command intentionally provides no such
waiver path.

## Runtime states

| State | Meaning |
|---|---|
| `usable` | A bounded read-only probe succeeded. |
| `visible_unverified` | The capability is visible but no safe probe ran. Do not use it for strong claims. |
| `not_visible` | This runtime does not expose the required capability. |
| `unreachable` | The transport is visible/configured but cannot be reached. |
| `permission_denied` | The transport responded but access is insufficient. |
| `mapping_missing` | Access works but the project, space, entity or environment mapping is unknown. |
| `unsafe_to_probe` | No probe can be run within the declared safety bound. |

These states describe an observation at `observed_at`, never the source itself.

## No silent fallback

When a required source cannot be used:

1. State the exact runtime observation and its impact.
2. Do not erase or downgrade valid historical coverage merely because this run
   lacks access.
3. Mark this run blocked. Continue partially only after a structured operator
   waiver; merely labeling the output partial is not a waiver. Mark historical
   coverage `blocked` only when the required target has no sufficient prior evidence.
4. Ask for the missing capability, permission or mapping when operator action
   is required.
5. For an optional source, continue with a reduced scope only when it is
   explicitly labeled.

Fallback transports are allowed only when `transport_semantics: alternative`,
the selected transport has `fallback: true`, its priority is declared and any
required consent is attested. Report the selected fallback and why higher
priority transports were not used. Complementary transports all gate the source.

## Durable closeout

After successful use:

- update `doc/_meta/source-coverage.yaml` with evidence references, the dated
  run and freshness;
- reconcile the human view in `doc/_meta/discovery-coverage.md`;
- capitalize verified queries, mappings, limitations and pitfalls in the
  source's `operational_doc`;
- update `doc/_meta/source-inventory.md` and `doc/_indexes/by-source.md` when a
  source was used for the first time.

Do not persist tool attachment, server-running, authentication-result or
"available now" fields anywhere in the global corpus.

## Anti-patterns

Do not:

- infer that a source does not exist because a tool is absent from this run;
- treat an old successful observation as proof of current access;
- treat current access as evidence that the source was deeply covered;
- run unbounded or write-capable probes;
- put credentials, tokens or raw sensitive payloads in observations;
- maintain a second source registry inside run notes.
