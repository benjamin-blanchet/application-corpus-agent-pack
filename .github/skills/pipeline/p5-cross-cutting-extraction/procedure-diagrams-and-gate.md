# Procedure — P5 diagrams and completion gate

## Mandatory diagrams

Generate at least five implementation diagrams from code, migration and
configuration evidence at the analyzed revision:

1. `diagrams/integration-context.md`: application, every neighbor, direction,
   protocol and contract.
2. `diagrams/integration-flow.md`: at least one sequence diagram for a major
   canonical integration, citing its entry point.
3. `diagrams/messaging-topology.md`: producers, topics/queues, consumers, DLQs
   and retries for every broker.
4. `diagrams/domain-er.md`: entities, migration-backed relations and
   cardinalities, split by bounded context when needed.
5. `diagrams/persistence.md`: engines, schemas, grouped tables, caches,
   replicas/search and evidenced pool configuration.

Use inline Mermaid, `type: diagram`, `source: code`, and a legend linking each
diagram to its catalog/state evidence. External diagrams remain dated
intent/history links, not imported implementation shapes.

## State schema

`doc/_meta/cross-cutting-state.yaml` records totals and documented counts for
API endpoints, domain entities/tables, integrations by direction/contracts,
messaging producers/consumers/DLQs/ordering, persistence engines/migrations,
and the auth/observability/feature-flag stacks. Record entity/table and other
discrepancy lists explicitly for P9.

## Hard coverage gate

P5 is covered only when:

- every P3 API entry point is in the API catalog;
- every entity class and migration table is in the domain catalog;
- every external client/topic/queue is in integration or messaging catalogs;
- every cross-cutting concern is documented or evidenced as absent;
- every discrepancy is recorded for P9;
- all applicable diagrams above exist.

Use `governance/blocking-question-loop` for unresolved consumers, persistence
ambiguity, unused external hosts and infrastructure-managed authentication.

Update `p5_cross_cutting_extraction` with status, last run, completed catalogs,
discrepancy count and whether it blocks P6. Do not proceed with missing global
catalog coverage or unrecorded discrepancies.
