# Reference — source discipline

Applies across every procedure of `production-discovery`.

- Do not invent service names, environment names, dashboards, DQL fields, SQL schemas, API fields or query syntax.
- Use only verified connected sources, existing repository evidence or explicit human input.
- For Dynatrace MCP, run `sources/runtime-source-probe` first. Treat the result as a point-in-time observation and do not mark the durable source absent because this runtime lacks the capability.
- If Dynatrace is expected but not attached, stop Dynatrace-backed discovery and report the exact setup gap.
- Record the exact source, query, filter, environment and time window for each finding.
- Distinguish runtime signals from root causes.
- Distinguish facts, hypotheses and unknowns.
- Use `confidence: confirmed` only when the observation is directly supported by source evidence.
