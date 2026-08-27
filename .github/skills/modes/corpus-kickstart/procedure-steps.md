# Procedure — kickstart steps 0 → 11

Loaded by `modes/corpus-kickstart` on every kickstart run. Kickstart is
**resumable, not restartable**.

## Step 0 — State verification (always run, never skipped)

Before any write:

1. Read `doc/_meta/corpus-state.yaml` and `doc/_meta/code-pipeline-state.yaml`.
2. Determine the current adoption stage and the highest covered pass (P1–P9).
3. Determine the current coverage status of each lane (repository, Jira, Confluence, Dynatrace, custom) from `doc/_meta/discovery-coverage.md`.
4. Read `doc/_meta/blocking-questions.md`. If active questions exist, surface them before continuing.
5. Produce a **resume report** to the operator:

```text
Corpus resume
- Adoption stage: <0–5> <label>
- Code analysis pipeline: P1=<status> P2=<status> ... P9=<status>
- Repository coverage: <status>
- Jira coverage: <status>
- Confluence coverage: <status>
- Dynatrace coverage: <status>
- Custom sources: <status>
- Actionable readiness: <status>
- Active blocking questions: <count> (list ids)
- Next bounded action: <single sentence>
```

6. Wait for the operator to confirm or redirect, OR proceed with the next
   bounded action if the request is unambiguous (e.g. "continue").

## Step 1 — Verify pack structure

Confirm that the expected pack files exist (`.github/skills/`,
`scripts/validate-corpus.mjs`, `doc/CORPUS_MAP.md`, etc.). If anything is
missing, stop and report.

## Step 2 — Initialize / refresh meta files

If they do not exist or are stale:

- `doc/_meta/kickstart-progress.md` (operator cockpit) via `governance/corpus-interaction-history`
- `doc/_meta/discovery-coverage.md` via `governance/discovery-coverage-contract`
- `doc/_meta/code-pipeline-state.yaml` (all 9 passes set to `not_started` if absent)
- The active interaction history session under `doc/_meta/interaction-history/`
- `doc/_roadmap/*` via `continuous/roadmap-graph`
- `doc/_graph/*` via `continuous/roadmap-graph`
- `doc/_runs/*` via `continuous/corpus-run`

## Step 2 bis — Multi-repo workspace detection (before Step 3)

Run `foundations/multi-repo-workspace-detection`. Must execute **before**
repository role is set — role is itself a multi-repo concept. Detail in
`procedure-multi-repo.md`.

## Step 3 — Detect repository role and initial profile

When `application.multi_repo.status == declared`, take the role from
`application.multi_repo.role` — the interview is authoritative. Otherwise
detect from evidence. Fill `doc/_meta/app-profile.yaml` with evidence-backed
fields only. Use `unknown` rather than guessing.

The kickstart scope of P1→P9 and downstream lanes depends on `multi_repo.role`:

| `multi_repo.role` | Pipeline scope | Lanes |
|---|---|---|
| `primary` or `standalone` | Full P1→P9 | All lanes per Step 7 |
| `library` | P1, P2, P3, P5, P6 (partial); skip P4, P7–P9 unless requested | Skip prod/Jira/Confluence unless requested |
| `secondary` | P1, P2; skip P3–P9 unless requested | `exploration/ci-cd-activity-discovery`, `exploration/dynatrace-runtime-architecture` if available |
| `sibling-app` | Full P1→P9 (treated as its own primary) | All lanes per Step 7 |

Library and secondary kickstarts honestly land at
`code_analysis_status: partial`. That is correct — do not force `covered`.

## Step 4 — Source contracts + runtime probes

- Run `sources/mcp-source-wizard` early to inventory standard MCP, custom MCP and non-MCP sources.
- Register durable declarations in `doc/_meta/information-sources.yaml` and initialize historical rows in `doc/_meta/source-coverage.yaml`.
- Before consuming Jira, Confluence, Dynatrace or any custom source, run `sources/runtime-source-probe`; keep the point-in-time result in this run only.
- Register custom sources via `sources/information-source-onboarding`.
- If a required source is unusable in this runtime, use `governance/blocking-question-loop` before parking. Never silently fall back or erase older evidence.

