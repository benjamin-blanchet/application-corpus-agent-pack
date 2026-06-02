# Pattern: Component Overview Block

Use in `ARCHITECTURE.md` to give a fast, stack-neutral orientation.

```text
<feature>
  ├── <entry point>              -> receives requests/events/jobs
  ├── <application logic>        -> orchestrates behavior
  ├── <domain/data model>        -> represents business state
  ├── <persistence/integration>  -> stores or exchanges data
  └── <async/background part>    -> optional worker/job/consumer
```

Keep it focused on the main moving parts. Detailed mappings go in tables.
