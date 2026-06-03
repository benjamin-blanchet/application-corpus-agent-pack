---
type: team-usage-guide
status: draft
confidence: confirmed
source: pack
last_validated:
---

# Team Usage Guide

This guide explains how the team should use the corpus and agents after the initial kickstart.

## Rule of thumb

The corpus is the application memory. Agents should read it before acting and update it when durable knowledge is learned.

## Which agent should I use?

| Situation | Use |
|---|---|
| I need to understand or enrich application knowledge | Corpus |
| I have a vague need, ticket or business request | Functional Analyst |
| I need to implement a validated change | Developer |
| I need to investigate an incident, logs, errors or production behavior | Reliability Analyst |

## Common workflows

### New feature or change request

1. Use `Functional Analyst` to clarify the need and produce a spec.
2. Review the spec with the team.
3. Use `Developer` to implement from the validated spec.
4. Use `Corpus` to capture durable decisions or new knowledge.

### Bug or incident

1. Use `Reliability Analyst` to analyze evidence.
2. Store durable findings as incidents, known bugs, risks or playbooks.
3. Use `Corpus` to reconcile related feature and production files.

### Discovery of an undocumented behavior

1. Ask `Corpus` to capture the knowledge.
2. Require source and confidence metadata.
3. Update indexes and related files.

## What not to do

- Do not ask agents to guess missing architecture.
- Do not let a generated document become canonical without review.
- Do not duplicate the same fact across many files without links.
- Do not append new facts if old files say the opposite.