## Step 5 — Run the deep code analysis pipeline P1 → P9

Detail in `procedure-pipeline.md`. Mandatory for any primary application
repository. Each pass blocks the next via `doc/_meta/code-pipeline-state.yaml`.

## Step 6 — Refresh indexes

After P3–P5, refresh `doc/_indexes/*.md` from the verified catalogs.
Never put speculative entries in indexes.

## Step 7 — Other discovery lanes

When sources are available:

- **Jira**: cover the contract from `governance/discovery-coverage-contract`. Tie issues to feature slugs from P3. When available, also run `exploration/atlassian-project-trajectory` for cross-project app mentions, blockers, incidents, migration signals.
- **Confluence**: walk the relevant page tree (not snippets) using feature/component names from P3–P5. Apply trust scoring per `exploration/confluence-exploration`. When it differs from code, classify the claims as implementation, runtime, intent or history and preserve revision/environment context.
- **Production observability**: run `exploration/production-discovery`. When Dynatrace is available, also run `exploration/dynatrace-runtime-architecture`. When signals warrant cross-window analysis, run `exploration/production-temporal-correlation`.
- **Project activity and delivery**: run `exploration/project-activity-discovery` if Jira/Git/PR/CI is available, enriched by `exploration/atlassian-project-trajectory`. Run `exploration/ci-cd-activity-discovery` when CI/CD files, local Git history, PR checks or workflow-run evidence are available.

## Step 8 — Maturity progression

Update `doc/_meta/corpus-state.yaml`:

- `maturity_level: 1` — P1–P3 covered
- `maturity_level: 2` — P1–P9 covered
- `maturity_level: 3` — `maturity_level: 2` AND production/project/source discovery covered or explicitly blocked
- `maturity_level: 4` — `actionable/readiness-gate` covered
- `maturity_level: 5` — adoption-guide material generated and reviewed

The roadmap can remain open at every maturity level. Maturity is not corpus
completion.

## Step 9 — Actionable brick readiness

After P1→P9 and source discovery, see `procedure-readiness.md`.

## Step 10 — OKF conformance + Validation

First make the corpus conformant with the Open Knowledge Format (OKF v0.1):
run `node scripts/build-okf-indexes.mjs`. This is deterministic and additive —
it emits the reserved `index.md` listings, backfills the derivable OKF fields
(`title`/`description`/`timestamp`) onto docs that already have frontmatter, and
stamps `okf_version` on the bundle-root index. It never rewrites corpus prose
and never invents a `type`. A freshly kickstarted corpus must ship OKF-conformant.

Then run `governance/post-kickstart-completeness-audit`, then
`node scripts/validate-corpus.mjs`. Fix P0 immediately (including any
`okf-missing-type` / `okf-missing-frontmatter` on concept docs the engine could
not auto-fix). Address P1 before any broad adoption claim. Record P2 hygiene
work in `doc/_meta/update-candidates.md`.

## Step 11 — Handover (only when gates pass)

Do **not** prepare handover/adoption-guide material until the operator
asks for it or an adoption readiness review. When used,
`governance/team-handover` is an adoption-guide generator. It must
present the roadmap state, what is reliable, what is still partial, and
how the team should use the corpus.

## Trusted-baseline quality bar

Kickstart is not a token first pass. For a primary application, every
directory is inventoried, every entry point is classified, every feature is
interviewed when ambiguity remains, and every contradiction is reconciled.
Connected-source coverage is bounded and evidenced; unavailable sources are
reported as `blocked` or `partial`, never silently skipped.

Generated knowledge must also be discoverable: refresh affected indexes,
graph nodes/edges, the coverage matrix, repository map and source inventory
before reporting the kickstart complete. A P1→P9 structural baseline is not
the same as actionable or adoption-ready knowledge; apply
`procedure-readiness.md` before either claim.
