---
type: adoption-plan
status: draft
confidence: confirmed
source: pack
last_validated:
title: "Next 30 Days"
description: "This plan helps the team move from operator-led kickstart to autonomous usage."
---

# Next 30 Days

This plan helps the team move from operator-led kickstart to autonomous usage.

## Week 1 — Review and correct the initial corpus

- AI champion reviews `doc/README.md`, `doc/CORPUS_MAP.md` and `doc/_meta/kickstart-report.md`.
- Team validates the application profile and major indexes.
- Unknowns are triaged in `doc/_meta/open-questions.md`.
- At least one correction pass is run with `Corpus`.

## Week 2 — Use the corpus on one real change

- Select one real ticket or small change.
- Use `Functional Analyst` to produce or improve a spec package.
- Use `Developer` only after the spec is reviewed.
- Capture new durable knowledge with `Corpus`.

## Week 3 — Use the corpus on one real production topic

- Select one incident, recurring error, known bug or operational pain point.
- Use `Reliability Analyst` to structure the analysis.
- Capture a known bug, risk, playbook or watchlist item if relevant.
- Link production knowledge back to affected features.

## Week 4 — Quality and autonomy review

- Run a corpus quality check.
- Review whether indexes are still useful.
- Check that new knowledge has evidence and confidence metadata.
- Decide whether the corpus has reached team-owned maintenance.

## Success criteria

- The team has used at least two agents on real work.
- The AI champion knows how to route requests.
- The corpus contains corrections from the team, not only generated content.
- At least one durable production or implementation learning has been captured.
