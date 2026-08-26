---
name: work-journal
category: development
description: "Maintain JOURNAL.md: chronological, PII-minimised history of how a change was actually built — decisions, gates, useful failures, per-execution model provenance, and the cost figures that make the factory measurable."
---

# Work Journal

## Purpose

`JOURNAL.md` answers, months later, *how did this get built and what went wrong
on the way* — without git archaeology and without asking someone to remember.
In V3 it is the human-readable view of typed controller events and explicit
operator notes. `factory/events.v3.jsonl`, not prose, is the machine source of
truth for ordering and gates.

It is the deliberate opposite of the validation report. The report proves what
works and never narrates a bug; the journal is where all of that messy history
goes. Neither is complete alone, and separating them is what keeps the report
usable by stakeholders **and** keeps the trace intact.

| Artefact | Nature | Narrates bugs and corrections? |
|---|---|---|
| `SPECIFICATION.md` | what will change | no |
| `CHANGELOG.md` | one line per material change | only the net result |
| validation report | stakeholder proof that features work | **never** |
| `JOURNAL.md` | chronological history of the realisation | **yes — here** |

## What it must contain

1. **Decision-bearing exchanges.** The exact gate signal — approval,
   adjustment, refusal, waiver — plus a concise statement of the decision and
   what it authorised. Full transcripts are not required and are not wanted.
2. **Execution history.** Every specification task, clarification session,
   plan task, lot, lot review, integration, consolidated review, closeout,
   acceptance and final gate.
3. **Model provenance, per execution.** `planned` / `requested` / `used`,
   reasoning effort, context tier, execution id, and the reason for any
   replacement or escalation. Not one mutable header: different lots and
   reviews legitimately run on different identities, and a single header
   averages that into a fiction.
4. **Useful failures.** The load-bearing excerpt of the build, test or runtime
   error, its root cause, the correction, and the rerun outcome. Not whole
   logs — a journal nobody reads preserves nothing.
5. **Cost.** See below.

## Cost, because it is the objection that survives

Record what the runtime exposes, per execution, and refresh the total at
closeout: credits if surfaced, otherwise input and output tokens, turns and
tool calls, plus model id, effort and context tier.

Where nothing is exposed, write `not exposed by runtime` rather than leaving it
blank — an absent number and an unmeasured one are different facts.

This is what feeds `doc/_meta/cost-ledger.yaml`. A delivery gain nobody costed
is a conviction, and it is the objection that remains after every other one has
been answered.

## Repeated execution: report pass^k, not pass@k

When a lot is retried, record how many attempts ran and how many passed. The
figure that matters for a factory is **all k attempts passing**, not at least
one: a lot that succeeds on the third try is not a lot you can leave
unattended.

Retries are not independent draws either — a failed attempt contaminates the
context of the next one, so modelling them as independent overstates
reliability. Record the attempts; do not compute a probability from them.

## Where and who

`doc/spec/<version>/<ticket>/JOURNAL.md`, one per package, created with the
package and appended to continuously.

Roles return structured results to the Controller, which appends typed events
and reconciles the concise human journal. Workers never edit events/state, and
they do not paste full prompts/transcripts into the journal. The journal
captures what the validation report must not without becoming a second state
machine.

## When to append

At every meaningful transition, never in one batch at the end: a decision-bearing
exchange · the start of a phase or lifecycle step · the start and completion of
each task, lot, review and acceptance execution · each build, test or run and
its outcome · each material error, with only its essential excerpt · the
diagnosis and the correction · each blocking gate outcome · re-triage, scope
change, model replacement or escalation · closeout.

A journal written at the end is a reconstruction, and reconstructions omit
precisely the failures that were worth recording.

## PII

Use a stable session or operator reference. Do not collect personal email
addresses, do not paste full transcripts, and do not open an identity question
when identity is irrelevant to the decision trail. Never invent an identity.
