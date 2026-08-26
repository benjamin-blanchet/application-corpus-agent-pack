---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Specification — `<topic>`

<!--
Required for every triage class.
Trivial: keep it to ~10 lines (1-2 sentences per section).
Small/Standard/Large: fill each section meaningfully.

Every claim must cite a source (corpus file path, Jira/Confluence ref,
operator interview, or be marked as a hypothesis with `confidence: suspected | probable`).
-->

## Context

<!-- Why this change. Cite the corpus / feature folder / prod knowledge that motivates it. -->

- Trigger: `<ticket | incident | refactor | …>`
- Motivation: `<one or two sentences>`
- Corpus grounding: `<doc/project/features/<feature>/, doc/prod/known-bugs/, etc.>`

## Goals

<!-- What the change must achieve. Outcome-oriented, not implementation. -->

- `<goal 1>`
- `<goal 2>`

## Non-goals

<!-- What is explicitly out of scope of this change, even if related. -->

- `<non-goal 1>`
- `<non-goal 2>`

## Scope

<!-- Concrete delimitation: features, modules, layers, surfaces. -->

- In scope: `<list>`
- Out of scope: `<list>` <!-- forward to SUGGESTIONS.md if substantive -->

## Business rules touched

<!--
For each rule:
  - cite the source (BUSINESS_RULES.md:line, or "new rule")
  - state the rule
  - state how this change affects it (preserved / extended / changed / replaced)
If the change introduces a NEW rule that wasn't in BUSINESS_RULES.md,
it must be added to the feature's BUSINESS_RULES.md at Step 10.
-->

- `<rule>` — source: `<path:line or "new">` — effect: `<preserved | extended | changed | replaced>`

## Acceptance criteria

<!--
Each criterion must be TESTABLE. A reviewer should be able to decide
pass/fail unambiguously. Avoid "fast enough", "robust", "user-friendly"
without a measurable definition.

Map each criterion to at least one entry in TESTS.md.
-->

- [ ] **AC-001** — `<testable statement>`
- [ ] **AC-002** — `<testable statement>`
- [ ] **AC-003** — `<testable statement>`

## Constraints

<!-- Non-negotiables that constrain the implementation (compat, perf budget, security, regulatory). -->

- `<constraint>`

## Open questions

<!-- Surfaced during Step 5b. Each must have a default answer the agent will use if skipped. -->

- `<question>` — Default: `<assumed answer if operator skips>`
