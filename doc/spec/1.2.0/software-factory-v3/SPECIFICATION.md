---
type: spec
status: approved
confidence: confirmed
source: mixed
last_validated: 2026-08-26
title: "Spécification — Usine logicielle V3"
description: "Exigences fonctionnelles et de gouvernance de la chaîne agentique spec-to-draft-PR."
---

# Spécification — Usine logicielle V3

## Contexte

Le pack sait produire un corpus durable et la branche V1 décrit un cycle
spec-first avec lots, modèles, revues et recette. Elle ne fournit toutefois ni
contrôleur déterministe, ni contrats d'environnement et de preuve, ni garde-
fous techniques capables d'empêcher un agent de dépasser son rôle. Le corpus
PGS montre les conséquences concrètes : lots lancés avant leurs dépendances,
état de release non invalidé après correction, revue planifiée mais non
prouvée, test techniquement en erreur déclaré PASS et script Playwright non
reproductible.

La notion actuelle de `mcp-readiness` mélange en outre deux vérités de nature
différente. Le besoin, le mapping et la politique d'une source sont durables ;
la présence d'un adaptateur MCP, d'un droit ou d'une session est locale et
éphémère. Une machine ne doit jamais publier son indisponibilité courante comme
état global de l'application.

## Vision cible

```text
spec métier complète et approuvée
  → plan d'implémentation + plan de recette
  → lots bornés attribués selon risque/capacité/modèle
  → implémentation intégrée à l'existant
  → revue indépendante ↔ correction bornée
  → corpus réconcilié
  → recette sur candidat gelé
  → preuves rejouables et liées au SHA
  → draft PR automatique
  → approbation et fusion humaines
```

## Objectifs

- Faire de la spec approuvée l'entrée obligatoire et traçable de l'usine.
- Rendre l'orchestration, les dépendances, les réservations de chemins et les
  invalidations de gates mécaniques.
- Donner à chaque agent un rôle, une capacité et un contexte minimaux.
- Router les modèles selon le risque réel sans sur-ingénierie ni sous-
  estimation des tâches de contrôle.
- Fermer les boucles revue/correction, corpus et recette avant livraison.
- Produire une draft PR qui transporte une chaîne de preuves vérifiable.

## Non-objectifs

- Créer une plateforme SaaS, une interface graphique ou un moteur générique de
  workflow distribué.
- Imposer Playwright à une application sans interface web ; l'adaptateur est
  officiel pour le web, le cœur reste neutre vis-à-vis de la stack.
- Garantir la disponibilité de Jira, Confluence, Dynatrace ou d'un MCP.
- Réécrire l'architecture d'une application ou corriger ses dettes hors spec.
- Autoriser l'usine à fusionner, déployer, modifier des secrets ou exécuter une
  mutation de données sans capacité et autorisation explicites.
- Persister des identités de modèles comme s'ils étaient disponibles demain.

## Acteurs et responsabilités

| Acteur | Possède | Ne possède jamais |
|---|---|---|
| Opérateur | arbitrages, approbations, dérogations, refactor, fusion | exécution mécanique des lots |
| Factory Controller | événements, réduction d'état, ordonnancement, gates, réservations | spec, code, verdict de revue ou contenu du corpus |
| Analyste | spec, impacts, critères et plan de recette | code applicatif |
| Planificateur | TIP, DAG, work packages et budget de revue | implémentation |
| Implémenteur | chemins alloués d'un lot | coordination, gates, push ou PR |
| Reviewer | findings structurés et verdict indépendant | correction de sa propre revue dans le même rôle |
| Corpus | réconciliation du corpus et preuves de clôture | code applicatif |
| Acceptance | campagne, exécution, résultats et preuves | push, PR, changement de scope |
| Delivery | draft PR bornée et description générée | approbation, fusion ou déploiement |

## Principes invariants

1. L'état est dérivé d'événements validés ; un fichier de synthèse n'est
   jamais une seconde source de vérité éditable.
