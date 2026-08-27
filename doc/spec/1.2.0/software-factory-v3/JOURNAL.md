---
type: spec
status: active
confidence: confirmed
source: human-agent-session
last_validated: 2026-08-26
title: "Journal — Usine logicielle V3"
description: "Vue humaine append-only des décisions et exécutions ; le journal machine est JSONL."
---

# Journal — Usine logicielle V3

| Timestamp | Événement | Résultat / preuve |
|---|---|---|
| 2026-08-26T12:35:00+02:00 | branche préparée | `fix/foundations` fusionnée dans `feat/software-factory` |
| 2026-08-26T12:46:54+02:00 | baseline vérifiée | `npm test` vert : pack 13/13, upgrade 7/7, recompute 4/4, frontmatter 8/8, benchmark PASS, factory 8/8 |
| 2026-08-26T12:50:00+02:00 | spec et plan autorisés | demande opérateur de concevoir le plan complet et de lancer l'implémentation |
| 2026-08-26T13:00:00+02:00 | package V3 initialisé | spec, impacts, recette et première version du plan machine créés ; aucun lot n'est réputé intégré à ce stade |
| 2026-08-26T14:27:00+02:00 | revue indépendante control plane | GO sans P0/P1/P2 après deux cycles ; `test-factory-v3.mjs` 63/63, dont BF-041 à BF-047 |
| 2026-08-26T14:27:00+02:00 | revue indépendante sources runtime | GO sans P0/P1 ; `test-runtime-sources.mjs` 24/24 et corpus sans finding |
| 2026-08-26T14:27:00+02:00 | revue adversariale delivery | NO-GO malgré 21/21 : neuf P0 sur preuves/oracles/provenance/workflows/autorisation, plus lifecycle et adaptateur command incomplets |
| 2026-08-26T14:27:00+02:00 | audit des write claims | NO-GO : LOT-1/LOT-6 pouvaient modifier les artefacts Planner/Controller et 54 fichiers d'implémentation étaient hors claims |
| 2026-08-26T14:27:00+02:00 | correction cycle 2 lancée | dernier cycle automatique autorisé ; re-revue indépendante obligatoire, escalade opérateur si un P0/P1 subsiste |
| 2026-08-26T15:02:34+02:00 | arbitrage opérateur | troisième cycle exceptionnel explicitement autorisé, strictement limité aux quatre P0 et trois P1 du dernier audit |
| 2026-08-26T15:30:19+02:00 | revue indépendante delivery cycle 3 | GO sans P0/P1 ; `test-factory-delivery.mjs` 38/38, workflows actifs/templates alignés et dernier P2 de schéma corrigé |
| 2026-08-26T15:35:00+02:00 | validation pré-candidat consignée | sources 24/24, delivery 38/38, `npm test` PASS, validateurs delivery/corpus sans finding et `npm pack --dry-run --json` PASS sur le snapshot ; le control plane doit être rejoué après son correctif P1 |
| 2026-08-26T15:35:24+02:00 | premier replay dogfood invalidé | les 28 événements (`events.v3.jsonl` SHA-256 `1f17f67d1ddd851f5a8226047b6a29452bbecd05fe9b67fb261429cabb42f0f3`) ne constituent pas une preuve de clôture : horodatages futurs dans la première séquence, puis P1 sur contrats/digests et traçabilité de la tentative supplémentaire autorisée par l'opérateur ; le run canonique sera recréé depuis zéro |
| 2026-08-26T15:35:24+02:00 | frontière de livraison maintenue | `candidate_frozen`, acceptance, evidence, release et Delivery restent pending jusqu'au commit publié et à la continuation CI protégée ; la draft PR existante n'est pas une preuve Delivery V3 |
| 2026-08-26T17:47:58+02:00 | amendement de périmètre approuvé | l'opérateur autorise exactement huit nouvelles write claims : runner portable LOT-1 ; quatre scripts Delivery LOT-4 ; implementation guard LOT-5 ; moteur et entrée d'upgrade LOT-6 ; objectifs, DAG, critères et ownership inchangés |
| 2026-08-26T17:47:58+02:00 | validation avant replay canonique | `npm test` vert : Control 98/98, Delivery 53/53, Learning 12/12, upgrade 11/11, runtime sources 24/24 ; suite portable 5/5 ; validateurs Corpus et Delivery sans finding ; revue indépendante corrigée sur le checkout Git complet requis par Release |
| 2026-08-26T18:20:00+02:00 | bornes d'exécution approuvées | l'opérateur autorise les budgets exacts LOT-2 `25/5667/322/0`, LOT-4 `59/6778/259/0`, LOT-5 `35/1269/408/0` (`fichiers/ajouts/suppressions/binaires`) et, faute d'autre famille runtime disponible, des reviews en contexte frais dans la même famille canonique `gpt-5` pour les six lots et la revue consolidée ; exception strictement liée au plan `694952924c26a11a9179a087d496ef05b68f0e21de88a501eff51b67379892d4` |
| 2026-08-26T18:29:54+02:00 | replay canonique — préfixe revu | 43 événements V3 valides ; six baselines Git propres dans des worktrees isolés, six deltas exacts, budgets approuvés LOT-2/4/5, reviews fraîches passantes et lots intégrés ; dix commandes de validation vertes avec reçus stdout/stderr content-addressed ; candidat, acceptance, evidence, release et Delivery restent pending |
| 2026-08-26T18:38:11+02:00 | revue indépendante post-candidat | NO-GO : `candidate binding` refuse le corpus car le closeout a inclus `doc/_site/corpus.html`, artefact généré et gitignored absent du commit ; surfaces README/SUMMARY/PR encore en statut pré-replay |
| 2026-08-26T18:38:11+02:00 | correction bornée ouverte | `doc/_site` ajouté aux exclusions déterministes communes filesystem/Git, régression dédiée ajoutée, statuts opérateur réconciliés ; les deux commits et le replay canonique doivent être régénérés avant push |
| 2026-08-26T19:51:19+02:00 | frontière de confiance Delivery corrigée | les workflows privilégiés Acceptance/Release/Draft PR passent à des `repository_dispatch` chargés depuis le défaut protégé et pinés sur `FACTORY_CONTROLLER_SHA` ; attestation Acceptance V2 sépare `workflow_sha` et `subject_sha`, les runs V1 sont rejetés, Acceptance devient un gate attesté plutôt qu'un branch check candidat ; Delivery 54/54, suite npm et validateurs Delivery verts ; replay en attente des nouveaux budgets exacts issus de cette correction |
| 2026-08-26T21:34:30+02:00 | nouveaux budgets et réécriture approuvés | l'opérateur autorise les budgets exacts LOT-2 `25/5675/322/0`, LOT-4 `59/6850/261/0`, LOT-5 `35/1260/410/0` (`fichiers/ajouts/suppressions/binaires`) ainsi que le remplacement des deux commits locaux invalides, non poussés, depuis la base approuvée `559176a118bc6ea70afc5548c21ccd1ffbb00796` |
| 2026-08-26T21:45:37+02:00 | replay canonique corrigé — préfixe revu | 43 événements V3 valides ; six baselines Git propres dans des worktrees isolés, six deltas exacts sous les nouveaux budgets LOT-2/4/5 approuvés — LOT-4 termine à `59/6848/261/0` sous sa borne `59/6850/261/0` — reviews fraîches passantes et lots intégrés ; dix commandes de validation vertes avec reçus stdout/stderr régénérés ; candidat, acceptance, evidence, release et Delivery restent pending jusqu'au commit protégé |
| 2026-08-26T21:57:02+02:00 | revue finale indépendante — NO-GO corrigé, replay invalidé | deux P0 et un P1 détectés avant push : variable `FACTORY_CONTROLLER_SHA` absente du step d'attestation Release, checks GitHub acceptés par nom/SHA sans provenance, et dépendance circulaire au check `pull_request_target` avant création de la draft ; Release lie désormais explicitement le SHA contrôleur, Delivery ne consomme plus les checks homonymes et les documente comme protections post-création ; Delivery 54/54 et validateur template verts, mais le replay doit être régénéré après approbation des bornes corrigées |
| 2026-08-26T21:59:28+02:00 | bornes finales approuvées | l'opérateur autorise les budgets exacts LOT-4 `59/6863/268/0` et LOT-5 `35/1268/410/0` (`fichiers/ajouts/suppressions/binaires`) pour intégrer les corrections de la revue finale ; LOT-2 conserve sa borne approuvée `25/5675/322/0` |
| 2026-08-26T22:03:09+02:00 | replay final — préfixe revu | 43 événements V3 valides ; six worktrees isolés, deltas exacts sous les bornes finales, reviews fraîches passantes et lots intégrés ; dix commandes de validation vertes avec reçus régénérés ; aucune publication et aucun état post-candidat revendiqué à ce stade |
