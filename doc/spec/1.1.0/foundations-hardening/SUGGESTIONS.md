---
type: spec
status: complete
confidence: confirmed
source: code
last_validated: 2026-08-26
title: "Suggestions — Durcissement des fondations"
description: "Constats hors périmètre conservés pour un traitement ultérieur."
---

# Suggestions — Hors périmètre

## Réconcilier les candidats P3 avec l’inventaire des fonctionnalités

- **Constat** : recompute inventorie chaque dossier portant un `README.md`,
  tandis que le validateur exige ensuite un entretien pour chaque
  fonctionnalité inventoriée ; un candidat P3 valide peut donc sembler être
  une fonctionnalité P4 incomplète.
- **Où** : `scripts/recompute-corpus-state.mjs` et
  `scripts/validate-corpus.mjs`.
- **Suite suggérée** : décider si l’inventaire contient les candidats ou
  seulement les fonctionnalités documentées, puis aligner les deux lecteurs.
- **Priorité indicative** : haute.

## Durcir le contrat de preuve localisée P4

- **Constat** : la détection libre `path:line` accepte du texte qui n’est pas un
  chemin et le garde-fou d’auto-référence ne normalise pas `./doc/...` ; le
  template producteur n’intègre pas non plus la nouvelle section Code Evidence.
- **Où** : validateur, skill P4, motif de preuve de code et template feature.
- **Suite suggérée** : spec ciblée sur les preuves P4, avec chemins normalisés
  et tests du contrat producteur/validateur.
- **Priorité indicative** : haute.

## Définir la coexistence de `batches/` et du legacy `batchs/`

- **Constat** : recompute choisit un répertoire et ignore l’autre lorsque les
  deux existent.
- **Où** : `scripts/recompute-corpus-state.mjs`.
- **Suite suggérée** : décider entre fusion et migration avant de changer le
  comportement.
- **Priorité indicative** : moyenne.

## Durcir la software factory avant son rebase

- **Constat** : la validation isolée de `origin/feat/software-factory`
  (`525e691`) ne couvre aucun package réel et a reproduit plusieurs défauts :
  un critère sous la forme objet documentée (`id` + `proven_by`) est déclaré
  non couvert ; les états du template et ceux du validateur divergent ;
  `release_ready` accepte encore des gates et lots `pending` ; les identifiants
  de lots dupliqués et les chevauchements parent/enfant de `allowed_paths` ne
  sont pas détectés.
- **Où** : `origin/feat/software-factory`.
- **Suite suggérée** : rebaser seulement après stabilisation de foundations
  1.1.0, puis ouvrir une spec dédiée 1.2.0 avec fixtures réelles couvrant la
  forme objet des critères, le vocabulaire d’états, les préconditions de
  transition, l’unicité des lots et les chevauchements de chemins.
- **Priorité indicative** : haute.
