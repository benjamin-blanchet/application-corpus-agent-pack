# Skills Map

Skills are grouped by **intent**, not by chronological order of authorship. The folder is the category; the slug describes the skill.

| Category | Intent |
|---|---|
| `foundations/` | Baseline rules and corpus-wide conventions every agent must respect. |
| `exploration/` | Read-only discovery of evidence from code, Jira/Confluence, Dynatrace, CI/CD, project activity. |
| `sources/` | Registration and readiness checks for MCP and non-MCP information sources. |
| `pipeline/` | Deep code analysis pipeline (P1 → P9). Each pass blocks the next. |
| `actionable/` | Bricks inventory and readiness gates that turn the structural baseline into corpus the team can actually work from. |
| `continuous/` | Persistent roadmap, runs, graph and next-best-actions for the post-kickstart enrichment loop. |
| `authoring/` | Skills used when producing or evolving artefacts: specs, implementations, incident playbooks, knowledge capture. Shared across `developer`, `functional-analyst` and `reliability-analyst`. |
| `governance/` | Corpus quality: validation, completeness audits, safe operation guardrails, adoption material gating, reconciliation. |
| `development/` | Developer-workflow skills used by the `developer` agent: change triage, risk-analysis checklist, verification by change type, corpus closeout delegation, PR readiness. |

## Pipeline ordering

Only `pipeline/` carries an explicit order prefix. Each pass is mandatory and resumable.

```
pipeline/p1-code-tree-inventory
pipeline/p2-logical-boundaries
pipeline/p3-feature-candidates
pipeline/p4-feature-silo-deep-dive
pipeline/p5-cross-cutting-extraction
pipeline/p6-code-style-naming
pipeline/p7-structural-issues
pipeline/p8-code-maturity
pipeline/p9-code-reconciliation-gate
pipeline/per-brick-interview          # used during P4 (mandatory), P5/P7/P9 (on demand)
```

## Adding a skill

1. Pick the category whose intent matches. If none fits, do not invent a number — propose a new category in a PR.
2. Choose a descriptive slug. No leading numbers outside `pipeline/`.
3. Cross-reference using the full path: `governance/corpus-validation`, `exploration/jira-exploration`, etc.
4. Update agent definitions if the skill should be discoverable by an agent.
5. Run `node scripts/validate-corpus.mjs` to verify the pack still validates.
