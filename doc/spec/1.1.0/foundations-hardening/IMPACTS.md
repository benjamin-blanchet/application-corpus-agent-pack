---
type: spec
status: complete
confidence: confirmed
source: code
last_validated: 2026-08-26
title: "Impacts — Durcissement des fondations"
description: "Surface de changement et analyse de risques de la release foundations-hardening."
---

# Impacts — Durcissement des fondations

## Modules et fichiers touchés

| Zone | Fichiers | Type de changement |
|---|---|---|
| Identité de release | `package.json`, `PACK_VERSION`, modèle de corpus-state, scaffold de migration sous `schemas/`, exemples de version | réconcilier |
| Moteur de synchronisation | `scripts/lib/upgrade-core.mjs`, commentaires CLI/update | modifier |
| Lecture de texte | helper partagé, sept consommateurs de frontmatter et recompute pour l’état YAML | ajouter/modifier |
| Suite de non-régression | `scripts/test-pack.mjs` et, si plus lisible, runner ciblé | étendre |
| Contrat d’upgrade | skill pack-upgrade, `AGENTS.md`, guide d’installation, guide opérateur, démo | réconcilier |
| Contrat de recalcul | skill corpus-run et persona Corpus | réconcilier |
| Paquet de spécification | `doc/spec/1.1.0/foundations-hardening/**` | ajouter/mettre à jour |

## API et contrats

- Les commandes CLI restent `sync`, `sync --apply` et
  `sync --apply --force`.
- Changement observable : `sync` n’écrit plus de métadonnées d’état, de
  changelog ou de rapport dans un corpus existant ; il affiche le plan de copie
  et l’action de migration suivante.
- La version du pack passe de `1.0.0` à `1.1.0`.
- La lecture du frontmatter devient uniformément tolérante à BOM/CRLF.
- La propriété des champs recalculés ne change pas dans le code ; sa
  documentation est remise en cohérence avec l’allowlist existante.

## Base de données / migrations

- N/A — aucune base ni migration de données applicatives.
- La migration du schéma du corpus reste agentique après la synchronisation.

## Batchs / asynchrone

- N/A — aucun job runtime ni contrat de message.

## Intégrations

- N/A — aucun appel externe ajouté ; le téléchargement GitHub reste inchangé.

## Zones de régression

| Zone | Détection / preuve | Mitigation |
|---|---|---|
| Installation initiale | `runUpgrade()` traite les fichiers cible absents | fixture vérifiant le squelette copié et sa version |
| Upgrade d’un corpus existant | `stampState()` et rapport sont aujourd’hui appelés par `upgrade-core.mjs` | snapshot octet par octet de tout `doc/` préexistant, avec/sans `--force` et avec état présent/absent ; scaffold livré et rapport final validé |
| Agents personnalisés localement | bucket de confirmation dans `upgrade-core.mjs` | conserver le scénario de préservation existant |
| Consommateurs de frontmatter | sept lectures strictes trouvées par recherche de code | fixtures LF/CRLF/BOM par consommateur, dont non-duplication du frontmatter |
| Recalcul d’état | inventaires ajoutés dans `recompute-corpus-state.mjs` | matrice dossier/fichier/imbriqué/fallback, dry-run/apply/idempotence et clés non possédées |
| Runtime Node 18 | fin de processus du validateur et gros JSON pipé | exécution réelle sous Node 18, vérification du drainage stdout et parsing JSON |
| Publication du pack | `package.json`, `.npmignore`, bin npm | `npm pack --dry-run --json` et contrôle de l’existence des scripts directs |
| Procédure opérateur | cinq surfaces documentaires du contrat d’installation/upgrade divergent aujourd’hui | lecture croisée et recherche interdisant les instructions obsolètes |

## Risque de qualité du code

- La duplication des parseurs peut réapparaître — action : une seule primitive
  de normalisation, chaque consommateur gardant son parsing métier.
- Le moteur d’upgrade mélange copie et migration — action : retirer la mutation
  du corpus du moteur de copie au lieu d’ajouter un nouveau mode.
- Le runner de tests peut devenir monolithique — action : garder des helpers de
  fixtures réutilisables et séparer un runner ciblé seulement si plus lisible.
- Le script de recalcul et sa documentation peuvent diverger — action : test de
  contrat et réconciliation conjointe du skill et de la persona.

## Impact de performance

- Chemin chaud : aucun ; utilitaires CLI/build lancés par l’opérateur.
- Requête, appel externe et concurrence : inchangés.
- Mémoire : normalisation bornée par la taille du texte fourni.
- Budget large : médiane de cinq exécutions sur 10 MiB ≤ 250 ms après trois
  échauffements ; hausse du heap utilisé ≤ 32 MiB ; aucun parcours disque
  supplémentaire.
- Méthode : micro-benchmark déterministe du helper partagé, sur le runtime du
  workspace et sous Node 18, documenté dans `TESTS.md`.

## Risque production

- Bug de production connu touché : aucun.
- Risque structurel : la synchronisation peut perdre la provenance de migration
  si elle estampille trop tôt ; ce changement retire ce comportement.
- Rejeu d’incident : N/A.

## Impact inter-dépôts

Section omise car `application.multi_repo.status` vaut `not_started`, et non
`declared`, dans `doc/_meta/app-profile.yaml`.
