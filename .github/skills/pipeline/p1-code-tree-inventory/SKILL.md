---
name: p1-code-tree-inventory
category: pipeline
description: "Produce an exhaustive, machine-checkable inventory of the entire repository tree before any interpretation is attempted."
---
# Code Tree Inventory (Pass 1 / 9)

## Purpose

Produce an exhaustive, machine-checkable inventory of the entire repository tree before any interpretation is attempted.

This is the first pass of the deep code analysis pipeline (P1 → P9). Every later pass depends on this inventory and refuses to start if it is missing or marked partial.

The goal is **zero unread directory** above the exclusion list. If a directory is excluded, the exclusion must be justified in writing.

## When to use

- First step of any corpus kickstart on a primary application repository.
- After a major refactor, repository merge or module addition.
- When `doc/_meta/code-inventory.yaml` is missing, older than the last commit, or marked `partial`.

## Mandatory first reads

1. `doc/CORPUS_MAP.md`
2. `doc/CORPUS_MANIFEST.md`
3. `doc/_meta/discovery-coverage.md`
4. `doc/_meta/code-inventory.yaml` (if it exists)
5. `doc/_meta/code-pipeline-state.yaml` (if it exists)

## Required behavior

1. Run the deterministic inventory helper first:
   ```bash
   node scripts/inventory-repo.mjs
   ```
   This creates `doc/_meta/code-inventory.yaml`, `doc/_meta/code-inventory.md` and updates the P1 block in `doc/_meta/code-pipeline-state.yaml`.
2. Walk the full application repository tree from the root, depth-unbounded. The helper excludes the corpus pack itself (`doc/`, `.github/skills`, `.github/agents`, `.github/templates`) and generated/dependency trees by default, but records each exclusion with a reason.
3. For every included directory and every included file, classify it into one of the categories below.
4. Never skip a directory silently. Either inventory it or add it to the exclusion list with a reason.
5. Do not infer features, architecture or quality at this stage. Only count, classify and record.
6. Record exact counts, paths and exclusion reasons. No prose summaries until the numbers are written.
7. After the helper runs, inspect `unknown_files`, `unread_directories`, detected build systems and top-level directories. Fix classification gaps manually when needed before marking P1 `covered`.

## Classification taxonomy

Every file must be classified under exactly one bucket:

| Bucket | Examples | Notes |
|---|---|---|
| `source` | `.java`, `.ts`, `.py`, `.cs`, `.go`, `.kt`, `.rb`, `.php`, `.scala`, `.rs`, `.swift`, `.m`, `.cpp`, `.c`, `.h`, `.lua`, `.dart` | The application code. Subdivide by language and module. |
| `test` | `*test*`, `*spec*`, `__tests__/`, `tests/`, `src/test/`, `cypress/`, `playwright/` | Distinguish unit, integration, e2e, fixture when possible. |
| `ui` | `.html`, `.xhtml`, `.vue`, `.jsx`, `.tsx`, `.svelte`, `.razor`, `.cshtml`, `.fxml` | UI templates separate from logic. |
| `style` | `.css`, `.scss`, `.less`, `.styl` | Stylesheets. |
| `config_app` | `application.yml`, `*.properties`, `appsettings.json`, `bootstrap.yaml`, `web.xml`, `next.config.*`, `vite.config.*` | Runtime app config. |
| `config_build` | `pom.xml`, `build.gradle`, `package.json`, `composer.json`, `*.csproj`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile` | Build/dependency config. |
| `config_ci` | `.github/workflows/`, `Jenkinsfile*`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/`, `bitbucket-pipelines.yml`, `.drone.yml` | CI/CD config. **Each CI system found must be listed individually.** |
| `config_iac` | `Dockerfile*`, `docker-compose*`, `*.tf`, `*.tfvars`, helm charts, k8s manifests, ansible playbooks, `serverless.yml`, `Pulumi.*` | Infra/deployment. |
| `config_lint` | `.eslintrc*`, `.prettierrc*`, `checkstyle.xml`, `.editorconfig`, `tslint.json`, `pylintrc`, `.flake8`, `.rubocop.yml` | Quality/format config. |
| `data_migration` | `db/migration/*.sql`, `flyway/*.sql`, `liquibase/*.xml`, `alembic/versions/`, `prisma/migrations/` | DB schema evolution. |
| `data_seed` | seed scripts, fixtures bound to data | Distinguish from migrations. |
| `data_static` | i18n bundles, JSON/YAML data, CSV fixtures bundled with the app | |
| `proto_schema` | `*.proto`, `*.graphql`, `*.avsc`, `*.thrift`, `*.wsdl`, `*.xsd`, OpenAPI/Swagger specs | API/message contracts. |
| `script` | `scripts/`, top-level `.sh`, `.ps1`, `.bat`, `.py` outside source tree | Operational scripts. |
| `doc_repo` | `README*`, `CHANGELOG*`, `CONTRIBUTING*`, `LICENSE*`, `docs/`, `*.md` outside `doc/` | Repo-level docs (not the corpus). |
| `asset` | images, fonts, icons, audio, video, binary blobs | |
| `generated` | `target/`, `build/`, `dist/`, `out/`, `bin/`, `obj/`, `node_modules/`, `vendor/`, `__pycache__/`, `.next/`, `.nuxt/`, `coverage/` | **Default exclusion list.** Must be confirmed per-repo, not assumed. |
| `vcs_meta` | `.git/`, `.svn/`, `.hg/` | Always excluded. |
| `ide_meta` | `.idea/`, `.vscode/`, `.fleet/`, `*.iml`, `.project`, `.classpath` | Listed but not deeply scanned. |
| `corpus_pack` | `doc/`, `.github/skills/`, `.github/agents/`, `.github/templates/` | The copied agent/corpus pack. Excluded from application code inventory by default to avoid analysing the corpus as if it were app code. |
| `unknown` | Anything that does not fit | **Each entry is a coverage gap.** Must be resolved or recorded. |

