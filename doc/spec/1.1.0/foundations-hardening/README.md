---
type: spec
status: complete
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Durcissement des fondations"
description: "Paquet de spécification pour fiabiliser la version, la frontière synchronisation/migration, le frontmatter et le recalcul d’état."
---

# Paquet de spécification — Durcissement des fondations

## Vue d’ensemble

- **Ticket / source** : interne — périmètre confirmé par l’opérateur pendant la session du 2026-08-26
- **Sujet** : durcissement des fondations
- **Classe de triage** : large
- **Responsable développement** : Codex
- **Responsables validation** : opérateur et relecture indépendante de l’implémentation
- **Version / release cible** : `1.1.0`
- **Jira fixVersion (brut)** : absent — version `1.1.0` confirmée par l’opérateur
- **Langue des livrables d’équipe** : français, selon `application.language_policy.team_outputs`

## Liens

- Jira : N/A
- Confluence : N/A
- Spécifications liées : aucune
- Dossiers fonctionnels liés : aucun — ce changement porte sur le pack lui-même
- Connaissance de production liée : aucune

## Suivi

- [x] Spécification validée par l’opérateur (étape 5b)
- [x] Plan d’implémentation validé (étape 7)
- [x] Changements du pack implémentés
- [x] Vérifications réussies (`TESTS.md` complété avec les résultats)
- [x] Documentation du pack et du corpus réconciliée
- [x] Constats hors périmètre conservés dans `SUGGESTIONS.md`
- [x] Description de PR produite (étape 11)
- [ ] PR ouverte par l’opérateur

## Fichiers du paquet

```text
README.md
SPECIFICATION.md
IMPACTS.md
TESTS.md
SUMMARY.md
SUGGESTIONS.md
CHANGELOG.md
```

## Ancrage dans le corpus

- `AGENTS.md`
- `doc/CORPUS_MAP.md`
- `doc/CORPUS_MANIFEST.md`
- `doc/_agents/pack-upgrade.md`
- `.github/skills/governance/pack-upgrade/SKILL.md`
- `.github/skills/continuous/corpus-run/SKILL.md`
- `.github/agents/corpus.agent.md`
- `docs/installation.md`

Les preuves d’implémentation principales sont le code actuel de
`fix/foundations` dans `package.json`, `PACK_VERSION`,
`scripts/lib/upgrade-core.mjs`, les consommateurs de frontmatter sous
`scripts/` et `scripts/recompute-corpus-state.mjs`.
