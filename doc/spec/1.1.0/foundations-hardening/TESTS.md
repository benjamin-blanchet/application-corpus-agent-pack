---
type: spec
status: complete
confidence: confirmed
source: code
last_validated: 2026-08-26
title: "Stratégie de test — Durcissement des fondations"
description: "Matrice de vérification de la version, de la sûreté de sync, du frontmatter portable et du recalcul d’état."
---

# Stratégie de test — Durcissement des fondations

## Tests unitaires et fixtures

| ID | AC couverts | Scénario | Résultat attendu | Résultat |
|---|---|---|---|---|
| T1 | AC6 | helper partagé avec LF, CRLF, BOM+LF et BOM+CRLF | texte normalisé et frontmatter visibles de façon identique | réussi — `test-frontmatter`: 8/8 |
| T2 | AC2 | cibles directes `node scripts/...` du package | chaque cible déclarée existe | réussi — contrat release |
| T3 | AC7 | chaque zone recompute en forme dossier puis fichier plat ; API imbriquée | maps slug→chemin attendues, sans pollution par les documents réservés | réussi — `test-recompute`: 4/4 |
| T4 | AC7 | fallback `batchs`, état BOM+CRLF, clés non possédées, dry-run, apply puis second dry-run | fallback et dérive détectés, clés préservées, aucune mutation en dry-run et idempotence après apply | réussi — `test-recompute`: 4/4 |
| T5 | AC1 | upgrade d’un état source 1.0.0 vers le pack 1.1.0 | le delta affiché vaut `1.0.0 → 1.1.0` | réussi — `test-upgrade`: 7/7 |
| T6 | AC3, AC4 | `sync --apply` puis `sync --apply --force` sur corpus existant, avec état présent puis absent | tous les octets `doc/` préexistants sont inchangés ; aucun rapport ; l’état absent est différé tandis que le scaffold `schemas/corpus-state.yaml.template` reste disponible | réussi — snapshots et scénario legacy |
| T7 | AC1, AC3 | installation initiale | squelettes absents copiés avec modèle d’état 1.1.0 | réussi — modèle et scaffold identiques octet par octet |
| T8 | AC3 | agent local modifié en mode non interactif | agent préservé et signalé | réussi — agent préservé ; `--force` limité à l’agent |
| T9 | AC8 | allowlist recompute contre skill corpus-run et persona Corpus | les six clés d’inventaire et les champs d’état possédés sont documentés | réussi — contrat extrait du code |
| T10 | AC9 | normalisation d’un texte de 10 MiB | médiane ≤ 250 ms après trois échauffements ; hausse heap ≤ 32 MiB | réussi — Node 25 médiane 3,424 ms ; Node 18 médiane 23,677 ms, maximum 24,696 ms, heap 24,262 MiB |
| T11 | AC4 | contrat du skill et de la persona pour un état legacy absent ou une migration interrompue | capture `unknown` avant copie, checkpoint avant stamp, reconstruction depuis le scaffold, reprise avec provenance stable, changelog idempotent, rapport OKF à slug portable et validation finale | réussi — assertions de contrat + revue indépendante |

## Tests de non-régression par consommateur

| Zone | Vérification | Résultat |
|---|---|---|
| Validateur | fixtures corpus LF/CRLF/BOM existantes et étendues | réussi |
| OKF | chaque variante traverse le moteur OKF | réussi |
| Loader corpus | les métadonnées influencent la recherche comme en LF | réussi |
| Générateur dashboard | métadonnées parsées sans perte | réussi |
| Nettoyage post-init | skill `lifecycle: init-only` détecté dans chaque variante | réussi |
| Ajout de frontmatter | un skill déjà muni de frontmatter est ignoré, sans second bloc | réussi — octets inchangés, aucun doublon |
| Estimateur de tokens | le frontmatter seul est compté de manière identique | réussi |
| Documentation upgrade | les cinq surfaces documentaires décrivent le même contrat | réussi — lecture croisée et assertions ciblées |

## Vérifications d’intégration et qualité

| Contrôle | Sortie attendue | Résultat |
|---|---|---|
| `npm test` | toutes les suites vertes | réussi — 32/32 tests + benchmark PASS, worktree et tarball extrait |
| `node --check` sur les `.mjs` modifiés | propre | réussi — contrôle étendu à tous les scripts `.mjs` |
| `node scripts/validate-corpus.mjs --json` | P0=0, P1=0 et aucun nouveau P2 | réussi — P0=0, P1=0, P2=2 historiques |
| `npm pack --dry-run --json` avec cache temporaire si nécessaire | package construit | réussi — 1.1.0, specs internes absentes ; tarball extrait et `npm test` vert |
| `git diff --check` | propre | réussi |
| dry-run puis apply sur cible temporaire | plan déterministe et ensemble d’écriture sûr | réussi — `test-upgrade` 7/7 |
| recherche des versions et instructions obsolètes | aucune surface 1.0.0 ou procédure destructive dans les guides supportés | réussi |

## Vérification de performance

- Générer en mémoire un frontmatter et un corps totalisant 10 MiB, en CRLF avec
  BOM, sans parcours disque dans la boucle mesurée.
- Exécuter trois échauffements, puis cinq mesures avec le même runtime ; retenir
  la médiane.
- Mesurer `process.memoryUsage().heapUsed` avant et après chaque exécution ; la
  hausse maximale admissible est 32 MiB.
- Budget : médiane ≤ 250 ms et aucune mesure au-delà de 500 ms. Une impossibilité
  de mesurer de façon stable est consignée comme gap, jamais déclarée réussie.

## Vérification manuelle

| Scénario | Méthode | Résultat |
|---|---|---|
| Contrat opérateur | lire ensemble le skill, `AGENTS.md`, `docs/installation.md`, le guide principal et la copie démo | réussi |
| Sortie de sync | inspecter les messages dry-run/apply et la prochaine action de migration | réussi |
| Identité de release | relire version, date, notes et exemples épinglés | réussi |

## Gaps et constats résiduels

- Node.js `18.20.8` et `25.8.1` sont tous deux couverts, y compris depuis le
  tarball npm extrait ; aucun gap de runtime supporté ne reste identifié.
- Les deux P2 du validateur sont antérieurs à ce changement, reproduits sur
  `origin/fix/foundations` (`b395794`) : en-tête non canonique de
  `doc/_indexes/by-brick.md` et champ `confidence` absent de
  `doc/_meta/agent-cache-discipline.md`.
