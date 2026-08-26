---
type: spec
status: complete
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Spécification — Durcissement des fondations"
description: "Contrat pour rendre la branche foundations 1.1.0 distribuable, sûre à migrer, portable entre fins de ligne et couverte par des tests de non-régression."
---

# Spécification — Durcissement des fondations

## Contexte

- Déclencheur : revue avant fusion de `origin/fix/foundations` le 2026-08-26.
- Motivation : la branche apporte la tolérance CRLF/BOM, le recalcul d’état,
  des contrôles de preuve P4 et une synchronisation plus sûre, mais elle
  annonce actuellement deux versions du pack, expose une commande npm sans
  cible et permet à `sync` de consommer la version précédente dont la migration
  agentique a besoin pour établir sa provenance.
- Ancrage corpus : `AGENTS.md`, `doc/_agents/pack-upgrade.md`,
  `.github/skills/governance/pack-upgrade/SKILL.md`,
  `.github/skills/continuous/corpus-run/SKILL.md`,
  `.github/agents/corpus.agent.md` et `docs/installation.md`.

## Objectifs

- Rendre la release `1.1.0` cohérente et détectable sur toutes ses surfaces.
- Rendre la frontière synchronisation/migration fidèle au comportement voulu :
  `sync` copie sans écraser le corpus ; la migration Corpus possède l’état
  durable, le changelog et le rapport de migration.
- Faire interpréter LF, CRLF et un BOM initial de façon identique par tous les
  consommateurs de frontmatter du pack, via une primitive partagée sans
  dépendance.
- Ajouter une couverture déterministe du moteur d’upgrade et des nouveaux
  inventaires recalculés de fonctionnalités, API, batchs et écrans.
- Réconcilier toutes les instructions opérateur avec la procédure supportée
  `sync`, puis migration Corpus.
- Réconcilier la documentation de propriété des champs recalculés avec
  l’allowlist effective du script.

## Non-objectifs

- Reconcevoir la branche software factory ou son validateur.
- Implémenter une nouvelle fonctionnalité de vérification des claims : la
  commande npm orpheline est supprimée sans lui inventer un comportement.
- Modifier les sémantiques P3/P4, la politique d’inventaire des candidats de
  fonctionnalités ou la définition exacte d’une citation de code localisée.
- Remplacer tout le parseur YAML ou ajouter une dépendance tierce.
- Publier, taguer, pousser ou ouvrir une pull request automatiquement.

## Périmètre

- Inclus : métadonnées de release ; scripts npm ; moteur de copie d’upgrade ;
  guides d’installation et d’upgrade ; primitive partagée de normalisation ;
  consommateurs stricts identifiés dans `scripts/validate-corpus.mjs`,
  `scripts/lib/okf.mjs`, `scripts/corpus-load.mjs`,
  `scripts/build-corpus-site.mjs`, `scripts/clean-after-init.mjs`,
  `scripts/add-skill-frontmatter.mjs` et `scripts/estimate-token-cost.mjs` ;
  lecture portable de `corpus-state.yaml` par
  `scripts/recompute-corpus-state.mjs` ;
  tests de synchronisation, de recalcul et de portabilité LF/CRLF/BOM ;
  réconciliation de la documentation directement affectée.
- Exclus : workflow factory, politique P3/P4, refonte du dashboard, constats
  de validation sans rapport avec ce changement et nettoyage opportuniste du
  pack.

## Règles touchées

- Un `doc/**` existant n’est jamais écrasé par `sync` — sources :
  `scripts/lib/upgrade-core.mjs` et `doc/_agents/pack-upgrade.md` — effet : un
  squelette absent peut être copié, mais l’estampillage, le changelog et le
  rapport restent des sorties de la migration agentique.
- Le code est la source principale — source : `AGENTS.md` — effet : les textes
  contradictoires sont alignés sur le moteur de synchronisation supporté.
- Pas de corpus append-only — source : `AGENTS.md` — effet : skill, persona,
  guides, exemple de démonstration, commentaires et tests sont réconciliés
  ensemble.
- Les scripts du pack restent sans dépendance — sources : `package.json` et
  implémentation actuelle de `scripts/` — effet : invariant conservé.
- Les specs sont des livrables d’équipe en français — sources :
  `doc/_meta/app-profile.yaml` et `foundations/core-rules` — effet : ce paquet
  est rédigé en français ; les identifiants de code restent inchangés.

## Critères d’acceptation

- [x] **AC1 — identité de release cohérente.** `package.json`, `PACK_VERSION`
  et le modèle de nouvel état `doc/_meta/corpus-state.yaml` indiquent tous
  `1.1.0`. `PACK_VERSION` porte une date et des notes correspondant à cette
  release ; les exemples publics de version épinglée ne restent pas sur
  `v1.0.0`. Un fixture d’upgrade rapporte `1.0.0 → 1.1.0`. La distribution
  npm et `sync` conservent `doc/spec/template/**`, mais excluent les paquets de
  travail propres au dépôt du pack.
- [x] **AC2 — aucune commande npm orpheline.** `package.json` n’expose plus
  `verify-claims` et chaque cible directe `node scripts/...` encore déclarée
  correspond à un fichier existant.
