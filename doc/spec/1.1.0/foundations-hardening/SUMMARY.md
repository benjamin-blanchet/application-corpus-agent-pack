---
type: spec
status: complete
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Résumé — Durcissement des fondations"
description: "Résumé pour les parties prenantes de la release foundations-hardening."
---

# Résumé — Durcissement des fondations

## Ce qui change

La version 1.1.0 rend les upgrades du pack prévisibles et récupérables. `sync`
copie le pack sans consommer l’ancienne version du corpus ni écrire l’historique
de migration ; la migration Corpus effectue ensuite la transition durable et
en consigne la provenance. Tous les outils du pack lisent aussi de façon
cohérente les frontmatters produits sous Windows.

## Pourquoi

La branche actuelle peut sembler verte tout en exposant une commande npm sans
fichier, en rapportant un upgrade `1.0.0 → 1.0.0`, en conservant une instruction
opérateur destructive et en interprétant différemment le même corpus CRLF selon
l’outil utilisé.

## Critères principaux

- [x] Toutes les surfaces de release indiquent la version 1.1.0.
- [x] `sync` préserve les octets du corpus existant et la preuve de l’ancienne version.
- [x] La migration agentique possède seule l’estampillage et le rapport durables.
- [x] LF, CRLF et BOM se comportent à l’identique dans tous les outils du pack.
- [x] Recompute et upgrade ont une couverture déterministe de non-régression.
- [x] Les propriétaires des champs recalculés sont documentés fidèlement.
- [x] Aucun guide supporté ne recommande une copie destructive.
- [x] Le budget de normalisation 10 MiB est respecté.

## Hors périmètre

- Refonte de la software factory.
- Changements sémantiques P3/P4.
- Nouvelle fonctionnalité de vérification des claims.
