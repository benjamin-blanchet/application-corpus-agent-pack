---
name: p6-code-style-naming
category: pipeline
description: "Extract the **actual** code conventions of the repository — not the conventions a linter pretends to enforce, not the conventions the official guide mentions. The truth on disk."
---
# Code Style & Naming (Pass 6 / 9)

## Purpose

Extract the **actual** code conventions of the repository — not the conventions a linter pretends to enforce, not the conventions the official guide mentions. The truth on disk.

A new contributor (human or agent) must be able to read this output and write code that looks like it belongs.

## Prerequisite

`p5_cross_cutting_extraction.status == covered`.

## Mandatory first reads

1. `doc/_meta/code-inventory.yaml`
2. `doc/_meta/logical-boundaries.yaml`
3. `doc/_meta/feature-candidates.yaml`
4. All `config_lint` files from P1 (`.eslintrc*`, `.prettierrc*`, `checkstyle.xml`, `.editorconfig`, etc.)
5. Any `STYLE`, `CONVENTIONS`, `CONTRIBUTING.md` files in the repo
6. The 6 feature folders documented by P4 (sample for naming consistency)

## Required behavior

1. Read the lint/format config first. Record what it enforces.
2. Sample code across **every layer of every module** (P2 layer taxonomy + P5 catalogs) to detect what is actually done.
3. Where lint config and code disagree, record the **discrepancy**. Do not assume the lint wins.
4. Call out conventions that are **invisible to lint** but consistent in code (much more valuable to document).
5. Distinguish "convention" (followed > 80% of the time with evidence) from "common pattern" (50–80%) from "inconsistent" (< 50%).

## Dimensions to extract

### Naming conventions

For each layer/role found in P2, sample at least 10 representative files (or all if fewer) and record:

| Dimension | Examples |
|---|---|
| File names | `kebab-case`, `PascalCase`, `snake_case`, mixed |
| Class / type names | `PascalCase`, suffix conventions (`*Controller`, `*Service`, `*Repository`, `*Dto`, `*Entity`, `*Mapper`, `*Handler`, `*Listener`) |
| Interface vs. implementation | `Foo` + `FooImpl`? `IFoo` + `Foo`? Single concrete class? |
| Method names | `camelCase`, `snake_case`, verb prefixes (`get`/`fetch`/`load`/`find`), boolean naming (`is*`, `has*`, `can*`) |
| Variable names | abbreviations tolerated? `i`/`j` for loops? `x`, `y` allowed? |
| Constant names | `UPPER_SNAKE_CASE`, `PascalCase` |
| Package / module / namespace | `com.company.product.layer.feature`? Feature-first? Layer-first? |
| DTO naming | `*Request` / `*Response`? `*Dto` everywhere? Versioned (`*V2`)? |
| DB naming (tables, columns) | `snake_case`, plural/singular tables, `tbl_` prefix? Audit columns naming? |
| Test naming | `should_<behavior>`, `test_<method>`, `<Method>_<scenario>_<expected>`, `given_when_then` |
| Branch / commit naming (if Git logs read) | conventional commits? feature/<id>-<slug>? |

### Structural conventions

| Dimension | What to record |
|---|---|
| One class per file? | yes / no, exceptions |
| File header / license banner | required? format? |
| Import ordering | grouped? alphabetic? framework-first? |
| Wildcard imports | allowed? avoided? |
| Visibility | default visibility used? `public` everywhere? package-private intentionally? |
| Constructor injection vs. setter vs. field | which pattern dominates per layer? |
| Builder pattern usage | which kinds of objects use it? |
| Optional/Maybe usage | `Optional<T>` returns? nullables tolerated? `@Nullable` annotations? |
| Immutability | records? `final` everywhere? mutable POJOs? |
| Exception strategy | checked vs. unchecked, custom hierarchy, sentinel exceptions |
| Logging | which logger? structured vs. printf? log levels conventions? |
| Comments and docstrings | Javadoc on public API? inline comments style? TODO format? |
| Test structure | AAA? `@Nested`? fixtures location? mocks library? |

### Per-layer style sheets

Produce one section per layer (presentation, application, domain, infrastructure, cross-cutting) with:

- "Files in this layer typically look like…"
- A **canonical example file** chosen from the repo (cited path).
- The **anti-example** if a clear inconsistency exists (cited path).
- Conventions the layer enforces that other layers do not.

## Output files

```text
doc/project/technical/CODE_STYLE.md           # global style observations
doc/project/technical/NAMING_CONVENTIONS.md   # naming truth table
doc/project/technical/style-by-layer.md       # per-layer style sheets
doc/_meta/code-style-state.yaml               # machine-readable summary
doc/_meta/code-pipeline-state.yaml            # P6 status
```

### `code-style-state.yaml` schema

```yaml
lint_config:
  files: []                          # from P1 config_lint
  enforces:
    - rule: "indent: 4 spaces"
      enforced_by: ".editorconfig"
      respected_in_practice: true|false|partial
discrepancies:
  - rule: "checkstyle: max line length 120"
    actual: "many files exceed 200"
    sample_offenders: ["path/to/file.java", "..."]
naming_conventions:
  classes:
    rule: "PascalCase + suffix per role"
    confidence: "convention|common|inconsistent"
    suffix_map:
      controller: "*Controller"
      service: "*Service"
      repository: "*Repository|*DAO"
      dto: "mixed: *Dto, *Request, *Response"
  methods: { ... }
  packages: { ... }
  db_tables: { rule: "UPPER_CASE singular", confidence: "convention" }
structural_conventions:
  injection: "constructor (Spring @Autowired on fields in legacy modules)"
  exceptions: "custom RuntimeException hierarchy under com.example.exception"
  logging: "SLF4J + Logback, levels: DEBUG/INFO/WARN/ERROR"
per_layer:
  presentation:
    canonical_example: "..."
    notes: ""
  application:
    canonical_example: "..."
    notes: ""
unwritten_rules:
  - "All listeners catch and log; never propagate (evidence: 5/5 files in doclistener.bo)"
  - "Repositories return null, not Optional (evidence: myapp-lib DAOs)"
```

## Coverage targets (gate for P6 → covered)

| Metric | Target | Hard gate |
|---|---|---|
| Each layer from P2 has a style section | 100% | yes |
| Naming conventions table covers every dimension listed above | 100% | yes |
| Lint config files all read and reflected in `lint_config` | 100% | yes |
| Discrepancies between lint and code listed (or empty array justified) | yes | yes |
| At least 5 unwritten rules captured (or explicit "none found" with reason) | yes | yes |
| Each per-layer section cites a canonical example | 100% | yes |

## Blocking questions

Use `governance/blocking-question-loop` for:

- Two clearly competing styles in the same layer — ask which is the **target**.
- An unwritten rule that looks accidental — ask if it is intentional.
- A naming convention with three variants — ask which is preferred for new code.

## Status update

```yaml
pipeline:
  p6_code_style_naming:
    status: covered|partial|blocked
    last_run: "..."
    layers_covered: <int>
    discrepancies_recorded: <int>
    unwritten_rules_captured: <int>
    blocks_next_pass: true|false
```

## Anti-patterns

Do not:

- copy the official style guide and call it done;
- trust the lint config without checking the code;
- describe the framework's defaults instead of the repo's actual habits;
- write style observations without file:line evidence;
- ignore "small" inconsistencies — they are the most useful to flag.
