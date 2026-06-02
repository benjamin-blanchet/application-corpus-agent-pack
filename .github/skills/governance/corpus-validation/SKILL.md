---
name: corpus-validation
category: governance
description: "Run deterministic checks on the application corpus and turn the results into concrete maintenance actions."
---
# Corpus Validation

## Purpose

Run deterministic checks on the application corpus and turn the results into concrete maintenance actions.

This skill complements `governance/corpus-quality-check`: the quality check is an agent review, while this validation skill uses a repeatable script to catch structural drift, broken links, missing metadata and state inconsistencies.

## When to use

Use this skill:

- after corpus kickstart;
- before any adoption guide or broad team use;
- after significant corpus updates;
- after implementation work that updated `doc/`;
- when `doc/_meta/corpus-state.yaml` changes;
- before using the corpus as a baseline for a new agent workflow.

## Mandatory first reads

1. `doc/CORPUS_MAP.md`
2. `doc/CORPUS_MANIFEST.md`
3. `doc/_meta/corpus-state.yaml`
4. `doc/_meta/validation-checklist.md`
5. `doc/_meta/brick-inventory.yaml`
6. `doc/_meta/actionable-readiness.md`

## Deterministic command

From the repository root, run:

```bash
node scripts/validate-corpus.mjs
```

For machine-readable output, run:

```bash
node scripts/validate-corpus.mjs --json
```

## Validation scope

The validator checks:

- required corpus files and directories;
- internal Markdown links;
- frontmatter on important Markdown corpus files;
- required frontmatter fields: `type`, `status`, `confidence`, `source`;
- feature folder shape under `doc/project/features/`;
- atomic production knowledge naming under `doc/prod/`;
- index coverage for features, bugs and risks;
- local production indexes for known bugs and structural risks;
- `corpus-state.yaml` consistency with generated files;
- P1 measured inventory drift against the current filesystem;
- P4 fake-depth failures such as documented features with no silo files read;
- actionable readiness and adoption gates;
- unresolved `unknown` values in metadata;
- common secret patterns in corpus files.

## Severity model

| Severity | Meaning | Expected action |
|---|---|---|
| P0 | Blocking structural or safety issue. | Fix before relying on the corpus. |
| P1 | Important consistency or coverage issue. | Fix before broad agent/team use or document as an explicit limitation. |
| P2 | Hygiene, maintainability or metadata gap. | Fix when practical or record as follow-up. |

## Agent workflow

1. Run the deterministic validator.
2. Read all P0 findings first.
3. Fix safe structural issues directly when they are clearly within corpus ownership.
4. Fix P1 findings when the required evidence is available.
5. For findings that require human evidence, record precise questions in `doc/_meta/open-questions.md`.
6. For findings that need later corpus edits, record precise items in `doc/_meta/update-candidates.md`.
7. Rerun the validator after changes.
8. Summarize remaining P0/P1/P2 findings in the final response or adoption material when adoption material was explicitly requested.

## Safe auto-fixes

The `Corpus` agent may safely fix:

- missing empty index files when the expected index name is known;
- broken links caused by obvious relative path mistakes;
- missing frontmatter on pack-owned template files when content semantics are clear;
- `corpus-state.yaml` status fields that are clearly stale from generated corpus evidence.
- empty local indexes when canonical prod files already exist.

Do not invent application facts to make validation pass. If a field is unknown, keep it unknown and create or update an open question.

## Output destinations

| Result | Destination |
|---|---|
| Immediate validation report | Agent response or CI output |
| Durable validation status | `doc/_meta/validation-checklist.md` |
| Missing evidence | `doc/_meta/open-questions.md` |
| Deferred corpus fixes | `doc/_meta/update-candidates.md` |
| Adoption risks | `doc/_handover/OPEN_DECISIONS.md` or `KICKSTART_CLOSEOUT_CHECKLIST.md` |

## Anti-patterns

Do not:

- mark validation clean by deleting useful corpus content;
- hide unknowns by replacing them with guesses;
- suppress P0/P1 findings without recording why;
- treat a green structural validation as proof that the application knowledge is complete;
- treat P1 → P9 as proof that the corpus is ready for serious team use;
- commit secrets, tokens or personal data discovered during validation.
