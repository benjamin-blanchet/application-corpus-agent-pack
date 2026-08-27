---
type: meta
status: active
confidence: confirmed
source: pack
last_validated:
title: "Corpus Validation Checklist"
---

# Corpus Validation Checklist

- [ ] `doc/README.md` exists.
- [ ] `doc/CORPUS_MAP.md` exists.
- [ ] `doc/CORPUS_MANIFEST.md` exists.
- [ ] `doc/_meta/app-profile.yaml` is filled from evidence.
- [ ] `doc/_meta/source-inventory.md` lists inspected sources.
- [ ] `doc/_indexes/` files point to existing corpus paths.
- [ ] Feature folders use the standard six-file model when applicable.
- [ ] Prod knowledge uses atomic files.
- [ ] No obsolete paths such as `doc/_meta` or `doc/_indexes` remain.
- [ ] Open questions are explicit rather than hidden in prose.
- [ ] `node scripts/validate-corpus.mjs` has been run after the latest significant corpus update.
- [ ] P0 validator findings are fixed.
- [ ] P1 validator findings are fixed or recorded in `doc/_meta/update-candidates.md`.
- [ ] Unknown metadata values are reflected in `doc/_meta/open-questions.md`.
- [ ] No secrets, tokens or credentials are present in corpus files.
- [ ] `doc/_meta/kickstart-progress.md` reflects the latest kickstart phase.
- [ ] Significant kickstart sessions have synthetic notes under `doc/_meta/interaction-history/`.
- [ ] Source contracts contain no point-in-time runtime state and `source-coverage.yaml` contains historical evidence only.
- [ ] `doc/_meta/mcp-source-wizard.md` has been reviewed early in kickstart.
- [ ] Required connected-source capabilities are probed in the current run without persisting global availability.
- [ ] `Corpus` kickstart responses end with a status footer showing completeness by sector.
- [ ] `doc/_meta/discovery-coverage.md` records repo/Jira/Confluence/Dynatrace/custom source coverage.
- [ ] `doc/project/cicd/PIPELINES.md` distinguishes active, likely active, stale, legacy and unknown pipeline definitions.
- [ ] `doc/project/cicd/RECENT_ACTIVITY.md` records recent commit hotspots when Git history is locally available.
- [ ] Kickstart is not marked complete unless repository coverage is at least `covered` and expected sources are covered, partial, blocked or not applicable with reasons.
- [ ] `doc/_meta/blocking-questions.md` is used for answerable blockers before parking them in open questions.
- [ ] `doc/_meta/deep-analysis-plan.md` is updated for serious/full kickstarts.
- [ ] Important feature folders are not mostly stubs unless the reason is recorded.
- [ ] `doc/_roadmap/CORPUS_ROADMAP.yaml` has an active node and interest scores with justification.
- [ ] `doc/_roadmap/NEXT_BEST_ACTIONS.md` reflects the latest useful next run.
- [ ] `doc/_graph/nodes.yaml`, `doc/_graph/edges.yaml` and `doc/_graph/evidence.yaml` are updated after significant discoveries.
- [ ] `doc/_runs/RUN_LEDGER.md` records continuous enrichment runs.
- [ ] `governance/post-kickstart-completeness-audit` has been run before any "kickstart complete", `maturity_level: 4`, `adoption_ready` or broad team-use claim.
- [ ] Generated knowledge is exposed through indexes: APIs, batches, components, technical components, screens, use cases, business entities, production signals and project signals are not left as header-only skeletons when evidence exists.
- [ ] `doc/_meta/coverage-matrix.md`, `doc/_meta/repository-map.yaml` and `doc/_meta/source-inventory.md` were refreshed after P1 -> P9 and source discovery.
