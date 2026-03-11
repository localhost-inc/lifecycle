# Manifest-Owned Runtime Wiring

## Context

Kin exposed a practical gap in the local environment model: reserved Lifecycle service addresses existed, but projects still needed custom glue to push those values into app configuration.

## Decision

Use `lifecycle.json` as the wiring surface.

1. Setup steps may materialize non-secret workspace files with `write_files`.
2. Setup `env_vars` and service `env_vars` may reference reserved `LIFECYCLE_*` values directly.
3. Provider-owned runtime interpolation should handle reserved `LIFECYCLE_*` values.
4. Repo-local Lifecycle helper scripts are the wrong abstraction for ordinary environment wiring.

## Why

1. The manifest should describe the environment contract, not point to project-specific glue.
2. Reserved provider env vars are already the source of truth for local port and workspace identity assignment.
3. Direct service env wiring removes a large class of unnecessary `.env.local` materialization.
4. File materialization still exists for toolchains that require files, but it stays declarative and provider-owned.

## Milestone Impact

1. M5: makes local environment startup more self-contained and less dependent on project-specific scripting.
2. M6: keeps CLI and desktop execution aligned around the same manifest contract.

## Follow-Up

1. Extend the same interpolation rules to other manifest-owned env surfaces when they become executable in local mode.
2. Prefer direct env wiring first; use `write_files` only when a toolchain cannot consume runtime env directly.
