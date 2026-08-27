# Procedure — state and peer access

## Persist the declaration

Merge an `application.multi_repo` block into `doc/_meta/app-profile.yaml` with
status, role, workspace root, interview date, consent flags, sync policy,
confirmed adjacent repositories and consumers. Every peer has a `source`:

```yaml
- name: app-b
  app_id: billing-service
  role: peer_application
  access: auto
  source:
    type: git
    host: github
    url: git@github.com:acme/app-b-corpus.git
    ref: main
    surface: doc
    cache_path: .corpus-cache/app-b
    last_synced_sha: null
    last_synced_at: null
  corpus_path: doc
  has_pack: true
  refresh_policy: each-session
  consumed_for: [ack-events]
```

Local peers use `source: { type: path, path: ../peer }`. `app_id` is the
ecosystem join key and must match the peer boundary and ecosystem registry;
`name` is only a local cache slug. Merge corresponding counts/status into
`doc/_meta/corpus-state.yaml`.

## Resolve peers uniformly

This skill declares peers and consent. `sources/peer-corpus-access` owns all
retrieval and returns a local handle through an existing workspace path, a
sparse Git cache, or targeted GitHub MCP reads/MCP hydration.

The declared `access` field selects the method; `auto` walks the supported
fallback chain and reports every downgrade. Downstream skills never open a
clone URL, cache path or GitHub MCP directly.

`.corpus-cache/` is per-developer and gitignored. Refresh is SHA-gated and
incremental. If it fails, surface staleness and the last successful SHA; never
pretend current coverage and never persist credentials.

