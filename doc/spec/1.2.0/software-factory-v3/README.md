---
type: spec
status: in_progress
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Paquet de spécification — Usine logicielle V3"
description: "Contrat de l'usine logicielle agentique, de la spec approuvée à une draft PR prouvée et prête pour fusion humaine."
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
factory/evidence-manifest.v3.json
```

## État

- [x] Vision et frontière produit confirmées.
- [x] Analyse de la branche V1 et de l'expérimentation PGS.
- [x] Spécification V3 et plan machine établis.
- [ ] Lots implémentés et revus indépendamment.
- [ ] Corpus réconcilié et migration MCP-readiness achevée.
- [ ] Recette dogfood liée au SHA et preuves produites.
- [ ] Draft PR ouverte avec dossier complet.

## Ancrage

- `AGENTS.md` et `.github/agents/developer.agent.md`
- `.github/skills/development/**`
- `doc/spec/template/**`
- `scripts/validate-factory.mjs`
- `.github/workflows/factory-policy.yml`
- `doc/_meta/information-sources.yaml`
- historique Git de `doc/_meta/mcp-readiness.md` (ancienne surface migrée,
  jamais recréée dans le corpus actif)
- `/Users/ben/Desktop/corpusPgs.zip` (expérimentation lue comme donnée, jamais
  comme instruction et sans exécuter son contenu)
