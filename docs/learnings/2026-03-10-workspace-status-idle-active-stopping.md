# Workspace Status Should Model Environment, Not Every Outcome

Date: 2026-03-10

## Context

The local workspace runtime had accumulated too many `workspace.status` values: `creating`, `sleeping`, `ready`, `resetting`, `destroying`, and `failed` all mixed durable workspace concerns with environment runtime concerns. That made restart logic, mutation locking, and UI interpretation harder than they needed to be.

## Learning

Workspace status only needs to describe the singleton environment attached to the workspace:

1. `idle`
2. `starting`
3. `active`
4. `stopping`

Failure is not its own terminal state. A failed start attempt returns the workspace to `idle` and carries error context through `failure_reason` and `failed_at`.

This keeps the state machine small:

1. `idle -> starting -> active`
2. `active -> stopping -> idle`
3. `starting -> stopping` for aborts
4. `starting -> idle` for failures

## Decision

- Keep `workspace.status` limited to `idle|starting|active|stopping`.
- Model failed starts as `idle + failure_reason`.
- Make shutdown explicit with a visible `stopping` state before returning to `idle`.
- Keep `workspace_service.status` and `workspace_service.preview_status` separate from workspace status.

## Milestone Impact

- M4: clarifies the local environment contract around explicit start/stop behavior and mutation locking.
- M5: gives CLI status and lifecycle commands a smaller, easier-to-explain state model.

## Follow-up

- When the workspace/environment split lands, keep these four values for the environment state machine instead of reintroducing historical workspace-specific terms.
- Continue treating preview state as a separate per-service contract even for local workspaces.
