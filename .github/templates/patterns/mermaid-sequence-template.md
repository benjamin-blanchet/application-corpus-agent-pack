# Pattern: Mermaid Sequence Template

```mermaid
sequenceDiagram
  actor User
  participant EntryPoint
  participant ApplicationLogic
  participant DataOrExternalSystem

  User->>EntryPoint: request/action
  EntryPoint->>ApplicationLogic: validate and process
  ApplicationLogic->>DataOrExternalSystem: read/write/call
  DataOrExternalSystem-->>ApplicationLogic: result
  ApplicationLogic-->>EntryPoint: response/status
  EntryPoint-->>User: outcome
```
