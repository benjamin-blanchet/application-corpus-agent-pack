---
name: feature-validation-report
category: development
description: "Produce the stakeholder-facing validation report: factual proof that features work, bound to a frozen tested SHA, with traceability from evidence to test case to criterion. It never narrates bugs, corrections or investigation."
---

# Feature Validation Report

## Purpose

A factual, stakeholder-ready document proving a set of features is correctly
delivered. It shows **what works**, with traceability to test cases and
evidence. No implementation history, no bug narrative, no internal tooling
detail.

## The rule that overrides everything else

| Never include | Always include |
|---|---|
| bug descriptions or severity labels | test id, label, result |
| correction history ("fixed after…") | the acceptance criteria covered |
| error messages or stack traces | evidence reference per case |
| investigation steps or workarounds | environment, build and version identity |
| before-and-after-the-fix comparisons | traceability: ticket → rule → case → evidence |

A reader learns **what the system does**, never what went wrong while building
it. That history is not lost — it is in `JOURNAL.md`, which exists precisely so
this document can stay clean without anything being hidden.

The report is factual about provenance too. Declared test side effects are
stated plainly; the debugging that produced them is not.

## Structure

```text
1. Cover block       — project, version, tested SHA, environment, build, date
2. Feature sections  — one per ticket or topic
   a. summary        — one sentence: what the feature does
   b. rules verified — derived from the acceptance criteria
   c. results        — id | description | result
   d. evidence       — references, each naming the case it proves
3. Traceability      — evidence → case → criterion → ticket
```

### Cover block

| Field | Value |
|---|---|
| Project | `<name>` |
| Version | `<application version>` |
| Tested SHA | `<full tested_code_sha>` |
| Environment | `<non-production environment id>` |
| Build / image | `<identity, or justified n/a>` |
| Schema / dataset | `<identity>` |
| Test script | `<path and version>` |
| Side effects | `<declared list, or none>` |
| Date | `<YYYY-MM-DD>` |
| Tester | `<agent and human reviewer>` |

An abbreviated or absent SHA invalidates the report: a proof is only a proof of
the revision it was produced against.

## Evidence

Every passing case with an observable component carries evidence, labelled with
the case id. The evidence must show **what proves the behaviour** — not merely
that a screen rendered or a call returned.

Capture at the stable, correct final state: no transient loading, no incidental
error. An artefact that needs explaining is not evidence.

## Failing cases

A failing case is reported as failing, with its id and its expected result.
Nothing more. **The report says a case failed; the journal says why, and what
was done about it.**

Removing a failing case to keep the report clean is falsification, not tidiness.

## Automation

Where the test script is replayable without a human, the report is generated
from the run rather than assembled by hand, and its evidence is the run's own
output bound to the same SHA.

That is the point at which this document stops costing a day per delivery and
becomes a by-product. It is usually blocked by one thing — a login that needs
a person at a keyboard — and naming that blocker is worth more than optimising
anything else in this procedure.
