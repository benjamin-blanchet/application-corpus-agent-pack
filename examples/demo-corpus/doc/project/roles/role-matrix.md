---
type: role-matrix
status: draft
confidence: unknown
source: pack
last_validated:
title: "Role Matrix"
description: "Do not assume an authorization framework."
---

# Role Matrix

| Role | Type | Capabilities | Enforcement source | Confidence |
|---|---|---|---|---|
| `<role>` | user/system/service | `<capabilities>` | `<file/config/source>` | unknown |

## Guidance

Do not assume an authorization framework. Extract roles from routes, guards, middleware, annotations, policies, templates, configuration, database seed data, tests or team input.
