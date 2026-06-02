---
type: mcp-reference
status: draft
confidence: unknown
source: pack
last_validated:
---

# GitHub / Git / Source Control

## Availability

Unknown until configured for the target team. Local Git history may still be available even when GitHub/GitLab/Bitbucket/Azure DevOps MCP access is not.

## Local conventions

| Item | Value | Source | Confidence |
|---|---|---|---|
| Source control provider | unknown | | unknown |
| Default branch | unknown | | unknown |
| Branch naming | unknown | | unknown |
| PR/MR convention | unknown | | unknown |
| Commit message convention | unknown | | unknown |
| Ticket key pattern | unknown | | unknown |
| CI provider | unknown | | unknown |

## Useful queries or lookup patterns

Record verified provider queries only. Do not invent repositories, branches, fields, service names or dashboards.

Local Git commands that may support project activity discovery:

```bash
git log --since="90 days ago" --pretty=format:'%h%x09%ad%x09%an%x09%s' --date=short
git log --since="90 days ago" --name-only --pretty=format: | sort | uniq -c | sort -nr | head -50
git shortlog -sne --since="90 days ago"
git log --since="90 days ago" --stat --oneline
```

## Project activity discovery

When Git or provider APIs are available, `exploration/project-activity-discovery` may use them to identify commit frequency, changed areas, hot files, PR activity, CI signals, release branches and knowledge concentration.

Use contributor information only for collaboration, handover and ownership discovery. Do not rank individual productivity.

## Common pitfalls

- Local clones may have shallow history.
- Merge commits and formatting-only commits can distort activity.
- Large generated files can pollute hotspot analysis.
- Author names may differ across identities.
- Commit volume is not value delivered.
- Check source availability before relying on it.
- Save reusable query patterns in this file after validation.
