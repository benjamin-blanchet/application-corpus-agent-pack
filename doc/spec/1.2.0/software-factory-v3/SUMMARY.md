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
modèles proportionnés, revue indépendamment, intégrée à l'existant, documentée
dans le corpus et recettée sur un SHA gelé. La sortie est une draft PR avec
tests, scripts de rejeu, preuves et limites ; un humain conserve la fusion.

L'état ne dépend plus de fichiers déclaratifs modifiés à la main : un journal
d'événements pilote un reducer, un scheduler et des invalidations de gates.
Les capacités empêchent techniquement les agents de pousser ou muter hors de
leur rôle.

Enfin, `mcp-readiness` disparaît du corpus persistant. Le corpus décrit les
sources dont l'application a besoin et comment les interroger ; chaque run
observe localement quels adaptateurs sont réellement utilisables et conserve
seulement la couverture historique de ce qu'il a consulté.
