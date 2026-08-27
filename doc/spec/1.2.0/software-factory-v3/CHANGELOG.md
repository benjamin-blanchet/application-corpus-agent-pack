---
type: spec
status: active
confidence: confirmed
source: human-agent-session
last_validated: 2026-08-26
title: "Changelog — Usine logicielle V3"
description: "Décisions substantielles de la spécification V3."
---

# Changelog — Usine logicielle V3

| Date | Étape | Auteur | Décision |
|---|---|---|---|
| 2026-08-26 | cadrage | Opérateur | Vision d'une chaîne complète depuis les ateliers métier jusqu'à une PR prouvée. |
| 2026-08-26 | cadrage | Opérateur | Orchestrateur borné, délégation systématique, modèles proportionnés, revue/correction et corpus obligatoire. |
| 2026-08-26 | cadrage | Opérateur | Intégration dans l'existant ; refactor hors scope soumis à autorisation. |
| 2026-08-26 | cadrage | Opérateur | Environnement local/distant et conditions de test documentés dans le corpus. |
| 2026-08-26 | clarification | Opérateur | `mcp-readiness` est local/session et ne doit pas être persisté. |
| 2026-08-26 | analyse | Codex | Généralisation des échecs observés dans l'expérimentation PGS en critères et fixtures. |
| 2026-08-26 | design | Codex | Event log canonique, projection dérivée, capabilities, source contracts, candidate SHA et draft PR humaine à fusionner. |
| 2026-08-26 | approbation | Opérateur | Autorisation explicite de concevoir le plan complet et de lancer son implémentation. |
| 2026-08-26 | durcissement | Codex | Contrôleur et trust root protégés séparés du checkout candidat ; credentials absents de l'installation candidate et bornés à la campagne d'acceptance. |
| 2026-08-26 | clarification | Codex | Le tree candidat peut s'arrêter à `corpus_closed` ; freeze, recette, preuves `ci_artifact`, release et Delivery forment une continuation post-commit en CI protégée. |
| 2026-08-26 | clarification | Codex | L'adaptateur `command` couvre le dogfood du pack ; Playwright, captures et traces sont conditionnels aux parcours UI. |
| 2026-08-26 | qualité | Codex | Le premier replay dogfood est invalidé plutôt que promu en preuve ; le run canonique sera recréé après correction des contrats et de sa provenance. |
| 2026-08-26 | amendement | Opérateur | Huit write claims exactes ajoutées aux LOT-1/4/5/6 sans modifier objectifs, DAG, critères, modèles ni ownership des artefacts hors lots. |
| 2026-08-26 | autorisation | Opérateur | Budgets de diff exacts approuvés pour LOT-2/4/5 et exception de review indépendante en contexte frais dans la même famille canonique `gpt-5`, bornée au plan `694952924c26a11a9179a087d496ef05b68f0e21de88a501eff51b67379892d4`. |
