# Procedure — detect and interview

## Mandatory reads and probes

Read `doc/_meta/app-profile.yaml`, `doc/_meta/corpus-state.yaml`, the current
repository root/remotes, sibling directories and any parent
`*.code-workspace` file.

Run evidence signals in this order:

1. Detect monorepo markers (`workspaces`, pnpm, Nx, Turbo, Lerna, Rush, one
   root Git repository). If confirmed, record `monorepo`; do not classify its
   packages as sibling repositories.
2. List sibling directories with their own Git roots.
3. Parse workspace folder declarations.
4. Search for imports or configuration paths that cross the repo boundary.
5. Treat common repository-name patterns only as weak evidence.
6. Ask about useful remote peer corpora that cannot be inferred locally.

## Operator interview

Use `governance/blocking-question-loop`. Show the repository, detected
siblings and cross-repo references, then ask whether this is a multi-repo
application (`yes`, `no`, `unsure`).

For a confirmed multi-repo application, capture this repository's role, each
confirmed sibling's role/path/consumed surfaces/pack state, read consent and a
sync policy (`manual`, `agent-suggested`, or supported `agent-driven`).

Always ask separately about remote Git peer corpora, even for a standalone or
monorepo repository. For each confirmed peer capture:

- local slug and canonical `app_id` when known;
- Git URL, ref, host and optional owner/repo mapping;
- access preference: `auto`, `workspace`, `github-mcp` or `clone`;
- relation, consumed surfaces, corpus path and pack state;
- refresh policy: `on-demand`, `each-session` or `manual`;
- explicit read consent when the organization is unfamiliar.

For a large ecosystem, use `sources/ecosystem-corpus-discovery` to find
candidates, but promote a peer only after operator confirmation. Never silently
default `unsure` to standalone.

