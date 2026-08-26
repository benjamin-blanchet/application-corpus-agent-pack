---
name: pr-review-response
category: development
description: "Triage and answer review comments on a pull request: classify each as blocking, advisory or false positive, fix the blocking ones inside the existing plan, reply on every thread, and re-request review only once nothing blocking remains."
---

# Pull Request Review Response

## Purpose

Process review comments systematically, so they stop accumulating silently.

Unanswered comments are the visible form of a real problem: nobody knows
whether they were considered, disagreed with, or missed. Answering them all —
including the ones you decline — is what keeps a reviewer willing to review the
next one.

## When

After a review lands on a change that went through the factory. The pull
request already exists as a human- or Delivery-created draft.

## 1. Collect

Gather every unresolved inline comment with its file and line, every
review-level comment, and the reviewer's identity — a human and an automated
reviewer earn different default trust, and it is worth knowing which you have.

## 2. Triage

| Class | Meaning | Action |
|---|---|---|
| **Blocking** | correctness, security, data safety, a contract or specification deviation | fix |
| **Advisory** | maintainability, naming, clarity, a defensible alternative | fix if cheap and in scope, otherwise answer why not |
| **False positive** | the reviewer misread the code or its context | answer with the evidence, do not change the code |
| **Out of scope** | a real issue, unrelated to this change | route to `SUGGESTIONS.md`, answer with the link |

A false positive is answered, never ignored. Silence reads as agreement to
everyone except the person who wrote the comment.

Automated reviewers produce more false positives than humans and produce them
confidently. Read the code before accepting a finding — a change made to
satisfy a bot that was wrong is a change nobody asked for.

## 3. Fix inside the existing contract

A blocking fix is a change to the same subject, so it obeys the same rules: it
belongs in an authorised bounded lot, it gets the verification its change type
requires, and it goes through independent review like anything else.
The Controller observes the changed inputs and automatically invalidates
integration, review, corpus, candidate, acceptance/evidence and release gates
as applicable. Never leave `release_ready` untouched because a comment arrived
after the first review.

A review comment does not authorise widening scope. If the correct fix falls
outside the approved plan, that is a plan amendment and it needs the
corresponding approval — not a quiet extra commit while the branch is open.

## 4. Answer every thread

One reply per thread, saying what was done or why it was not, and pointing at
the change. Fixed, declined with a reason, deferred with a destination — all
three are answers. Only silence is not.

## 5. Re-request review

Only once nothing blocking remains. Re-requesting with open blocking findings
spends the reviewer's attention on work that was not ready, and it is how a
reviewer learns to deprioritise your changes.

## 6. Record

Append to `JOURNAL.md`: the comments received, their classification, what was
changed, what was declined and why. A recurring class of finding across
changes is not a series of incidents — it is a convention nobody wrote down,
and it belongs in the corpus so the next change starts from it.

## Rules

- **Never push to a merged pull request.** Check its state first; if it is
  merged, open a new one.
- Never resolve a thread you did not answer.
- Never accept an automated finding without reading the code it points at.
- Delivery may update draft metadata; approval, ready-for-review and merge
  remain human actions.
