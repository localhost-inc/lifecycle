# Idle Service Effective Port Reconciliation

Superseded in part by `2026-03-17-runtime-ports-are-start-assigned.md`.

## What changed

The earlier fix stopped blindly preserving an existing `assigned_port` for idle rows.
The current contract goes further: idle reconciliation clears runtime-only port state entirely, and start-time assignment picks a viable port for the next run.

## Why it mattered

Kin exposed a bad local-runtime behavior:

1. a workspace-owned image service such as Postgres was assigned `5432`
2. that workspace later became idle or failed
3. another process claimed `5432`
4. Lifecycle still treated the stale `assigned_port` as reusable
5. Docker then failed at container start with a port conflict

That broke the product promise that each local workspace can own an isolated environment without stale runtime port state leaking across boots.

## Milestone impact

- M5: local workspace lifecycle startup is more reliable for image services and better matches the runtime-only `assigned_port` contract.

## Follow-up

1. Keep retry behavior simple: assign runtime ports during start instead of adding ad hoc container-start retry loops.
2. Preserve the rule that only currently running services may keep an `assigned_port` across in-memory operations.
