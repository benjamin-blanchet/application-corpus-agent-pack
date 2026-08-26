---
type: spec
status: complete
confidence: confirmed
source: human-agent-session
last_validated: 2026-08-26
title: "Changelog — Durcissement des fondations"
description: "Évolutions substantielles de la spécification foundations-hardening."
---

# Changelog — Durcissement des fondations

## Évolutions

| Date | Phase / étape | Auteur | Changement |
|---|---|---|---|
| 2026-08-26 | Étape 5 | Codex | Première rédaction à partir du périmètre foundations-hardening 1.1.0 confirmé par l’opérateur et des preuves de revue de branche. |
| 2026-08-26 | Étape 5 — auto-audit | Codex | Passage en français, ajout des consommateurs de frontmatter oubliés, des surfaces d’upgrade, du contrat recompute et d’un budget de performance mesurable. |
| 2026-08-26 | Étape 5b | Opérateur | Spécification approuvée explicitement avec « spec ok ». |
| 2026-08-26 | Étape 6 | Codex | Ajout du cas d’upgrade avec `corpus-state.yaml` absent : état différé à la migration pour préserver une provenance inconnue. |
| 2026-08-26 | Étape 7 | Opérateur | Plan d’implémentation approuvé explicitement avec « go ». |
| 2026-08-26 | Étape 9 | Codex | Le dry-run npm a révélé que la spec interne serait distribuée ; ajout de l’exclusion des specs de travail en conservant le template réutilisable. |
| 2026-08-26 | Étape 9 — revue indépendante | Codex | Fermeture du cas legacy sans état : scaffold pack-owned vérifié, préemption du recompute, slug portable du rapport, frontmatter OKF et validation finale post-rapport. |
| 2026-08-26 | Étape 10 | Codex | Clôture : AC1–AC10 satisfaits, 32/32 tests verts, benchmark conforme, package vérifié, P0/P1 à zéro et deux P2 historiques consignés ; aucune délégation Corpus nécessaire. |
| 2026-08-26 | Étape 10 — reprise | Codex | Ajout d’un checkpoint créé avant mutation : reprise avec provenance stable, transition de changelog idempotente et `validation_status: passed` comme dernière écriture durable, relue ensuite par un validator strictement read-only. |
| 2026-08-26 | Étape 10 — matrice réelle | Codex | La validation Node 18 et tarball a révélé puis fait corriger le drainage stdout du validateur, la lecture BOM+CRLF de recompute et les tests dépendants des docs non publiées ; 32/32 tests passent sur les runtimes supportés. |
