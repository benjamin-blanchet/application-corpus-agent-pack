---
name: dynatrace-exploration
category: exploration
description: "Use Dynatrace / APM observability data when available. Read `doc/mcp/dynatrace.md` first, record exact queries/filters, and distinguish signals from root causes."
---
# Dynatrace Exploration

## Purpose

Use Dynatrace / APM observability data when available. Read `doc/mcp/dynatrace.md` first, record exact queries/filters, and distinguish signals from root causes.

For kickstart-time runtime state review, combine this skill with `exploration/production-discovery`. For deep production architecture, ecosystem and inbound/outbound flow mapping, use `exploration/dynatrace-runtime-architecture`.

## Canonical paths

- Corpus root: `doc/`
- Metadata: `doc/_meta/`
- Indexes: `doc/_indexes/`
- Project knowledge: `doc/project/`
- Production knowledge: `doc/prod/`
- Specs: `doc/spec/`
- Connected source references: `doc/mcp/`

## Required behavior

1. Read `doc/CORPUS_MAP.md` before creating or moving corpus content.
2. Use `doc/CORPUS_MANIFEST.md` for conventions.
3. Do not assume the technology stack; detect it from repository evidence.
4. Distinguish facts, hypotheses and unknowns.
5. Use frontmatter metadata for important corpus files.
6. Update indexes when canonical files are created or renamed.
7. Record unresolved questions in `doc/_meta/open-questions.md`.
8. Reconcile affected files instead of appending contradictions.

## Stack-neutral detection hints

Look for package/build/config files and entry points such as:

- `package.json`, `pnpm-lock.yaml`, `angular.json`, `vite.config.*`, `next.config.*`
- `composer.json`, `artisan`, `symfony.lock`, PHP route/config files
- `pom.xml`, `build.gradle`, `src/main`, Java/Kotlin package structure
- `.csproj`, `.sln`, `Program.cs`, `.fsproj`
- `requirements.txt`, `pyproject.toml`, `manage.py`, `app.py`
- Dockerfiles, compose files, CI pipelines, deploy manifests
- route definitions, controllers, handlers, consumers, jobs, scripts, migrations and tests

## Output discipline

Prefer small canonical files and indexes over large monolithic documents.


## Kickstart discovery support

When used during corpus kickstart, this skill should help answer the production discovery questions without inventing fields or service names:

- which monitored entities seem to correspond to this repository;
- which environments are visible;
- which services/processes/hosts/jobs are active;
- which upstream callers, downstream dependencies, external systems, databases, queues and gateways surround the product;
- which inbound and outbound flows are visible over 24h, 7d and 30d windows;
- which error, latency, saturation or restart signals are visible;
- which signals deserve `watchlist`, `known-bugs`, `structural-risks` or `root-cause-playbooks` entries.

Always save reusable, verified query patterns back into `doc/mcp/dynatrace.md`.
