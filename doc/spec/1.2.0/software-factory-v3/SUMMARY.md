---
type: spec
status: approved
confidence: confirmed
source: human-agent-session
last_validated: 2026-08-26
title: "Résumé — Usine logicielle V3"
description: "Vision courte de la chaîne spec-to-draft-PR."
---

# Résumé — Usine logicielle V3

La V3 transforme un ensemble de bonnes consignes en protocole exécutable. Une
spec métier approuvée est décomposée en lots bornés, attribuée à des agents et
modèles proportionnés, revue indépendamment, intégrée à l'existant et
documentée dans le corpus. Après publication du commit, elle est recettée sur
un SHA gelé. La sortie visée est une draft PR avec tests, scripts de rejeu,
preuves et limites ; un humain conserve la fusion.

L'état d'exécution n'est plus déclaré à la main : un journal d'événements
alimente un reducer, un scheduler et des invalidations de gates ; le plan reste
un input approuvé.
Les chemins d'exécution supportés refusent les capacités non déclarées et les
effets hors rôle. Une persona seule n'est toutefois pas une sandbox :
l'isolation effective repose aussi sur les frontières d'outils, de workflow et
de credentials.

Enfin, `mcp-readiness` disparaît du corpus persistant. Le corpus décrit les
sources dont l'application a besoin et comment les interroger ; chaque run
observe localement quels adaptateurs sont réellement utilisables et conserve
seulement la couverture historique de ce qu'il a consulté.

## État de cette évolution

L'implémentation, les revues et la réconciliation du corpus sont fermées dans
le dépôt jusqu'à `corpus_closed`. Le replay canonique atteste six lots, dix
commandes d'intégration, une revue consolidée fraîche et le corpus complet.
Le `candidate_sha`, la recette, le manifeste de preuve et le verdict de release
restent produits après publication par la CI protégée. La draft PR déjà ouverte
n'est donc pas encore une Delivery V3 prouvée. Le dogfood du pack emploie
l'adaptateur `command` ; Playwright et les captures s'appliquent aux changements
UI qui le justifient.
