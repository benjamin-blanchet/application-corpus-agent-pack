---
name: feature-folder-creation
category: authoring
description: "Create or normalize a feature folder under `doc/project/features/<feature>/`."
---
# Feature Folder Creation

## Purpose

Create or normalize a feature folder under `doc/project/features/<feature>/`.

## Standard structure

```text
README.md
ARCHITECTURE.md
WORKFLOWS.md
BUSINESS_RULES.md
OPERATIONS.md
AI_AGENT_GUIDE.md
```

## Rules

- Create a folder only when the feature has enough evidence to be useful.
- Use stack-neutral labels until concrete files prove the stack.
- `OPERATIONS.md` is mandatory for production-critical features and optional only if the feature has no known production behavior yet.
- Link known bugs and risks rather than duplicating their full content.
- Update `doc/_indexes/by-feature.md`.
- Update `doc/_meta/coverage-matrix.md`.

## Templates

Use `.github/templates/feature-folder/`.
