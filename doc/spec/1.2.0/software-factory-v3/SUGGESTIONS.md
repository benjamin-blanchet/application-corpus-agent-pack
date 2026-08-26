---
type: spec
status: active
confidence: probable
source: mixed
last_validated: 2026-08-26
title: "Suggestions — Usine logicielle V3"
description: "Évolutions utiles mais hors du socle 1.2.0."
---

# Suggestions — Hors périmètre 1.2.0

## Interface de supervision

Construire ultérieurement une vue interactive du journal, des gates et des
preuves. La V3 livre d'abord un modèle de données stable et des sorties JSON.

## Adaptateurs supplémentaires

Ajouter après dogfood des adaptateurs GitLab/Azure DevOps et Cypress/mobile.
Le contrat central doit être éprouvé avant de multiplier les intégrations.

## Mesure économique

Exploiter les événements historiques pour comparer coût, temps de cycle,
retours de review, flakiness et taux d'escalade par profil de modèle. Aucun
score de qualité ne doit être déduit avant de disposer d'un échantillon réel.
