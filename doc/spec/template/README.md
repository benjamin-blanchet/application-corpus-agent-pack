---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Spec Package — `<topic>`

<!--
This README is the per-package overview. Copy this whole `template/` folder into:
  doc/spec/<version>/<jira>/

Path convention is enforced:
  <version> = target release/version slug read from the Jira ticket's fixVersion
              (or equivalent target-release field). If the field is empty or
              ambiguous, ask the operator before creating the folder. Never invent
              a version. Normalize to a filesystem-safe slug, e.g. v1.4.0, 2026.05,
              next (only when the operator explicitly accepts "next").
  <jira>    = Jira issue key, e.g. PROJ-1234. If no Jira ticket exists, ask the
              operator for a short kebab-case topic slug.

Replace placeholders below. Sections marked OPTIONAL can be dropped on
Trivial/Small triage classes.

Per-class file inclusion (see development/change-triage):
  Trivial   → keep SPECIFICATION.md + CHANGELOG.md only
  Small     → + minimal IMPACTS.md + minimal TESTS.md
  Standard  → all 7 files
  Large     → all 7 files + explicit perf budget in IMPACTS.md + sibling sync
-->

## Overview

- **Ticket / source**: `<ticket-id or "internal" + link>`
- **Topic**: `<short title>`
- **Triage class**: `<trivial | small | standard | large>` <!-- from development/change-triage -->
- **Owner (developer)**: `<name or handle>`
- **Owner (reviewer)**: `<name or handle>`
- **Target version / release**: `<version-slug>` (must match the `<version>` segment of this package's folder)
- **Jira fixVersion (raw)**: `<exact value read from Jira, or "absent — operator confirmed <slug>">`

## Links

- Jira: `<URL or N/A>`
- Confluence: `<URL or N/A>`
- Related specs: `<doc/spec/.../ or none>`
- Related feature folder(s): `<doc/project/features/<feature>/ or none>`
- Related prod knowledge: `<doc/prod/.../ or none>`

## Status checklist

- [ ] Spec validated by operator (Step 5b)
- [ ] Implementation plan validated (Step 7)
- [ ] Code implemented
- [ ] Verification passed (`TESTS.md` updated with results)
- [ ] Direct corpus writes applied (feature files where behavior changed)
- [ ] Update-candidates filed and consumed by `Corpus`
- [ ] Multi-repo sibling sync recommendation produced (if applicable)
- [ ] PR description produced (Step 15)
- [ ] Candidate branch published through the repository's authorised path
- [ ] Draft PR opened by `Delivery`; human approval/merge still pending

## Files in this package

```text
README.md          # this file
SPECIFICATION.md   # need + scope + business rules + acceptance criteria
IMPACTS.md         # modules, APIs, DB, batches, integrations, regression, perf, cross-repo, prod risk
TESTS.md           # test strategy by category
SUMMARY.md         # stakeholder-readable summary with acceptance criteria
SUGGESTIONS.md     # out-of-scope findings (never fixed in this change)
CHANGELOG.md       # one line per material spec change
JOURNAL.md         # chronological record of how it was actually built
```

Added after the specification is approved, never before:

```text
TECHNICAL_PLAN.md          # rationale, lots, DAG, decisions, review plan
factory/plan.v3.json       # approved lots, claims, capabilities and proofs
factory/events.v3.jsonl    # canonical append-only event history
factory/state.v3.json      # reproducible projection; never edit by hand
```

Add `acceptance-plan.yaml` at the package root plus executable config/tests
under `acceptance/` before candidate freeze. Run artefacts belong under
`acceptance/runs/` or in the declared CI artefact store. The controller records
`factory/evidence-manifest.v3.json` only after acceptance; do not create a
hand-written placeholder.

## Instantiate the V3 scaffold

The committed machine scaffold is validator-clean **at this template path**.
After copying it, do not reuse that path binding:

1. replace every placeholder in the specification and technical plan;
2. in `factory/plan.v3.json`, replace the specification entry in both
   `lots[].read_claims` and `lots[].handoff.inputs` with the new
   repository-relative package path, for example
   `doc/spec/<version>/<topic>/SPECIFICATION.md`;
3. recompute the handoff input SHA-256 from the finalized file bytes, then
   update claims, outputs, verification commands and other placeholders;
4. keep `factory/events.v3.jsonl` empty until the Controller appends the first
   `package_initialized` event; let that controlled append regenerate
   `factory/state.v3.json` from the edited plan and event log;
5. run `node scripts/validate-factory.mjs <new-package-path>` before approval.

Never copy the shipped `state.v3.json` forward as asserted truth after editing
the plan. It is only the deterministic zero-event projection of this exact
scaffold.
