# Pattern: Code Evidence

Use in `doc/project/features/<slug>/README.md` (and any silo deep-dive) to
record **where in the analysed system** a claim comes from.

```markdown
## Code Evidence

### Entry points

| Element | Symbol | Location | Notes |
|---|---|---|---|
| `<role in the silo>` | `<Class / function / handler>` | `<path/to/file.ext:LINE>` | `<what it does here>` |

### Key operations

| Operation | Symbol | Location | Role |
|---|---|---|---|
| `<operation>` | `<method>` | `<path/to/file.ext:LINE>` | `<what it decides or performs>` |

### Divergences found

- `<claim in an upstream source>` — actual behaviour is `<observed>` (`<path:LINE>`).
```

## Rules

**`Location` carries a path into the analysed system, never into `doc/`.**
Corpus files are the output of the analysis, not evidence for it. A silo whose
only citations point back at the corpus proves nothing — `validate-corpus`
rejects it (`p4-feature-evidence-self-referential`).

**Cite a line number wherever one exists.** `path/to/File.java:29` is
re-verifiable: a reader, or a later pass, can open it and check. `path/to/File.java`
alone is an assertion. Omit the line only for whole-file artifacts
(a config file, a migration script, a generated stub).

**Record divergences in place.** When the code contradicts a ticket, a wiki
page or an earlier corpus claim, the divergence *is* the finding — it is the
main product of a reconciliation pass and it disappears if nobody writes it
down at the moment it is seen.

**Do not paraphrase what the reader can open.** The Notes column carries what
the location does not show: intent, a constraint, a gotcha, a coupling.

## Why the shape matters

A field named "files read" collects a list of files read. A table with a
`Location` column collects citations. The schema decides what the pass
produces, so the citation shape is not cosmetic — it is what makes a claim
survivable when the code moves underneath it.
