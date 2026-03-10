# Workspace Manifest Migration And Fingerprint

Date: 2026-03-10

## Context

We needed the Environment rail to know declared services before first run and to stay honest when `lifecycle.json` changes while a workspace is already running.

## Learning

Two constraints emerged:

1. `workspace_service` should be seeded from the manifest at workspace creation time, not invented only on first `Run`.
2. Manifest drift for a running workspace cannot be derived reliably from service rows alone. We need a persisted applied-manifest fingerprint on `workspace`.

This also exposed that the previous database bootstrap path was not a real migration system. Schema changes were being handled through startup-time column guards. For a product surface that will accumulate local state over time, additive schema changes need numbered migrations plus a ledger of applied versions.

## Decision

- Introduce a versioned `schema_migration` table and run numbered SQL migrations in order.
- Persist `workspace.manifest_fingerprint` as the last applied manifest fingerprint.
- Reconcile `workspace_service` rows immediately for sleeping or failed workspaces when `lifecycle.json` changes.
- Treat manifest changes for running workspaces as restart-required, not hot-applied environment mutation.
- Do not carry compatibility logic for pre-migration local schemas; reset those development databases instead.

## Milestone Impact

- Supports M5 workspace lifecycle semantics by separating declared environment shape from live environment state.
- Unblocks honest pre-run service registration in the Environment rail.

## Follow-up

- Add explicit UI treatment for manifest-invalid running workspaces beyond the current rail notice.
- Revisit setup execution so manifest changes that alter setup requirements can trigger the right setup cadence instead of relying on one-time completion.
