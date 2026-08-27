# Procedure — peer corpus refresh

Freshness is a SHA-gated diff, never a blind re-clone.

## Policy

- `each-session`: refresh before the session's first peer read.
- `on-demand`: refresh on the first read that needs the peer.
- `manual`: read the operator-managed cache and surface `last_synced_at`.
- Workspace peers are operator-owned; note relevant working-tree state.

## Sparse Git path

Delegate to the deterministic script:

```bash
node scripts/sync-peer-corpus.mjs --name <name> --url <url> --ref <ref> --surface <surface> --json
```

It performs sparse/shallow/partial initial materialization, then shallow fetch,
SHA comparison and surface-only changed-file reporting. It never materializes
application source outside the declared surface.

After success, persist `after_sha`, `synced_at` and the cache path in the peer
declaration; the agent remains the single writer of `app-profile.yaml`. Surface
non-empty `changed_files` in the run recap.

## GitHub MCP path

Read the head SHA for the declared ref and compare it with
`source.last_synced_sha`. When unchanged, stop. When changed, list the delta,
filter to the declared surface, and fetch only changed files. Hydrate the full
surface only when there is no baseline and a tree-walking strategy needs it.
Persist the resulting SHA and time.

## Failure and state

When refresh fails, use an existing cache only with a prominent stale label
containing its last sync time/SHA. Record recurring failures as a blocking
question. Never report stale data as current.

Track `cache_path`, `last_synced_sha`, `last_synced_at` per peer and
`last_external_peer_pull` / `last_adjacent_sync_check` in corpus state.
