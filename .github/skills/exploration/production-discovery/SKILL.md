---
name: production-discovery
description: "Initial time-bounded production discovery pass, run during or just after corpus kickstart when observability sources (Dynatrace, APM, logs) are available. Captures runtime topology, inbound/outbound flows, dependencies, reliability baseline. Triggers: 'analyse la prod', 'production snapshot', 'first reliability baseline', 'inspect dynatrace', when corpus.first_prod_pass_done == false."
owner: corpus
also_used_by: [reliability-analyst]
write_scope: ["doc/prod/**", "doc/_meta/discovery-coverage.md", "doc/_meta/corpus-state.yaml", "doc/_meta/open-questions.md"]
references:
  - procedure-default.md
  - procedure-dynatrace-bundle.md
  - procedure-temporal-escalation.md
  - procedure-runtime-architecture.md
  - references/source-discipline.md
  - references/supported-sources.md
  - references/output-routing.md
  - references/report-template.md
---

# Production Discovery

Initial production state review. Captures what the runtime environment
reveals about the application before the team relies on agents for changes
or incident analysis. For clients where Dynatrace is the main observability
platform, this pass is not optional polish — it is one of the strongest
evidence sources for understanding the real architecture, traffic shape,
hidden dependencies and operational weak spots.

## When to use

- `Corpus` is kickstarting a repository and a production source is configured.
- The operator asks for an initial production state review.
- The team needs a first reliability baseline before serious agent-assisted work.
- `doc/_meta/corpus-state.yaml` has `first_prod_pass_done: false` and access is available.

Do not block kickstart if production sources are unavailable. Record the gap
explicitly in `doc/_meta/open-questions.md`.

## ⛔ Code-first guard (mandatory pre-flight, never skipped)

Per `foundations/core-rules` § Code-first principle. This skill **reads
production in the light of code**, never the other way around.

Read `doc/_meta/code-pipeline-state.yaml`, then apply:

| `code_analysis_status` | Allowed scope |
|---|---|
| `covered` | **Full mode.** Load `procedure-default.md` + `procedure-dynatrace-bundle.md` + `procedure-runtime-architecture.md`. |
| `partial` (P1–P3 covered) | **Bounded mode.** Load `procedure-default.md` only. Single snapshot, no multi-window iteration, no repeat pulls, no temporal correlation. Findings `confidence: probable` at most. Next action: advance the code pipeline. |
| `not_started` / `started` | **Inventory mode.** Load `procedure-default.md § Inventory section` only. Record entities, sources, perimeter — no interpretation. Findings `confidence: unknown` or `probable`. Next action: launch `pipeline/p1-code-tree-inventory`. |

In all reduced-scope modes, the deliverable must surface the gap in plain
language at the top: *"Code analysis pipeline is at `<pass>`. This snapshot
is interpreted with limited depth — what is observed can be cataloged, but
what it means in the application architecture cannot be confirmed until
code analysis advances."*

The guard is non-negotiable. A rich Dynatrace surface is exactly the case
where the gap matters most — observable richness without code corroboration
produces plausible-sounding but unreliable findings.

## Mandatory reads (before procedure dispatch)

1. `doc/_meta/corpus-state.yaml`
2. `doc/_meta/information-sources.yaml`
3. `doc/prod/README.md` (when it exists)

All other reads — `doc/mcp/dynatrace*.md`, `doc/prod/RUNTIME_ARCHITECTURE.md`,
`doc/prod/COMPONENT_MAP.md`, etc. — are loaded by the procedure file that
actually needs them, not here.

## Procedure dispatch

| Situation | Load |
|---|---|
| Any execution | `procedure-default.md` |
| Dynatrace available, full mode | also `procedure-dynatrace-bundle.md` |
| Full mode + runtime topology view requested | also `procedure-runtime-architecture.md` |
| Signal warrants window-to-window comparison | also `procedure-temporal-escalation.md` (and consider escalating to `exploration/production-temporal-correlation`) |

`sources/runtime-source-probe` must run before any Dynatrace MCP query. If
Dynatrace is expected but not attached, stop Dynatrace-backed discovery
and report the exact setup gap.

## Contract (deliverables)

The pass must satisfy `governance/discovery-coverage-contract` for the
available production source. Output routing, the snapshot template, the
discovery questions and the state updates are documented in:

- `references/output-routing.md` — where each finding goes
- `references/report-template.md` — the snapshot markdown skeleton
- `references/source-discipline.md` — evidence rules
- `references/supported-sources.md` — accepted source types

## Report tone

Candid and operational:

- say when the app is invisible or poorly instrumented;
- say when runtime naming does not match repository naming;
- say when no useful conclusion can be drawn;
- do not overstate weak signals;
- prefer a short truthful report over a long speculative one.
