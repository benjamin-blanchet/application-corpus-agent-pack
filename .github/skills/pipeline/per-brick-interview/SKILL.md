---
name: per-brick-interview
category: pipeline
description: "Run a focused interview with the operator about **one specific brick** (a feature, a module, a cross-cutting concern, a structural finding, an integration). Capture every answer in a durable transcript that other passes can read."
---
# Per-Brick Interview

## Purpose

Run a focused interview with the operator about **one specific brick** (a feature, a module, a cross-cutting concern, a structural finding, an integration). Capture every answer in a durable transcript that other passes can read.

This skill extends `governance/blocking-question-loop`. Where 41 asks 1–3 ad-hoc questions to unblock a step, 59 runs a structured 5–15 question round to extract knowledge that the code alone cannot reveal.

## When to use

- During P4 (`pipeline/p4-feature-silo-deep-dive`): once per feature, after the code-only draft.
- During P5 (`pipeline/p5-cross-cutting-extraction`): for an integration the code only hints at.
- During P7 (`pipeline/p7-structural-issues`): for a high/critical finding that needs human judgement.
- During P9 (`pipeline/p9-code-reconciliation-gate`): for any contradiction the code cannot resolve.
- During Confluence/Jira/production passes when a brick stays opaque.

Do **not** use it for trivial single-question unblockers — that is `governance/blocking-question-loop`.

## Large-repository pacing

When a pass produces many bricks, do not ask the operator to answer endless interview rounds blindly.

Use this pacing model:

| Situation | Interview mode |
|---|---|
| 1-5 bricks | normal per-brick interview |
| 6-20 bricks | triage interview first, then full interview only for ambiguous/critical bricks |
| 21+ bricks | batch review by risk/feature cluster, then full interview for the top priority set |

The operator should always see:

- how many bricks are pending;
- which bricks are being grouped together;
- why a brick needs a full interview;
- what will remain code-only if they decline or defer the interview.

## Triage interview

Before running many full rounds, ask a compact triage set:

```text
Interview triage
- Brick batch:
- Count:
- Agent hypotheses:
- Proposed priority order:
- Questions:
  1. Which of these bricks are business-critical or incident-prone?
  2. Which are legacy/deprecated and can be documented as lower priority?
  3. Which names should be merged/split before deep interview?
  4. Which bricks require a human owner/referral?
- What I will do next:
```

Record the triage result in `doc/_meta/code-interview/batch-<slug>.md` and link individual brick interviews to it.

## Mandatory first reads

1. `doc/CORPUS_MANIFEST.md`
2. The brick's draft files (e.g. the feature folder before the interview).
3. `doc/_meta/blocking-questions.md`
4. Prior interview transcripts for the same brick if any (`doc/_meta/code-interview/<slug>.md`).
5. `doc/_meta/code-pipeline-state.yaml` to know which pass is requesting the interview.

## Interview protocol

1. **Surface hypotheses first.** Show the operator the assumptions the agent made from the code. The operator can correct an assumption faster than answering an abstract question.
2. **Cap the round at 15 questions.** If more material is needed, schedule a follow-up round and record it. Walls of questions are abandoned.
3. **Order from concrete to abstract.** Start with "is this still in use?" before "what is the long-term direction?".
4. **Group by topic.** No more than 3 topic shifts per round.
5. **Allow "I do not know" with a referral.** If the operator names another person, capture the referral as a follow-up; do not push.
6. **Confirm understanding back.** After answers, restate the resulting corpus change in one sentence so the operator can correct.
7. **Respect triage.** If the operator marks a brick as legacy/low-priority, keep the interview short and record the lower confidence instead of forcing a full round.

## Question template

Each question must include:

```text
Interview question
- Brick: <feature slug | module | finding id | integration name>
- Pass: <P4|P5|P7|P9|other>
- Topic: <intent | active-vs-legacy | external-contract | operations | history | future>
- Hypothesis the agent inferred:
- Question:
- Why it matters:
- What I will write into the corpus with the answer:
- Acceptable answer types: <one-liner | list | yes/no | "ask <name>" | "I do not know">
```

## Topic checklist (use the ones that apply)

| Topic | Examples of question |
|---|---|
| Intent | "What problem was this feature created to solve?" |
| Active vs. legacy | "Two paths exist (Kafka, JMS). Which one should new code target?" |
| Canonical naming | "Among `Archive`, `Archiver`, `archiveV2`, which is the canonical feature name?" |
| External contract | "The code calls `getPartenaire`. Who owns this endpoint? Is the contract documented anywhere?" |
| Operations | "What happens in production when this consumer fails 3 times in a row?" |
| Data sensitivity | "Does this flow handle PII / financial / health data?" |
| Permissions | "Which roles are expected to use this screen?" |
| History | "Why is `OldFooService` still here? Pending migration or load-bearing?" |
| Volume | "Is the daily volume of this batch in the thousands or millions?" |
| Future | "Any planned change in the next quarter that we should not document over?" |
| Risk acceptance | "This finding looks high — is it knowingly accepted, or news?" |
| Ownership | "Who owns this brick today? Same person/squad as the rest of the feature?" |

## Output files

```text
doc/_meta/code-interview/<brick-slug>.md
doc/_meta/code-interview/batch-<slug>.md     # when triage/batch review is used
```

Per-interview file structure:

```markdown
---
type: interview
status: completed
brick_kind: feature|module|finding|integration|cross_cutting
brick_id: <slug>
pass: P4|P5|P7|P9|other
operator: <name or "anonymous">
date: YYYY-MM-DD
duration_minutes: <int|null>
questions_asked: <int>
questions_answered: <int>
referrals: []
follow_up_scheduled: null|YYYY-MM-DD
---

# Interview — <brick label>

## Hypotheses surfaced

- ...

## Q&A

### Q1 — <topic> — <one-line question>

**Hypothesis the agent had:** ...
**Operator answer:** ...
**Resulting corpus change:** updated `doc/project/features/<slug>/BUSINESS_RULES.md` section "Retry policy".

### Q2 ...

## Referrals

| Topic | Suggested person/team | Tracked as |
|---|---|---|

## Follow-up

- ...
```

Also update:

```text
doc/_meta/blocking-questions.md   # link to the interview, mark related Qs as answered
doc/_meta/open-questions.md       # add unresolved items as OQ entries
doc/_meta/discovery-coverage.md   # if interview unlocked coverage, reflect it
```

## Quality bar

A good interview round:

- ends with the operator saying "yes, that captures it";
- updates concrete files, not just adds a note;
- never asks two questions when one would suffice;
- never hides a follow-up inside an answer ("we can come back to that") without scheduling it;
- distinguishes confirmed answers from referrals.

## Anti-patterns

Do not:

- run an interview without reading the brick's draft files first;
- ask abstract / open-ended "anything we should know?" questions;
- accumulate 30+ questions in one round;
- forget to write the resulting corpus changes inline with each answer;
- mark a brick `documented` based on the draft alone when the interview is mandatory for that pass;
- store raw operator transcripts that include sensitive material — keep the interview log synthetic.
