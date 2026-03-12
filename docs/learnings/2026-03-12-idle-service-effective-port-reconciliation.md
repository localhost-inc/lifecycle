# Idle Service Effective Port Reconciliation

## What changed

Workspace service reconciliation no longer blindly preserves an existing `effective_port` just because the row already has one.

If a workspace is idle and a service row is `stopped` or `failed`, Lifecycle now re-checks host port availability and assigns the next collision-free port when the old one is busy. Only active or starting services keep their currently bound port without revalidation.

## Why it mattered

Kin exposed a bad local-runtime behavior:

1. a workspace-owned image service such as Postgres was assigned `5432`
2. that workspace later became idle or failed
3. another process claimed `5432`
4. Lifecycle still treated the stale `effective_port` as reusable
5. Docker then failed at container start with a port conflict

That broke the product promise that each local workspace can own an isolated environment with stable but collision-free host ports.

## Milestone impact

- M5: local workspace lifecycle startup is more reliable for image services and better matches the documented `effective_port` contract.

## Follow-up

1. Keep retry behavior simple: reconcile idle rows onto a free port before start instead of adding ad hoc container-start retry loops.
2. If we later support manifest sync while active for more cases, preserve the rule that only currently running services may keep an unavailable `effective_port`.