- [x] **AC3 — la synchronisation préserve les preuves de migration.** Appliquer
  `sync` à un corpus existant, avec ou sans `--force`, ne modifie aucun fichier
  préexistant sous `doc/`, n’estampille pas `corpus-state.yaml`, n’ajoute pas de
  ligne au changelog et n’écrit aucun rapport durable. Les squelettes absents
  du pack peuvent toujours être copiés. Exception : lors d’un upgrade, un
  `doc/_meta/corpus-state.yaml` absent est différé à la migration Corpus afin
  de conserver `from_version: <unknown>` ; il n’est copié directement que lors
  d’une installation fraîche.
- [x] **AC4 — un seul propriétaire de la migration.** Le skill pack-upgrade est
  l’unique propriétaire de `previous_pack_version`, `pack_version`,
  `last_pack_upgrade`, de la ligne durable de changelog, de la réparation de
  schéma et de `pack-upgrade-<from-slug>-to-<to-slug>.md`. Si l’état manque,
  il capture d’abord la version précédente comme `unknown`, le reconstruit à
  partir de `schemas/corpus-state.yaml.template`, estampille, puis lance le
  recalcul. Le rapport possède un frontmatter OKF complet et passe une
  validation finale après sa création ; le slug `unknown` reste portable sous
  Windows.
  Un checkpoint durable est créé avant le premier stamp ; une reprise conserve
  la version source originale et réconcilie une seule ligne de changelog au
  lieu de la dupliquer.
- [x] **AC5 — instructions opérateur sûres et cohérentes.**
  `.github/skills/governance/pack-upgrade/SKILL.md`, `AGENTS.md`,
  `docs/installation.md`, `doc/_agents/pack-upgrade.md` et sa copie de
  démonstration décrivent tous : dry-run, `sync --apply`, puis migration
  Corpus. Aucun ne prescrit `rsync --delete` ni un écrasement manuel comme
  chemin canonique ; aucun n’affirme que `sync` écrit le rapport de migration
  ou exclut toute création sous `doc/`.
- [x] **AC6 — lecture portable du frontmatter.** Le validateur, OKF, le loader,
  le dashboard, le nettoyage post-init, l’ajout de frontmatter aux skills et
  l’estimateur de tokens reconnaissent les variantes LF, CRLF, BOM+LF et
  BOM+CRLF via une primitive partagée. Le recalcul reconnaît les mêmes
  variantes pour l’état YAML. Un fichier qui possède déjà un frontmatter n’en
  reçoit jamais un second.
- [x] **AC7 — couverture du recalcul d’état.** Les tests couvrent, zone par
  zone, les objets en dossiers et en fichiers plats, les API imbriquées, le
  fallback historique `batchs`, la préservation des clés non possédées, la
  non-mutation en dry-run et l’idempotence après apply.
- [x] **AC8 — propriété du recalcul documentée.** Le skill continuous corpus-run
  et la persona Corpus énumèrent l’ensemble des champs d’état et des clés
  d’inventaire possédés par `recompute-corpus-state.mjs`, notamment `bugs`,
  `risks`, `features`, `apis`, `batches` et `screens`, sans laisser l’ancien
  contrat limité à bugs/risks.
- [x] **AC9 — budget de performance respecté.** Sur le runtime du workspace,
  après trois échauffements, la médiane de cinq normalisations d’un texte de
  10 MiB est inférieure ou égale à 250 ms et l’augmentation du heap utilisée
  reste inférieure ou égale à 32 MiB. Aucun parcours supplémentaire du dépôt
  n’est introduit.
- [x] **AC10 — vérification globale verte.** Tests du pack, contrôles de syntaxe,
  validation corpus, fixtures dry-run/apply et `npm pack --dry-run` réussissent
  sans nouveau P0, P1 ou P2 imputable au changement.

## Contraintes

- Aucune dépendance runtime externe ; Node.js `>=18` reste supporté.
- `sync` peut copier un squelette `doc/` absent, mais ne réécrit jamais un
  fichier de corpus existant, même avec `--force`.
- Le comportement de confirmation des agents locaux est conservé.
- Les tests utilisent des répertoires temporaires et ne modifient jamais le
  `doc/_meta/corpus-state.yaml` vivant de ce dépôt.
- Les instructions du pack, son code et ses commentaires restent en anglais ;
  cette spécification suit la langue française configurée pour les livrables
  d’équipe.

## Hypothèses

- Les branches sont livrées séparément : foundations en `1.1.0`, puis software
  factory après rebase et avec une version dédiée.
- Il n’existe pas de ticket Jira ; `foundations-hardening` est le slug de sujet
  confirmé par l’opérateur.
- La surface CLI actuelle (`sync`, `--apply`, `--force`) reste stable.
- Le budget de performance porte sur la primitive de normalisation partagée ;
  les commandes concernées ne sont pas des chemins runtime chauds.

## Questions ouvertes

Aucune question bloquante. Toute modification substantielle du périmètre
entraîne une révision de la spec et une nouvelle approbation opérateur.

## Notes de clôture

- Aucune déviation fonctionnelle par rapport au périmètre approuvé.
- Deux durcissements révélés par la revue indépendante ont été intégrés dans le
  même contrat : le scaffold de reconstruction d’un état legacy absent et la
  validation finale du rapport de migration lui-même.
- La compatibilité comportementale a été exécutée sous Node.js `25.8.1` et
  `18.20.8`, dans le worktree puis depuis le tarball npm extrait. La validation
  Node 18 a révélé puis couvert deux régressions : sortie JSON tronquée par
  `process.exit()` et état BOM+CRLF non normalisé par recompute.
