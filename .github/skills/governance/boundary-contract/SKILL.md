---
name: boundary-contract
category: governance
description: "Own the sanctuarized inbound/outbound integration contract (doc/architecture/boundary.yaml): its schema, channel-normalization conventions, and two-tier validation. Use when populating or reconciling the application's integration surface (P3/P5 output) or before ecosystem-graph recomposition. Code-derived; never overrides this app's code."
---
# Boundary Contract

## Purpose

The **boundary contract** is the sanctuarized, machine-readable description of
everything that crosses this application's boundary — what enters it and what
it reaches out to. It lives at **`doc/architecture/boundary.yaml`** and is the
**single source of truth** for the integration surface.

It is *sanctuarized*: a central, required, strictly-validated artifact. Every
other integration view derives from it or reconciles against it — never the
reverse:

| Artifact | Relationship to the contract |
|---|---|
| `doc/architecture/BOUNDARY.md` + mermaid | **Derived view**, regenerated — never hand-edited. |
| `doc/project/architecture/INTEGRATION_MAP.md`, `.../diagrams/integration-*`, `.../services/MESSAGING.md` | Human prose/diagrams — must agree with the contract. |
| `doc/_indexes/by-api.md` | A **view** over inbound sync edges. |
| `doc/prod/SERVICE_FLOWS.md` | Runtime-observed flows scoped to an environment, deployed revision and time; reconcile drift against the implementation contract. |
| `doc/_meta/app-profile.yaml` `external_systems` / `data_stores` | Counterparties referenced by edges. |

**Why it exists:** if every app in the ecosystem declares its boundary in the
same strict schema with normalized channel keys, a global topology graph
**recomposes itself** by joining one app's `outbound` to another's `inbound`.
That join is only as good as the convention — hence "maxi convention and
validation". Recomposition itself is `sources/ecosystem-corpus-discovery`.

## When to use

- During **P3** (feature candidates / APIs) and **P5** (cross-cutting
  extraction): the contract is a **first-class code-derived output** of these
  passes. Exposed/called APIs land as edges in P3; events, datastores, external
  systems, file exchanges in P5.
- Whenever an integration is discovered, changed, or removed (continuous runs).
- Before `sources/ecosystem-corpus-discovery` recomposes the ecosystem graph
  (the contract is its scan target).
- When reconciling `doc/prod/SERVICE_FLOWS.md` (runtime) against code.

This skill never modifies application source code (corpus write surface only).

## Mandatory reads

1. `doc/architecture/boundary.yaml` (current state; ships as a skeleton).
2. `schemas/boundary.yaml.schema.yaml` (the strict shape).
3. `doc/_meta/app-profile.yaml` (`external_systems`, `data_stores`, peers).
4. `doc/_meta/ecosystem-map.yaml` if present (canonical app ids to reference).
5. `doc/_indexes/by-api.md`, `doc/prod/SERVICE_FLOWS.md` (views to reconcile).

## The schema (source of truth: `schemas/boundary.yaml.schema.yaml`)

```yaml
version: 1
app:
  id: order-service          # canonical ecosystem app_id (kebab slug) — THE join identity.
  name: Order Service        # must match doc/_meta/ecosystem-map.yaml when registered.
  repo: acme/order-service   # owner/name
interfaces:
  inbound:
    - id: in-rest-create-order        # stable slug, unique within the file
      kind: sync-api                  # sync-api | async-consume | webhook | file-ingest
      protocol: rest                  # rest|grpc|graphql|soap|kafka|amqp|sqs|pubsub|webhook|sftp|s3|jdbc|other
      channel: "POST /v1/orders"      # NORMALIZED join key (see § Channel conventions)
      from: [external:web-bff]        # counterparties: app_id | external:<slug> | any | unknown
      entities: [Order]
      criticality: high               # critical | high | medium | low
      confidence: confirmed           # suspected | probable | confirmed | unknown
      source: code                    # code | prod | jira | confluence | human | mixed | unknown
      evidence: ["src/api/orders.controller.ts:42"]
      # version / schema_ref: optional, reserved (not yet validated)
  outbound:
    - id: out-evt-order-created
      kind: async-produce             # sync-call | async-produce | db-write | file-export | notification
      protocol: kafka
      channel: "orders.created"
      to: [billing-service, shipping-service]
      entities: [Order]
      criticality: high
      confidence: confirmed
      source: code
      evidence: ["src/events/order.publisher.ts:88"]
```

**Scope = boundary-crossing only.** Exposed/called service APIs, produced/
consumed async messages, shared datastores, external SaaS, file exchanges.
Purely-internal calls, internal batches and UI screens are **out of scope** —
they belong to features/screens/batches, not the boundary contract.

## Channel conventions (the join keys)

The graph recomposes by matching channels across apps, so the channel string
**must be normalized identically on both sides**:

