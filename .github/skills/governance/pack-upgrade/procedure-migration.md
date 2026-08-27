# Procedure — migration and schema repair

## 1. Detect the transition

Read `PACK_VERSION` as `to_version`. Before reading corpus state, search
`doc/_meta/pack-upgrade-*-to-*.md` for an incomplete report with this target.

- Exactly one match: resume it and reuse its `from_version` and path.
- Several matches: stop with a blocking question.
- No match: capture `doc/_meta/corpus-state.yaml.pack_version` as
  `from_version`, or the literal `unknown` when absent.

Make filesystem-safe slugs by replacing characters outside
`[A-Za-z0-9._-]` with `-`.

## 2. Create the checkpoint first

Before any other migration write, create or resume:

```text
doc/_meta/pack-upgrade-<from_slug>-to-<to_slug>.md
```

It must have valid OKF frontmatter, `status: in-progress`,
`validation_status: pending`, and the captured versions. The report is the
single recovery signal throughout the migration.

## 3. Inventory the new contract

- Run `node scripts/validate-skills.mjs`.
- Inventory agents and profiles now installed.
- Report broken references and local orphan candidates; never delete an
  unrecognized local extension automatically.
- Compare required meta files with the current schemas and the skills that own
  them.

For each missing field:

- derive it from existing corpus evidence when possible and cite that source;
- otherwise use `confidence: unknown` and name the run that will populate it;
- do not rescan application code during migration.

If `doc/_meta/corpus-state.yaml` was absent in an existing corpus, reconstruct
it from `schemas/corpus-state.yaml.template`. If the template is missing, stop
with a pack-integrity finding.

## 4. Apply named structural migrations

Only execute migrations explicitly declared by this pack version. For each:

1. inspect the old artifact;
2. reconcile durable facts into its replacement;
3. record paths and digests in the upgrade report;
4. remove an obsolete active artifact only when the sync/migration allowlist
   names that exact path.

Do not turn this rule into a wildcard deletion mechanism.

When new optional corpus zones exist, create only their empty template state.
Population from code belongs to a later corpus run.

## 5. Reconcile adopted Factory workflows

Factory workflows are optional project CI. If none is active, record
`factory_workflows: not_adopted`. If one is active, compare it with the shipped
template, show the diff and require operator approval before replacement.
Validate adopted workflows with:

```bash
node scripts/validate-delivery.mjs --lint-template --json
```

A present stale workflow is blocking; an explicitly absent optional workflow
is not.

