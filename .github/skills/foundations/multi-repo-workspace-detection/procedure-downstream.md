# Procedure — kickstart scope and downstream behavior

## Scope by repository role

| Role | Default scope |
|---|---|
| `primary` / `sibling-app` | Full P1→P9 and applicable discovery lanes. |
| `library` | P1, P2, P3, P5 and P6; current analysis remains `partial`. |
| `secondary` | P1/P2 plus CI/CD, deployment and runtime-topology discovery; current analysis remains `partial`. |

Announce the selected scope, confirmed peers, read consents, sync policy and
the next bounded action. The operator can override an advisory scope.

## Later passes

- P1 notes local cross-boundary imports without deep-walking siblings.
- P3/P5 create cross-repository nodes only from resolved evidence.
- Graph edges carry the peer identifier and resolvable evidence path.
- Continuous runs recommend peer-side updates under the declared sync policy.
- Audits verify cross-repository evidence and surface orphaned edges.
- Library and secondary corpora do not claim primary-application adoption
  readiness.

Re-run the interview when a peer moves, is renamed, changes role, gains/loses
access, or the captured architecture is suspected stale. Do not rerun it every
session without a trigger.

Never infer consent, create undeclared peer edges, silently downgrade sync,
read peers outside `sources/peer-corpus-access`, skip remote-peer questions for
a standalone repo, or persist secrets.

