---
type: spec
status: approved
confidence: confirmed
source: code
last_validated: 2026-08-26
title: "Impacts — Usine logicielle V3"
description: "Surface, compatibilité et risques de l'implémentation V3."
---

# Impacts — Usine logicielle V3

## Surface prévue

| Zone | Nature du changement |
|---|---|
| `scripts/lib/factory/**` | automate, reducer, scheduler, chemins, digests et contrats purs |
| `scripts/factory-controller.mjs` | CLI mécanique du run |
| `scripts/validate-factory.mjs` | validation V3 et compatibilité/migration V1 |
| `schemas/factory/**` | contrats d'événement, plan, work package, review, source, environnement, recette et preuve |
| `doc/spec/template/**` | package V3 dogfoodable |
| `.github/templates/software-factory/**` | contrats d'adoption et adaptateur Playwright/GitHub |
| `.github/agents/**`, `.github/skills/development/**` | responsabilités, gates, capacités et handoffs |
| `.github/skills/sources/**` | source durable + probe runtime, suppression de readiness persistée |
| `doc/_meta/**`, `doc/mcp/**`, dashboard | migration des statuts MCP globaux |
| `.github/workflows/**` | policy complète, preuves CI et draft PR bornée |
| `package.json`, `PACK_VERSION`, docs | release 1.2.0 et commandes supportées |

## Compatibilité

- Les specs sans artefacts factory restent valides.
- Un package V1 est lu en mode compatibilité et reçoit des findings précis ;
  aucune migration automatique ne fabrique d'approbations ou de preuves.
- Les consommateurs de `information-sources.yaml` migrent vers les contrats de
  source. Les champs runtime historiques sont supprimés, pas copiés ailleurs.
- Les adaptateurs GitHub et Playwright sont optionnels ; le cœur reste utilisable
  dans une application non web ou un autre forge provider.

## Risques principaux

| Risque | Prévention / preuve |
|---|---|
| Deux sources de vérité état/journal | reducer déterministe + digest de projection + fixture de tampering |
| Scheduler accepte un lot prématuré | fonction pure + fixture PGS LOT-1/LOT-3 |
| Gate verte après nouveau commit | graphe d'invalidation + fixture release-ready obsolète |
| Collision de chemins non exacte | normalisation et test parent/enfant/glob |
| Modèle léger sur tâche à fort impact | règles de profil basées sur risque et contrôle |
| Agent pousse malgré le prompt | capability contract vérifié par le contrôleur |
| Faux résultat de recette | états fermés + erreur utilisateur impossible à mapper sur PASS |
| Preuves non reproductibles | manifest + SHA/dataset/build/checksums |
| MCP local présenté comme vérité globale | suppression du stockage de readiness + validator anti-régression |
| Pack spécifique à PGS | fixtures généralisées, aucun secret/nom client/endpoint PGS dans les templates |
| Workflow GitHub trop permissif | permissions minimales, draft uniquement, aucune capacité merge/deploy |
| Corpus append-only | closeout et consistency gate mécaniques |

## Sécurité et données

- Les événements et preuves sont soumis à une classification et une politique
  de redaction ; aucun token, cookie, profil navigateur ou PII brute.
- Les mutations de données sont `deny` par défaut et requièrent capacité,
  environnement autorisé, stratégie de cleanup et approbation si risquées.
- La PR automatique utilise une identité de delivery limitée à la branche et à
  `pull-requests: write`; les workflows de validation restent read-only.

## Performance

Le reducer et le scheduler travaillent sur les métadonnées du run, pas sur le
code. Pour 1 000 événements et 200 lots, le recalcul local doit rester sous
500 ms et 64 MiB de heap sur le runtime de référence après échauffement. Ce
budget est un garde-fou, pas un chemin de production temps réel.
