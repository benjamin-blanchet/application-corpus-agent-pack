---
name: ecosystem-corpus-discovery
category: sources
description: "Discover peer corpora across a Git org via the GitHub MCP, maintain the canonical app-identity registry, and recompose the cross-application integration graph from each app's boundary.yaml. Use for ecosystem mapping, cross-corpus search, or graph recomposition. Read-only; never auto-declares peers."
---
# Ecosystem Corpus Discovery

## Purpose

Turn the **declare-then-read** model of `foundations/multi-repo-workspace-detection`
into **discover → promote → read** at ecosystem scale. Instead of the operator
enumerating every peer corpus by hand, this skill:

1. **Maps the ecosystem** — finds which repos in a Git org carry this pack's
   corpus (and a boundary contract), via the GitHub MCP.
2. **Maintains the identity registry** — `doc/_meta/ecosystem-map.yaml`, the
   canonical `app_id` set that the boundary contract's `to`/`from` join against.
3. **Recomposes the cross-application graph** — scans each app's sanctuarized
   `doc/architecture/boundary.yaml` (one well-known file per app, cheap) and
   joins outbound↔inbound on normalized channels to emit a global topology,
   plus knowledge findings (orphan events, unknown producers, contract drift).

It is the recomposition tier referenced by `governance/boundary-contract`. The
whole point of "maxi convention and validation" on `boundary.yaml` is that this
skill can join contracts mechanically.

## When to use

- The operator says: `map the ecosystem`, `recompose the corpus graph`,
  `which app does X / produces topic Y`, `cross-application graph`, `scan the
  org corpora`, `find the peer that owns <integration>`.
- After boundary contracts exist in several apps and a global topology is wanted.
- Periodically, to refresh the registry and the recomposed graph.

This skill reads only. It **never** auto-declares a peer (that is the operator's
call via `foundations/multi-repo-workspace-detection`) and never frames findings
as tasks (corpus scope discipline).

## Mandatory reads

1. `doc/_meta/ecosystem-map.yaml` (the registry; ships as a skeleton).
2. `doc/architecture/boundary.yaml` (this app's own contract — the seed).
3. `doc/mcp/github.md` + `doc/_meta/information-sources.yaml` (GitHub transport contract and org conventions).
4. `doc/_meta/source-coverage.yaml` (historical GitHub source evidence).
5. `doc/_meta/app-profile.yaml` (already-declared peers; org/owner hints).

## Prerequisites & scope boundary

- A point-in-time `sources/runtime-source-probe` must report the GitHub transport `usable` with a token whose read scope covers the
  org. The token scope *is* the discovery boundary — repos it cannot read are
  invisible; say so, do not guess their existence.
- Value scales with adoption: discovery only finds apps that have this pack +
  a `boundary.yaml`. If only a few apps do, discovery ≈ declaration — state that
  plainly rather than implying full coverage.
- Read-only, bounded queries only (org-scoped `search_code`/`search_repositories`
  with result limits). Never an unbounded global sweep. **Log any truncation**
  ("scanned 40/57 repos, limit hit") — silent caps read as full coverage.

## Capability A — Ecosystem mapping

Find corpus-bearing apps in the org and register their canonical identity.

1. List candidate repos: `search_repositories org:<org>` (bounded), or probe a
   known list from `app-profile.yaml` / operator.
2. For each candidate, probe for the pack + contract via the GitHub MCP
   (read-only `get_file_contents`): `PACK_VERSION` or `doc/CORPUS_MANIFEST.md`
   (has-pack), and `doc/architecture/boundary.yaml` (has-boundary). Read
   `app.id` from the boundary when present.
3. Upsert each into `doc/_meta/ecosystem-map.yaml` (see schema). Resolve the
   canonical `app_id` from the boundary's `app.id`; if absent, derive a slug
   from the repo name and mark `app_id_provisional: true` until the app sets it.
4. Record `last_scan` and what was skipped (unreadable repos, no pack).

## Capability B — Cross-corpus search

Answer "where in the ecosystem is X documented / who produces topic Y" without
declaring or caching anything:

- `search_code` scoped `org:<org> path:doc/ <term>` (or `path:doc/architecture/
  boundary.yaml <channel>` to find producers/consumers of a channel) with a
  small result limit.
- Read the precise hit via `get_file_contents` (targeted read; see
  `sources/peer-corpus-access` Strategy A). Surface file references; do not
  hydrate corpora.

## Capability C — Graph recomposition

Build the global integration topology from local boundary contracts.

1. **Collect** `boundary.yaml` from each registered app (GitHub MCP
   `get_file_contents`, or the local copy for this app and any cached peer).
   This is one file per app — cheap. Refresh by the boundary file's SHA (same
   SHA-gated diff idea as `sources/peer-corpus-access`): unchanged → reuse.
