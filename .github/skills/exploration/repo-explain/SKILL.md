---
name: repo-explain
category: exploration
description: "Provide a technical repository-orientation capability that can be used by any human-facing agent before acting."
---
# Repository Orientation

## Purpose

Provide a technical repository-orientation capability that can be used by any human-facing agent before acting.

This is a skill, not a user-facing agent. It helps an agent understand where it is working, which stack is present, where relevant files are likely to live, and which corpus areas should be read or updated.

## When to use

Use this skill when:

- the repository structure is unfamiliar;
- the stack or framework is unclear;
- the user asks where something lives;
- an agent needs to identify likely entry points before spec writing, implementation, incident analysis or corpus enrichment;
- the repository may be primary, secondary, library, frontend-only, backend-only, batch-only, infra-only or mixed.

## Canonical reads

1. `doc/_meta/app-profile.yaml`
2. `doc/CORPUS_MAP.md`
3. `doc/CORPUS_MANIFEST.md`
4. `doc/_meta/source-inventory.md` when available
5. Relevant indexes under `doc/_indexes/`

## Stack-neutral detection hints

Look for package, build, framework, deployment and test files such as:

- `package.json`, `pnpm-lock.yaml`, `angular.json`, `vite.config.*`, `next.config.*`
- `composer.json`, `artisan`, `symfony.lock`, PHP route/config files
- `pom.xml`, `build.gradle`, `src/main`, Java/Kotlin package structure
- `.csproj`, `.sln`, `Program.cs`, `.fsproj`
- `requirements.txt`, `pyproject.toml`, `manage.py`, `app.py`
- Dockerfiles, compose files, CI pipelines, deployment manifests
- route definitions, controllers, handlers, consumers, jobs, scripts, migrations and tests

## Output contract

Return a compact orientation note with:

```text
Repository role:
Detected stack:
Main entry points:
Likely source directories:
Tests:
Configuration/deployment:
Relevant corpus files:
Unknowns / assumptions:
Suggested next agent action:
```

## Rules

- Do not modify application source code.
- Do not create durable corpus files unless the calling agent explicitly requests corpus capture.
- Do not assume a technology stack from naming alone; cite repository evidence.
- Distinguish fact, hypothesis and unknown.
- If durable knowledge is discovered, propose capture through `Corpus` using `governance/corpus-update` or `authoring/knowledge-capture`.
- If the repo is secondary or a library, do not claim application-wide authority.
