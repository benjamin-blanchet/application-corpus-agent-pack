---
name: environment-discovery
category: development
description: "Derive durable application environment and CI contracts from repository/runtime evidence so build, start, health, reset and acceptance are reproducible without persisting local tool availability or secrets."
---

# Environment and CI Discovery

## Purpose

Fill the software-factory environment and CI templates from code, build files,
workflows, runtime configuration and operator-confirmed facts. The result says
what an application needs to run and test; it does not claim that this session
currently has those capabilities.

## Evidence order

Inspect package/build descriptors, container/compose files, scripts, CI
workflows, configuration examples and existing test setup before asking the
operator. Use `unknown` with a blocking question when no ranked source answers.
Never copy a credential, cookie or workstation-specific absolute path.

## Required contract

For each local, preview or shared non-production profile record:

- prerequisites and declared build/start/health/stop/reset operations;
- endpoint and revision probe tied to the candidate SHA;
- required dependencies and readiness/schema checks;
- automated-compatible auth actor type and secret references only;
- dataset identity, isolation, seed/cleanup and mutation policy;
- network allowlist and known limitations.

The CI contract names operations, required checks, permissions, subject
revision, protected secret-bearing jobs, artefact retention and flaky policy.
A shared environment without revision/dataset identity cannot prove a change.

## Preflight

Runtime observations belong to a run output, never back into the durable
contract as “available now”. A missing required dependency blocks before any
browser or mutation starts. Interactive authentication cannot be labelled
unattended automation.