2. Un lot ne démarre que si ses dépendances et gates sont satisfaites et si
   ses chemins sont réservables sans chevauchement.
3. Un changement d'entrée invalide automatiquement toutes les décisions qui
   en dépendaient.
4. Un agent ne reçoit que le work package utile à sa tâche, jamais l'historique
   conversationnel complet par défaut.
5. Les permissions effectives bornent les actions ; une consigne textuelle ne
   suffit pas à interdire un push ou une mutation.
6. L'implémentation suit la stack et les conventions observées. Une dette hors
   scope est remontée ; un refactor nécessaire est soumis à l'opérateur.
7. Un défaut visible par l'utilisateur ne peut pas être déclaré PASS.
8. La disponibilité d'un outil est observée à l'exécution et expire avec elle.
9. Chaque preuve indique ce qu'elle prouve, sur quel candidat, dans quel
   environnement et avec quelles limites.
10. L'usine ouvre une draft PR, mais l'humain conserve le dernier mot.

## Critères d'acceptation

### Contrôle et état

- [ ] **AC-001 — journal canonique.** Chaque exécution possède un `run_id` et
  un journal JSONL append-only d'événements versionnés. Chaque événement a un
  identifiant unique, un type déclaré, un acteur, un timestamp, un payload
  validé et les digests d'entrée pertinents.
- [ ] **AC-002 — état dérivé.** `factory/state.v3.json` est une projection
  reproductible du journal. Un recalcul depuis zéro produit le même résultat ;
  une modification manuelle ou une projection périmée est détectée.
- [ ] **AC-003 — scheduler pur.** La fonction d'ordonnancement ne retourne que
  les lots dont toutes les dépendances sont terminées, toutes les gates amont
  sont valides et les chemins ne chevauchent aucune réservation active.
- [ ] **AC-004 — réservations robustes.** Les collisions exactes, parent/enfant,
  normalisées (`./`, slash terminal) et glob/concret évidentes sont refusées
  dans une même vague.
- [ ] **AC-005 — invalidation transitive.** Tout changement de spec, plan,
  code, tests, revue, corpus, campagne ou preuves invalide automatiquement les
  gates dépendantes. `release_ready` ne peut pas survivre à un nouveau commit
  ou finding bloquant.
- [ ] **AC-006 — transitions fermées.** Un automate unique définit les états,
  événements autorisés, préconditions et gates obligatoires. Templates,
  validateur, contrôleur et documentation utilisent exactement ce vocabulaire.

### Rôles, contexte, modèles et capacités

- [ ] **AC-007 — work package borné.** Chaque tâche porte objectif observable,
  entrées, critères, dépendances, chemins lisibles/inscriptibles/interdits,
  invariants, non-objectifs, sorties, vérifications, budget et règles d'arrêt.
- [ ] **AC-008 — contrôle de capacité.** Les capacités `read`, `write`,
  `execute`, `network`, `git_commit`, `git_push`, `open_pr`, `data_mutation`
  sont déclarées et vérifiées avant action. Implémenteurs, reviewers et recette
  n'ont pas `git_push`/`open_pr` ; seul Delivery peut ouvrir une draft PR.
- [ ] **AC-009 — contexte minimal.** Les handoffs référencent des artefacts
  structurés et digests, sans recopier le raisonnement privé ni un transcript
  complet. Les sous-agents ne possèdent pas l'état global.
- [ ] **AC-010 — profils de modèles.** Le plan choisit un profil
  `economy | standard | expert | reviewer` selon risque, blast radius,
  ambiguïté et nature de contrôle. L'identité réelle est résolue au runtime et
  enregistrée comme provenance historique, jamais comme disponibilité durable.
- [ ] **AC-011 — anti-sous-routage.** Un validateur de contrôle, une migration,
  un changement sécurité/données ou un lot à fort impact ne peut pas être
  routé vers `economy`, même si le diff attendu est petit.

### Revue et correction

