---
type: spec
status: approved
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Plan de recette — Usine logicielle V3"
description: "Matrice de preuve du contrôleur, des sources runtime, de l'environnement, de la recette et de la delivery."
---

# Plan de recette — Usine logicielle V3

## Règles de verdict

Un cas porte exactement un statut parmi `passed`, `failed`, `blocked`,
`skipped`, `waived`. `waived` requiert raison, approbateur et timestamp.
`blocked` n'est ni vert ni compté comme réussite. Chaque résultat référence le
`candidate_sha`, l'environnement et son manifeste de preuve.

## Matrice automatisée

| ID | AC | Scénario | Preuve attendue |
|---|---|---|---|
| FT-001 | 001,002,006 | rejouer un journal valide puis altérer la projection | projection identique, tampering détecté |
| FT-002 | 003 | LOT-3 dépend de LOT-1 mais les deux sont demandés | seul LOT-1 est runnable |
| FT-003 | 004 | chemins `src`, `src/a`, `./src/a/`, glob et fichier | chevauchements refusés, chemins disjoints acceptés |
| FT-004 | 005 | release ready puis nouveau commit/finding/spec | gates aval invalidées transitivement |
| FT-005 | 006,035 | template V3 et fixtures V1 divergentes | template valide, diagnostics de migration déterministes |
| FT-006 | 007,009 | générer un handoff de lot | paquet minimal, aucune conversation privée |
| FT-007 | 008 | implémenteur/acceptance tentent push/PR/mutation | action refusée avant exécution |
| FT-008 | 010,011 | petit diff sécurité/validator vs doc bornée | profil minimal expert/standard conforme au risque |
| FT-009 | 012,013,014 | review, correction, re-review ×2 puis finding | résultats structurés ; troisième cycle escaladé |
| FT-010 | 015–019 | source obligatoire/optionnelle via MCP/API/export | probe éphémère, fallback explicite, aucun statut persistant |
| FT-011 | 019 | réintroduire `mcp_status: unavailable` dans état canonique | validation bloquante |
| FT-012 | 020,021 | valider contrats env/CI complets et incomplets | erreurs localisées ; `unknown` honnête accepté selon gate |
| FT-013 | 022,023 | lot sans conventions observées / refactor hors scope | lot bloqué ou arbitrage requis |
| FT-014 | 024,025 | 11 critères, 8 cas, erreur après mutation | couverture incomplète et faux PASS refusés |
| FT-015 | 026 | preuve produite sur SHA précédent | gate acceptance invalide |
| FT-016 | 027,029 | artefact, checksum, PII simulée | lien vérifié ; secret/PII détecté/rédigé |
| FT-017 | 028 | scaffold Playwright inspecté et smoke-testé | config/reporters/traces sans sleeps fixes ni secrets |
| FT-018 | 030,031 | closeout absent ou contradiction journal/README | release bloquée |
| FT-019 | 032 | préparer delivery sur fixture GitHub dry-run | draft seule ; merge/ready/deploy impossibles |
| FT-020 | 033 | exécuter policy sur ce package | suite complète et artefacts attendus |
| FT-021 | 034 | déclarer une règle promue sans fixtures | validation bloquante |
| FT-022 | 001–035 | dogfood du présent package | aucune AC non couverte, état cohérent, rapport généré |

## Tests de robustesse

- Événement dupliqué, hors ordre, inconnu ou payload incomplet.
- Transition impossible et gate passée sans ses inputs.
- Journal partiellement écrit : diagnostic sans inventer l'événement manquant.
- Chemins Windows/Unix et tentative de sortie du dépôt (`..`).
- 1 000 événements / 200 lots dans le budget défini dans `IMPACTS.md`.
- Exécution Node 18 et runtime courant.
- `npm pack --dry-run` : templates, schémas, scripts et fixtures nécessaires
  présents ; paquet de travail `doc/spec/1.2.0/**` absent de la distribution.

## Recette manuelle

- Lire un work package comme un agent neuf et vérifier qu'il permet la tâche
  sans accès au transcript.
- Simuler une source Jira disponible via export mais sans MCP : la source doit
  être utilisable, jamais marquée globalement « MCP unavailable ».
- Ouvrir le rapport HTML Playwright d'une fixture web et retrouver chaque
  critère, assertion, capture et SHA.
- Inspecter le payload de draft PR et confirmer l'absence d'action merge,
  approval, ready-for-review ou deploy.

## Commandes de clôture prévues

```bash
npm test
node scripts/validate-factory.mjs
node scripts/validate-corpus.mjs --json
node --check scripts/factory-controller.mjs
git diff --check
npm pack --dry-run --json
```
