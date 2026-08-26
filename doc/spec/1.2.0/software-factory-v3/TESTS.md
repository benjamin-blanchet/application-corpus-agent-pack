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
`blocked` n'est ni vert ni compté comme réussite. Chaque résultat de recette
candidat référence le `candidate_sha`, l'environnement et son manifeste de
preuve. Les tests d'implémentation pré-candidat sont consignés séparément et ne
prétendent pas être cette preuve.

## Matrice automatisée

| ID | AC | Scénario | Preuve attendue |
|---|---|---|---|
| FT-001 | 001,002,006 | rejouer un journal valide puis altérer la projection | projection identique, tampering détecté |
| FT-002 | 003 | LOT-4 dépend de LOT-2 mais les deux sont demandés | seul LOT-2 est runnable |
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
| FT-016 | 027,029 | artefact, checksum, PII simulée | type dérivé des octets ; secret/PII détecté ou preuve bloquée faute d'attestation |
| FT-017 | 028 | scaffold Playwright d'une fixture UI inspecté et smoke-testé | config/reporters/traces sans sleeps fixes ni secrets |
| FT-018 | 030,031 | closeout absent ou contradiction journal/README | release bloquée |
| FT-019 | 032 | préparer delivery sur fixture GitHub dry-run | draft seule ; merge/ready/deploy impossibles |
| FT-020 | 033 | exécuter policy sur ce package | suite complète et artefacts attendus |
| FT-021 | 034 | déclarer une règle promue sans fixtures | validation bloquante |
| FT-022 | 001–035 | dogfood du présent package | aucune AC non couverte, état cohérent, rapport généré |
| FT-023 | 025,027 | déclarer un `.txt` comme PNG, omettre un oracle, poser `user_visible_error` | faux média, oracle absent et erreur visible bloquent tous READY |
| FT-024 | 020,026 | probe de révision avec deux SHA, mauvais adaptateur ou input non gelé | ambiguïté, toolchain divergent et substitution sont refusés |
| FT-025 | 032 | injecter un `client_payload` contenant des métacaractères shell | input transmis uniquement par environnement/argv, aucune exécution parasite |
| FT-026 | 032 | reçu valide mais contrat/plan/state/evidence substitué | signature invalide car tous les digests font partie du payload autorisé |
| FT-027 | 032 | state non `release_ready`, run Actions d'un autre SHA ou artefact expiré | Delivery refuse avant tout appel de création/mise à jour de PR |
| FT-028 | 020,024 | build/start/reset/stop en échec et campagne `command` | lifecycle ordonné, cleanup en `finally`, résultats et logs explicites |
| FT-029 | 021,029,033 | workflow composé uniquement de commentaires, rétention divergente, storage state via parent symlink | validation structurelle/parité, rétention exacte et confinement `realpath` bloquants |
| FT-030 | 008,029,032 | le candidat remplace garde/clé ou ajoute un lifecycle npm lisant les secrets | contrôleur et trust root viennent d'un SHA protégé distinct ; installation sans scripts ni secret |
| FT-031 | 025–027 | faux evidence commit, adapter interrompu avant `results.json`, cleanup qui lève | SHA evidence exact ; toutes les cleanups, reset et stop restent tentés et tracés |
| FT-032 | 001,007,009,031 | falsifier un fichier présent, recréer un supprimé, altérer une sortie fichier/arbre ou ajouter un symlink | append et validation package refusent la preuve stale ou non confinée |
| FT-033 | 014 | épuiser le budget, tenter une extension anticipée/non autorisée, puis arbitrage opérateur | seule une tentative unitaire, explicite et liée au plan/diff est accordée |
| FT-034 | 032–033 | check candidat homonyme et SHA contrôleur absent du step Release | Delivery ne consomme aucun check par nom/SHA ; l'attestation Release reçoit et valide le SHA contrôleur protégé |

## Résultats de préparation candidat

Ces résultats prouvent le snapshot revu puis la clôture locale
`corpus_closed`. Ils ne remplacent pas la recette sur le SHA gelé ni le
manifeste candidat ; toute correction invalide le replay et impose sa
régénération.

| Surface | Résultat consigné | Limite actuelle |
|---|---|---|
| Sources runtime | `test-runtime-sources.mjs` 24/24 | revue indépendante GO |
| Delivery | `test-factory-delivery.mjs` 54/54 | recette candidat protégée non lancée |
| Suite pack | `npm test` PASS sur le snapshot final | aucune correction post-revue autorisée |
| Validation statique | Factory, templates/package Delivery et corpus sans finding | journal canonique fermé à `corpus_closed` |
| Packaging | `npm pack --dry-run --json` PASS | ne constitue pas une publication npm |
| Control plane | `test-factory-v3.mjs` 98/98 et self-test 8/8 | candidate freeze et release restent en CI protégée |
| Learning | `test-factory-learning.mjs` 12/12 | registre publié protégé par ses fixtures |

FT-022 est passé jusqu'à `corpus_closed`. La partie locale de FT-020 est verte ;
son exécution protégée sur le SHA gelé reste pending. Aucun résultat
d'acceptance, manifeste, rapport candidat ou verdict de release n'est encore
revendiqué. Le dogfood du pack sélectionne l'adaptateur `command` ; il n'exige
donc pas de capture Playwright. Les preuves visuelles restent obligatoires pour
les parcours UI qui les déclarent.

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
- Pour une campagne UI, ouvrir le rapport HTML Playwright d'une fixture web et
  retrouver chaque critère, assertion, capture et SHA. Cette vérification n'est
  pas applicable au dogfood `command` du pack.
- Inspecter le payload de draft PR et confirmer l'absence d'action merge,
  approval, ready-for-review ou deploy.

## Commandes de clôture locale

```bash
npm test
node scripts/validate-factory.mjs
node scripts/validate-delivery.mjs --lint-template --json
node scripts/validate-delivery.mjs --package doc/spec/1.2.0/software-factory-v3 --environment doc/project/runtime/ENVIRONMENTS.yaml --ci doc/project/cicd/FACTORY_CI.yaml --json
node scripts/validate-corpus.mjs --json
node --check scripts/factory-control.mjs
node scripts/test-factory-learning.mjs --contract-only
git diff --check
npm pack --dry-run --json
```