- [ ] **AC-012 — revue indépendante.** Chaque lot et l'intégration consolidée
  ont un résultat de revue par un contexte frais, distinct de l'auteur ; une
  famille de modèle différente est préférée et toute exception est tracée.
- [ ] **AC-013 — findings exploitables.** Un finding contient sévérité, règle
  ou critère, localisation, preuve/reproduction, impact et état. Un commentaire
  vague ne peut pas bloquer une release.
- [ ] **AC-014 — boucle bornée.** Deux cycles correction/re-review maximum sont
  automatiques. Au-delà, ou en cas de désaccord, l'opérateur arbitre. Un finding
  bloquant ouvert empêche les gates suivantes.

### Sources et remplacement de MCP readiness

- [ ] **AC-015 — contrat de source durable.** Chaque source déclare besoin,
  mapping, usages, politique d'accès, adaptateurs acceptables, catalogue de
  requêtes et fallback. MCP est un adaptateur parmi d'autres, jamais la source.
- [ ] **AC-016 — probe éphémère.** La disponibilité, l'authentification, les
  permissions et le mapping sont vérifiés au début du run et ne sont pas écrits
  comme état global du corpus.
- [ ] **AC-017 — couverture historique.** Un run peut conserver les sources
  réellement consultées, requêtes/périodes et limites. Cet historique ne peut
  jamais être interprété comme disponibilité courante.
- [ ] **AC-018 — fallback explicite.** Source obligatoire indisponible : run
  bloqué ou dérogation opérateur. Source optionnelle indisponible : scope
  partiel explicite. Aucun fallback silencieux, aucune question durable créée
  uniquement parce qu'un poste n'a pas le bon outil.
- [ ] **AC-019 — migration complète.** Le fichier, les champs d'état, les
  compteurs dashboard et le skill `mcp-readiness` disparaissent ou sont migrés
  sans laisser deux contrats concurrents. Le validateur rejette un statut
  runtime persistant dans les emplacements canoniques.

### Environnement et intégration à l'existant

- [ ] **AC-020 — contrat d'environnement.** Le corpus décrit prérequis,
  build/start/health/stop/reset, dépendances, auth, données, secrets par
  référence, URL locales ou distantes, mutations permises et restauration.
- [ ] **AC-021 — contrat CI.** Le pipeline actif, les checks obligatoires, la
  construction du candidat, les previews et l'identité de build sont déclarés
  depuis le code/config, avec `unknown` honnête si non vérifiables.
- [ ] **AC-022 — conformité locale.** Avant de modifier le code, le lot cite
  conventions et exemples observés dans le dépôt. Il n'introduit ni refactor
  opportuniste ni architecture parallèle.
- [ ] **AC-023 — frein réel.** Si l'existant empêche la réalisation sûre, le
  run produit une demande d'arbitrage avec preuve, options, impact et plus petit
  refactor nécessaire. Aucun dépassement implicite de scope.

### Recette, preuves et provenance

- [ ] **AC-024 — plan de recette traçable.** Chaque critère est lié à au moins
  un cas, assertion et type de preuve, ou à une dérogation humaine motivée.
  Aucun agrégat `11/11 PASS` ne peut masquer un cas absent ou en erreur.
- [ ] **AC-025 — statuts honnêtes.** Les seuls verdicts de cas sont
  `passed | failed | blocked | skipped | waived`; `waived` requiert raison,
  approbateur et date. Une erreur utilisateur ou dépendance après mutation
  produit `failed` ou `blocked`, jamais `passed`.
- [ ] **AC-026 — candidat immuable.** `candidate_sha` complet est obligatoire
  pour toute livraison. Chaque campagne enregistre `tested_sha`, tree digest,
  build/dataset/schema/environnement et versions d'outils. Une preuve produite
  sur un autre SHA ne satisfait pas la gate.
- [ ] **AC-027 — enveloppe de preuve.** Un manifeste lie cas, assertions,
  captures, traces, vidéo, logs et rapports à leur checksum et à l'identité du
  run. Les secrets et PII sont minimisés/rédigés.
