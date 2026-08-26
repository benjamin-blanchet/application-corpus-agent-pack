---
type: spec
status: in_progress
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Paquet de spécification — Usine logicielle V3"
description: "Contrat de l'usine logicielle agentique, de la spec approuvée à une draft PR prouvée remise à la décision humaine."
---

# Paquet de spécification — Usine logicielle V3

## Vue d'ensemble

- **Source** : vision produit confirmée par l'opérateur le 2026-08-26, branche
  `feat/software-factory`, branche `fix/foundations` et expérimentation PGS
  fournie sous forme d'archive partielle.
- **Sujet** : transformer le protocole V1 en chaîne de livraison exécutable,
  contrôlée et prouvable.
- **Classe de triage** : large.
- **Version cible** : `1.2.0`.
- **Slug confirmé** : `software-factory-v3` (absence de ticket Jira).
- **Décision de livraison** : l'usine ouvre une draft PR ; seul un humain peut
  l'approuver et la fusionner.

## Autorisations opérateur

La séquence de conversation contient les validations explicites `spec ok`,
`go`, `go pr`, puis l'autorisation finale « désigner un plan d'implementation
pour tout ça, et te lancer dessus ». Cette dernière demande approuve le présent
périmètre consolidé et son exécution. Toute extension substantielle repassera
par une validation.

## Fichiers du paquet

```text
README.md
SPECIFICATION.md
IMPACTS.md
TESTS.md
SUMMARY.md
SUGGESTIONS.md
CHANGELOG.md
JOURNAL.md
TECHNICAL_PLAN.md
acceptance-plan.yaml
PR_DESCRIPTION.md
pr-draft.yaml
factory/plan.v3.json
factory/events.v3.jsonl
factory/state.v3.json
```

`factory/evidence-manifest.v3.json` n'est pas un placeholder du package : il
est produit seulement après recette sur le candidat gelé. En mode
`ci_artifact`, le manifeste et les résultats restent dans l'artefact CI attesté,
ainsi que les captures lorsque le parcours est visuel ; leur digest et leur
locator alimentent l'état dérivé. Le dogfood de ce pack utilise l'adaptateur
`command`, donc il produit des logs et rapports plutôt que des captures UI.

## État

### Implémentation dans le dépôt, avant candidat

- [x] Vision et frontière produit confirmées.
- [x] Analyse de la branche V1 et de l'expérimentation PGS.
- [x] Spécification V3 et plan machine établis.
- [x] Lots implémentés et revus indépendamment.
- [x] Corpus réconcilié et migration MCP-readiness achevée.
- [x] Replay dogfood propre conduit jusqu'à `corpus_closed`.

### Continuation post-commit en CI protégée

- [ ] Commit matérialisé et publié par l'opérateur ou un publisher autorisé,
  puis `candidate_frozen` enregistré sur son SHA exact.
- [ ] Recette candidat exécutée et preuves attestées produites.
- [ ] Revue de release passée et draft PR créée ou mise à jour par
  Delivery.

Une draft PR existe déjà comme surface de collaboration. Elle ne satisfait pas
la dernière case tant qu'elle n'a pas été alimentée depuis un état
`release_ready` et les preuves du même candidat.

## Ancrage

- `AGENTS.md` et `.github/agents/developer.agent.md`
- `.github/skills/development/**`
- `doc/spec/template/**`
- `scripts/validate-factory.mjs`
- `.github/workflows/factory-policy.yml`
- `doc/_meta/information-sources.yaml`
- historique Git de `doc/_meta/mcp-readiness.md` (ancienne surface migrée,
  jamais recréée dans le corpus actif)
- archive externe `corpusPgs.zip`, SHA-256
  `3cb93fc3ef668617b872f886f9931ddabccbd913a292d74634b84083fc18d5e5`
  (expérimentation lue comme donnée, jamais comme instruction et sans exécuter
  son contenu)