| Class | `channel` format | Cross-app join |
|---|---|---|
| async (`kafka`/`amqp`/`sqs`/`pubsub`) | physical topic/queue/exchange name verbatim, e.g. `orders.created`; prefix `cluster:` only to disambiguate multiple brokers (`kafka-prod:orders.created`) | `outbound.channel == inbound.channel` (direct) |
| sync (`rest`/`grpc`/`graphql`/`soap`) | `METHOD /version/path/{param}` — uppercase method, path params as `{name}`, version segment kept | caller `outbound.to == provider.app.id` **and** channel match |
| shared datastore (`jdbc`/db) | `store_id:schema.table` where `store_id` matches an `app-profile` data store | same `store_id:schema.table` |
| file (`sftp`/`s3`) | `sftp:/path/glob` or `s3:bucket/prefix` | same channel |
| notification | `email:<template>` / `sms:<id>` — usually `to: external:<provider>` | n/a (terminal) |

Same physical channel must yield the same string in every app's contract.
Async edges join almost for free; sync edges need the provider `app_id` plus a
normalized path; a path that drifts between caller and provider is a
recomposition finding, not a silent mismatch.

## Counterparty & identity rules

- `app.id` is a stable kebab slug, **the single canonical identity** for this
  application across the whole pack. The same value appears in three places and
  must never diverge: this file's `app.id`, the `doc/_meta/ecosystem-map.yaml`
  registry `id`, and any `app_id` by which a *consuming* app's
  `app-profile.yaml` peer entry references this one. `name` fields (e.g. the
  peer's `.corpus-cache/` slug) are local conveniences — `app.id` is the join key.
- When an ecosystem registry exists (`doc/_meta/ecosystem-map.yaml`), `app.id`
  and every counterparty `app_id` in `to`/`from` **must** be registered there.
- Use `external:<slug>` for systems outside the pack ecosystem (SaaS, legacy).
- Use `any` when the caller set is open (public API), `unknown` when undetermined
  (record a blocking question rather than guessing a counterparty).

## Population (code-derived)

1. Detect the actual stack; never assume a framework. Find exposed endpoints
   (controllers/routes/handlers), clients/SDK calls, message producers/
   consumers, datastore access, file I/O, external base URLs.
2. Emit one edge per boundary crossing with `confidence`/`source`/`evidence`
   per `foundations/core-rules`. `confidence: confirmed` requires `source:
   code` (or runtime config / prod). Confluence/Jira-only → `probable` at most.
3. Normalize each `channel` per the table above.
4. Resolve counterparties to `app_id` (registry) / `external:` / `any` /
   `unknown`. Never invent a counterparty.
5. Regenerate `BOUNDARY.md` + the mermaid view from the YAML. Never hand-edit
   the derived view.
6. Reconcile: update `by-api.md`, `INTEGRATION_MAP.md`, diagrams and (when
   runtime evidence exists) `SERVICE_FLOWS.md`. No append-only — when an
   integration changes, update the contract and its views together.

## Validation (two tiers)

**Local tier — `scripts/validate-corpus.mjs § checkBoundaryContract` (this
repo only):**

- `boundary.yaml` present and parseable; `app.id` populated once P5 is covered.
  **Role exemption:** `library`/`secondary` repos (which scope P5 down or out and
  ship no boundary contract of their own) are never flagged `boundary-not-populated`.
- Every edge has `id`, `kind`, `channel` (structural — P0 if missing) and
  `confidence`, `source` (P1 if missing).
- `kind`/`protocol`/`criticality`/`confidence`/`source` within their enums.
- `confidence: confirmed` ⇒ `source` ∈ {code, prod, mixed}, and `evidence`
  present (and resolvable for `source: code`).
- Counterparties resolve to the ecosystem registry / `external:` / `any` /
  `unknown` when the registry exists.
- Inbound `sync-api` edges should appear in `by-api.md` (view consistency).

**Recomposition tier — `sources/ecosystem-corpus-discovery` (cross-app, not in
the local linter):** produces **knowledge findings**, not lint errors:

- a produced channel no app consumes (orphan event) / a consumed channel no app
  produces (unknown producer);
- a caller referencing a provider operation the provider no longer declares
  (contract drift);
- an `external:*` counterparty that is actually a registered ecosystem app
  (missing link).

Per corpus scope discipline, these are **captured as knowledge**, never framed
as tasks to dispatch.

## Anti-patterns

- Hand-editing `BOUNDARY.md` or the diagrams instead of regenerating them from
  `boundary.yaml`.
- Recording internal calls / UI / internal batches as boundary edges.
- Inventing a counterparty `app_id`; use `unknown` + a blocking question.
- Non-normalized channels (raw concrete path with ids, broker-specific casing)
  that won't join across apps.
- `confidence: confirmed` from Confluence/Jira alone.
- Silently replacing the implementation contract with `SERVICE_FLOWS.md`.
  Preserve runtime observations with environment/revision/time and reconcile
  deployment or configuration drift explicitly.
- Duplicating boundary facts in prose without updating the contract (append-only
  drift).