- [ ] **AC-028 — adaptateur Playwright.** Pour une application web, le pack
  fournit un scaffold `@playwright/test` paramétrable avec config, webServer ou
  base URL, attentes déterministes, traces/screenshots/vidéos sur échec,
  rapports machine + HTML, isolation des données et stratégie d'auth documentée.
  Il interdit les sleeps fixes, données partagées mutées sans cleanup et
  profils humains persistants comme chemin CI canonique.
- [ ] **AC-029 — artefacts CI.** Scripts/specs restent dans Git ; les artefacts
  volumineux sont publiés avec rétention et checksum par CI. Un échantillon de
  preuve peut être committé s'il respecte sécurité et taille.

### Clôture, PR et apprentissage

- [ ] **AC-030 — clôture corpus obligatoire.** Les claims directement vérifiés,
  résumés, indexes et contradictions affectés sont réconciliés avant recette.
  Une liste append-only ou un `update-candidates` non consommé ne suffit pas.
- [ ] **AC-031 — gate de cohérence.** Avant livraison, état, journal, spec,
  tests, résultats, reviews et corpus racontent le même résultat. Toute
  contradiction bloque.
- [ ] **AC-032 — draft PR automatique.** Depuis une branche distante publiée
  par le chemin d'intégration autorisé du dépôt, Delivery peut ouvrir/mettre à
  jour une draft PR avec permissions minimales, spec/TIP,
  matrice de recette, SHA, checks, preuves, risques, dérogations et commande de
  rejeu. Il ne peut ni commit, ni push, ni approuver, ni rendre ready, ni
  fusionner, ni déployer.
- [ ] **AC-033 — contrôle CI réel.** La policy exécute la suite complète et les
  validateurs sur un vrai package, publie les preuves attendues et documente le
  check à rendre obligatoire. Les actions sont épinglées de façon défendable.
- [ ] **AC-034 — apprentissage promotionné.** Toute règle extraite d'un projet
  vers le pack possède source, généralisation, fixtures positive/négative et
  décision. Le pack empêche qu'une règle annoncée (ex. 13 fixtures) régresse à
  une couverture moindre sans décision explicite.
- [ ] **AC-035 — migration V1.** Les packages V1 restent lisibles ou reçoivent
  un diagnostic de migration précis ; aucun état apparemment vert n'est
  inventé. Le template livré est lui-même validé par des fixtures.

## Contraintes

- Node.js `>=18`, zéro dépendance runtime obligatoire pour le cœur du pack.
- Formats textuels, diffables et exploitables hors d'un fournisseur.
- Compatibilité GitHub/Copilot privilégiée dans l'adaptateur de delivery, sans
  rendre le modèle de domaine dépendant de GitHub.
- Secrets jamais persistés ; seules des références de secret peuvent l'être.
- Le contrôleur ne doit pas avoir besoin du contenu complet du code pour
  décider d'une transition.
- Les erreurs de validation sortent de façon déterministe avec code non nul.

## Hypothèses et décisions

- L'état canonique est un event log JSONL ; la projection JSON reste la vue
  humaine et CI.
- Le modèle central reste stack-neutral, avec adaptateurs (Playwright, GitHub).
- Les artefacts lourds de recette vivent en CI ; le dépôt conserve manifests,
  scripts et éventuellement captures sélectionnées.
- `candidate_sha` est toujours requis. `tested_sha` ne peut être absent que si
  l'acceptance est officiellement `waived`, sans rendre la qualité PASS.
- L'ouverture de draft PR est autorisée par la vision ; la fusion reste hors
  portée de toute capacité agentique du pack.

## Questions ouvertes

Aucune question ne bloque l'implémentation du socle. Les détails propres à une
application — commandes, jeux de données, stratégie SSO et checks de branche —
sont intentionnellement résolus lors de l'adoption via les contrats fournis.
