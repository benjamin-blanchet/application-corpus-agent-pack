---
type: spec-template
status: active
confidence: confirmed
source: pack
last_validated:
---

# Work Journal — `<ticket-or-topic>`

<!--
Chronological, honest, PII-minimized record of how this change was actually
built. It exists so that anyone — human or agent — can later answer
"how did this get made, and what went wrong on the way?" without
reconstructing it from memory or git archaeology.

Keep: decisions, gates, the load-bearing failure excerpts, corrections,
model provenance, escalations.
Do not keep: full transcripts, personal email addresses, secrets.

The validation report (cahier de recette) stays strictly factual and never
narrates any of this. The two documents have different jobs.
-->

## Header

| Field | Value |
|---|---|
| Driven by | `<operator>` |
| Surface | `<IDE / CLI / agent surface>` |
| Started | `<YYYY-MM-DDTHH:MM±TZ>` |
| Triage class | `trivial | small | standard | large` |

## Execution records

<!--
One entry per specification task, TIP task, implementation lot, lot review,
integration/verification task, consolidated review, corpus closeout,
acceptance task and final release gate.

Model provenance is recorded per entry because availability is a runtime
fact: what was planned, what was requested, and what actually ran can all
differ, and the difference is exactly what you need months later.
-->

### `<YYYY-MM-DDTHH:MM>` — `<task or lot id>`

| Field | Value |
|---|---|
| Kind | `spec | tip | lot | lot-review | integration | consolidated-review | closeout | acceptance | release-gate` |
| Model planned | `<id>` |
| Model requested | `<id>` |
| Model used | `<id>` |
| Reasoning effort | `<effort>` |
| Context tier | `<tier>` |
| Execution id | `<id>` |
| Escalation / replacement | `<reason, or —>` |

**Action.** `<what was attempted>`

**Outcome.** `<what happened, including the verification that was run>`

## Gates

<!-- Preserve the exact operator signal, not a paraphrase of it. -->

| When | Gate | Signal | Decision |
|---|---|---|---|
| `<ts>` | `spec | tip | implementation | consolidated-review | release` | `<verbatim operator signal>` | `<what it authorised>` |

## Useful failures

<!--
The build/test/runtime error that actually cost time — the excerpt, not the
whole log — with its root cause, the correction, and whether the rerun passed.
A failure that recurs twice is no longer an incident: capture it as a known
bug or a structural risk so the next agent working this area finds it.
-->

### `<short label>`

```text
<load-bearing excerpt>
```

- **Root cause.** `<...>`
- **Correction.** `<...>`
- **Rerun.** `<pass | fail>`
- **Captured as.** `<doc/prod/known-bugs/... | doc/prod/structural-risks/... | not durable>`