2. **Nodes** = registered apps + every `external:<slug>` counterparty seen.
3. **Edges** = join each app's `outbound` to another app's `inbound` per the
   channel conventions in `governance/boundary-contract`:
   - async: `outbound.channel == inbound.channel`.
   - sync: `outbound.to == provider.app_id` **and** normalized channel match.
   - shared-db/file: same `channel`.
   Carry `kind`, `protocol`, both confidences, and the two evidence sets.
4. **Findings** (knowledge, never tasks):
   - **orphan-produced** — a produced channel no app consumes.
   - **unknown-producer** — a consumed channel no registered app produces
     (external or undocumented).
   - **contract-drift** — a caller references a provider operation the provider
     no longer declares.
   - **missing-link** — an `external:<slug>` that matches a registered app_id
     (should be a first-class edge).
5. **Emit** (regenerable artifacts — never hand-edited):
   - `doc/_graph/ecosystem.yaml` — machine-readable nodes/edges/findings.
   - `doc/architecture/ECOSYSTEM.md` — human view + mermaid topology + the
     findings table.

## Canonical identity (single source)

`app_id` is the **one** identity that ties the whole ecosystem together. For any
app it is the same string in all of: the app's `doc/architecture/boundary.yaml`
`app.id`, its row `id` in this registry, and any consuming app's
`app-profile.yaml` peer `app_id`. Local `name` slugs (cache directories) are not
identities. This registry is the authority: resolve an app's `app_id` from its
boundary `app.id` when present; only fall back to a repo-derived slug with
`app_id_provisional: true` until the app sets its own. Aliases capture historical
or alternate ids so renames don't break joins.

## `doc/_meta/ecosystem-map.yaml` (the registry)

```yaml
version: 1
org: acme                      # org/owner scanned (or a list)
last_scan: 2026-06-03
apps:
  - id: order-service          # canonical app_id (join identity) = boundary app.id
    repo: acme/order-service
    owner: acme
    has_pack: true
    has_boundary: true
    boundary_path: doc/architecture/boundary.yaml
    corpus_path: doc
    aliases: []
    app_id_provisional: false  # true when derived from repo name, not set by the app
    last_seen: 2026-06-03
```

## Promotion (discovery → declaration → retrieval)

Discovery is the funnel; it does not commit. When a discovered peer is durably
useful, hand back to the operator to **promote** it:

1. Operator confirms → `foundations/multi-repo-workspace-detection` declares it
   in `app-profile.yaml` with consent (`read_external_corpus`).
2. `sources/peer-corpus-access` then retrieves it (sparse clone / GitHub MCP)
   with the SHA-gated freshness diff.

Never skip straight from discovery to caching a full corpus without declaration
and consent.

## Durable updates

- `doc/_meta/ecosystem-map.yaml` — upserted apps, `last_scan`, skipped repos.
- `doc/_graph/ecosystem.yaml` + `doc/architecture/ECOSYSTEM.md` — regenerated.
- `doc/mcp/github.md` — verified org, `search_code` limits/quirks (per
  `sources/mcp-data-reading § Post-session capitalization`).
- `doc/_meta/source-coverage.yaml` — historical evidence and freshness for the GitHub-backed scan.
- `doc/_meta/blocking-questions.md` — token scope gaps, unreadable repos.

## Anti-patterns

- Auto-declaring discovered peers, or caching a full corpus without operator
  consent. Discovery proposes; the operator promotes.
- Framing findings (orphan event, drift) as work to dispatch. They are captured
  knowledge — corpus scope discipline applies.
- Unbounded org-wide `search_code`, or silently truncating results. Bound and
  log every cap.
- Inferring a repo exists when the token cannot read it. The token scope is the
  boundary; surface the gap.
- Hand-editing `ecosystem.yaml` / `ECOSYSTEM.md` — they are regenerated from the
  registry + boundary contracts.
- Joining on non-normalized channels. Recomposition trusts the
  `governance/boundary-contract` channel conventions; a mismatch is a finding,
  not something to paper over.
