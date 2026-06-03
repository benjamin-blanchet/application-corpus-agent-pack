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
- [ ] PR description produced (Step 11)
- [ ] PR opened by operator

## Files in this package

```text
README.md          # this file
SPECIFICATION.md   # need + scope + business rules + acceptance criteria
IMPACTS.md         # modules, APIs, DB, batches, integrations, regression, perf, cross-repo, prod risk
TESTS.md           # test strategy by category
SUMMARY.md         # stakeholder-readable summary with acceptance criteria
SUGGESTIONS.md     # out-of-scope findings (never fixed in this change)
CHANGELOG.md       # one line per material spec change
```

## Corpus grounding

List the corpus files this spec is grounded in (cited in `SPECIFICATION.md` and `IMPACTS.md`):

- `<doc/project/features/<feature>/...>`
- `<doc/project/architecture/...>`
- `<doc/prod/.../ if relevant>`