## Output files

```text
doc/_meta/code-inventory.md          # human-readable summary
doc/_meta/code-inventory.yaml        # machine-readable counts and paths
doc/_meta/code-pipeline-state.yaml   # P1 marked done with timestamp and metrics
```

`scripts/inventory-repo.mjs` is the canonical generator for the first draft of these files. The agent may enrich the output, but must not replace measured counts with estimates.

### `code-inventory.yaml` schema

```yaml
inventory:
  generated_at: "YYYY-MM-DDTHH:MM:SSZ"
  repo_root_files: <int>
  total_files_inventoried: <int>
  total_directories_inventoried: <int>
  unread_directories: []          # MUST be empty before P1 can be marked covered
  excluded:
    - path: "doc"
      reason: "application corpus pack files; excluded from application code inventory"
      file_count: <int>
    - path: "node_modules"
      reason: "vendor dependency tree, not application source"
      file_count: <int>
    - path: "target"
      reason: "Maven build output"
      file_count: <int>
  by_bucket:
    source:
      total: <int>
      by_language:
        java: { files: <int>, lines: <int|unknown> }
        typescript: { files: <int>, lines: <int|unknown> }
    test:
      total: <int>
      by_kind:
        unit: <int>
        integration: <int>
        e2e: <int>
        fixture: <int>
    config_ci:
      total: <int>
      systems_found:
        - name: jenkins
          files: ["Jenkinsfile", "Jenkinsfile.release"]
        - name: github-actions
          files: [".github/workflows/build.yml", ".github/workflows/release.yml"]
    # ... one entry per bucket
  unknown_files: []               # MUST be empty or each entry justified
modules:
  - path: "app/"
    type: "monolith|module|package|library|app"
    primary_language: "java"
    file_count: <int>
    has_tests: true|false
    notes: ""
build_systems_detected: []        # ["maven", "gradle", "npm", ...]
package_managers_detected: []
languages_detected: []            # sorted by file count
top_level_directories:
  - name: "src"
    classification: "source"
    file_count: <int>
  - name: ".github"
    classification: "config_ci"
    file_count: <int>
```

## Coverage targets (gate for P1 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Directories walked vs. directories existing | 100% (excluding `vcs_meta`) | yes |
| Files classified vs. files walked | 100% | yes |
| `unknown` bucket count | 0 (or each entry justified in `unknown_files`) | yes |
| `unread_directories` length | 0 | yes |
| Excluded paths with reason | 100% of excluded entries have a reason string | yes |
| CI systems enumerated | every distinct CI system file found is listed (no "and others") | yes |
| Build systems enumerated | every distinct build manifest type listed | yes |

A pass with `unread_directories: []` empty AND `unknown` resolved is `covered`. Anything less is `partial` and **blocks P2**.

The validator cross-checks `total_files_inventoried` against the current filesystem using the same default exclusions. If the inventory is stale or hand-written with inconsistent metrics, P1 is not accepted as a reliable gate.

## Reconciliation duties

If multiple competing artefacts of the same kind are found, record **all of them** in `code-inventory.yaml`. Do not pick one. Examples:

- `Jenkinsfile` AND `.github/workflows/*.yml` → list both, do not silently prefer one.
- `pom.xml` AND `build.gradle` → list both.
- `package-lock.json` AND `yarn.lock` AND `pnpm-lock.yaml` → list all three.
- Two Dockerfiles in different paths → list both.

A summary line in `code-inventory.md` must call out the contradiction. P9 (`pipeline/p9-code-reconciliation-gate`) will resolve it later, but it must be visible from P1.

## Stop conditions / blocking questions

If during inventory you encounter:

- a directory you cannot read (permissions, symlink loop) → record it in `unread_directories` and ask via `governance/blocking-question-loop`;
- a binary tree of unknown nature larger than 10 MB → ask the operator before excluding;
- a checked-in `node_modules`, `vendor` or `target` directory → ask the operator before excluding (it may be intentional in some legacy repos);
- an unclassifiable file extension that appears more than 10 times → ask the operator what it is.

## Status update

When P1 finishes, update `doc/_meta/code-pipeline-state.yaml`:

```yaml
pipeline:
  p1_tree_inventory:
    status: covered|partial|blocked
    last_run: "YYYY-MM-DDTHH:MM:SSZ"
    files_inventoried: <int>
    unread_directories: <int>
    unknown_files: <int>
    blocks_next_pass: true|false
```

And update `doc/_meta/discovery-coverage.md` repository row with the concrete counts (files, directories, exclusions, CI systems).

## Anti-patterns

Do not:

- write a "high-level architecture" paragraph at this stage;
- hand-write inventory counts when `scripts/inventory-repo.mjs` can measure them;
- pick one CI system and ignore the others;
- exclude large directories without recording the reason;
- skip classification of a file because "it does not matter";
- mark P1 covered while `unread_directories` is non-empty;
- proceed to P2 if P1 is `partial` or `blocked`.
