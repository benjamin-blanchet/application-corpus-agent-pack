# Pattern: Safe vs Dangerous Operations

| Safe operation | Why it is safe | Required checks |
|---|---|---|
| `<operation>` | `<reason>` | `<checks>` |

| Dangerous operation | Why it is dangerous | Mitigation |
|---|---|---|
| `<operation>` | `<risk>` | `<mitigation>` |


## Defaults

| Safe operation | Why it is safe | Required checks |
|---|---|---|
| Read repository files | No external side effect | Stay within task scope |
| Run local tests | Local validation | Inspect scripts if they may deploy/migrate/publish |
| SQL SELECT with time window and LIMIT | Read-only bounded evidence | Authorized source, no sensitive extraction |
| Generate a patch/diff | Human can review before application | Keep scope small |

| Dangerous operation | Why it is dangerous | Mitigation |
|---|---|---|
| `git push --force` | Can overwrite shared work | Block unless explicitly requested and reviewed |
| `DROP/TRUNCATE/DELETE/UPDATE` SQL | Can destroy or alter data | Block by default; use SELECT/dry-run |
| Deploy/restart/scale service | Alters runtime state | Human-operated change process |
| Bulk ticket transition | Alters project state and notifications | Produce proposed changes only |
| Broad repository rewrite | High regression risk | Spec + preview + small batches |
