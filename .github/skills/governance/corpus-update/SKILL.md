---
name: corpus-update
category: governance
description: "Capture durable knowledge into the corpus after a task, discussion, incident, spec or implementation."
---
# Corpus Update

## Purpose

Capture durable knowledge into the corpus after a task, discussion, incident, spec or implementation.

For development work, this is not optional. Every significant implementation must end with either direct corpus updates or explicit entries in `doc/_meta/update-candidates.md` when editing is blocked.

## Routing

| Knowledge | Target |
|---|---|
| Stable feature behavior | `doc/project/features/<feature>/` |
| Architecture/component fact | `doc/project/architecture/` or feature `ARCHITECTURE.md` |
| Workflow or state transition | feature `WORKFLOWS.md` |
| Business rule | feature `BUSINESS_RULES.md` |
| Production behavior | feature `OPERATIONS.md` or `doc/prod/` |
| Known bug | `doc/prod/known-bugs/` |
| Structural risk | `doc/prod/structural-risks/` |
| Investigation method | `doc/prod/root-cause-playbooks/` |
| Monitoring signal | `doc/prod/watchlist/` |
| External tool convention | `doc/mcp/` |
| Implementation decision or deviation | relevant `doc/spec/...` package |

## Process

1. Identify durable knowledge.
2. Determine canonical target.
3. Add or update frontmatter.
4. Reconcile related files.
5. Update indexes.
6. Record open questions when confidence is not confirmed.

## Development closeout checklist

After implementation, check at least:

- Did the spec package reflect the final implementation?
- Did feature behavior, architecture, workflow, rule or operations knowledge change?
- Did the task reveal a bug, risk, support note or monitoring signal?
- Did any index need a new or updated link?
- Did an older corpus statement become false or incomplete?

If yes, update the corpus immediately and use `authoring/reconciliation` where needed.
