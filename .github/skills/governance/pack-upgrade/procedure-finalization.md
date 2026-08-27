# Procedure — finalize and validate an upgrade

## 1. Stamp and recompute

Update `doc/_meta/corpus-state.yaml` under `corpus:`:

```yaml
pack_version: <to_version>
last_pack_upgrade: <ISO-8601>
previous_pack_version: <from_version>
```

On resume, use the checkpoint's original `from_version`. Then run:

```bash
node scripts/recompute-corpus-state.mjs --apply --json
```

Record only the documented derived-field changes.

## 2. Prepare the idempotent changelog row

Prepare one `from <from> to <to>` transition in
`doc/_meta/corpus-changelog.md`. If one row already exists, reconcile it in
place. If several exist, stop rather than guessing.

## 3. Bring the corpus to the current portable format

Preview and then run `node scripts/build-okf-indexes.mjs`. It may create
generated indexes and backfill derivable metadata, but must never invent a
type or rewrite prose.

## 4. Validate before completing the report

Run:

```bash
node scripts/validate-skills.mjs
node scripts/test-runtime-sources.mjs
node scripts/validate-corpus.mjs --json
```

Also run Delivery validation when adopted Factory workflows exist. P0 findings
block completion. P1/P2 are recorded as follow-ups with their codes.

## 5. Complete the durable report

The checkpoint must contain the transition, sync conflicts/backups, schema
fields added with confidence and evidence, new capabilities, orphan
candidates, applicable workflow state, validator counts and next action.

If P0 is non-zero, set `status: incomplete-with-P0-findings` and
`validation_status: failed`. Do not write a completion changelog row.

If P0 is zero:

1. reconcile the single changelog row;
2. set report `status: complete`, keeping validation pending;
3. rebuild the dashboard;
4. rerun all applicable validators;
5. make the final durable write: `validation_status: passed` and
   `validated_at: <now>`;
6. run the corpus validator once more read-only. No durable write follows.

An interruption before the final read-only pass remains resumable from the
same checkpoint. Recap the transition, conflicts, changes, validator counts,
dashboard, report path and one next action. Never claim completion with P0.

