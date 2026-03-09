# Milestone 7: "Cloud workspaces have full lifecycle with TTL enforcement"

> Prerequisites: M6
> Introduces: cloud sleep/wake (R2), cloud destroy, TTL enforcement, org quotas
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

## Goal

Cloud workspaces get the same lifecycle depth as local: sleep, wake, and destroy -- plus production hardening with TTL enforcement and org-level quotas.

## What You Build

1. Cloud sleep: R2 backup of worktree filesystem, terminate sandbox.
2. Cloud wake: provision new sandbox, restore from R2, re-run service startup (skip setup/clone).
3. Cloud destroy: terminate sandbox, revoke credentials, clean metadata.
4. TTL enforcement: 24-hour default, daily sweeper, audit events on expiration.
5. Org quotas: max active workspaces per organization.

## Implementation Contracts

### Workspace Persistence Contract (Cloud)

**Mental model:** A Lifecycle workspace is a reproducible environment with optional hibernation, not a persistent VM. Every wake is a partial reconstruction. Reproducibility > persistence.

Part of `WorkspaceProvider.sleep()` / `.wake()`.

#### `CloudWorkspaceProvider` Persistence

What survives sleep:

| Resource                            | Survives sleep? | Mechanism                                   |
| ----------------------------------- | --------------- | ------------------------------------------- |
| Filesystem / worktree               | Yes             | R2 backup/restore                           |
| Git uncommitted changes             | Yes             | Auto-stash before sleep + filesystem backup |
| Dependency cache                    | Yes             | Separate R2 backup by lockfile hash         |
| Docker images                       | No              | Re-pull or restore from R2 cache on wake    |
| Docker volumes (e.g. Postgres data) | No (default)    | Re-seed on wake; opt-in backup for V2       |
| Running processes                   | No              | All services restart on wake                |
| Workspace metadata                  | Yes             | Stored in Convex                            |

Sleep/wake contract:

1. Sleep: back up worktree filesystem to R2. Terminate sandbox. Record `sleeping` state.
2. Wake: provision new sandbox, restore worktree from R2, re-run service startup (pull/start/health-check). Skip `setup` and `git clone`.
3. Docker data is NOT backed up in V1. Wake re-seeds if reset behavior is configured; otherwise services start with empty volumes.

#### Wake vs Reset (Cloud)

- **Wake** = restore "where you left off." Filesystem preserved (R2 restore), all services restarted, no re-seed. Skips `setup` and `git clone`.
- **Reset** = restore "known-good baseline." Filesystem reset to post-setup state, data re-seeded, services restarted.

#### Open Questions (Cloud)

1. Backup/restore performance at scale -- 500MB worktree vs 2GB worktree R2 round-trip times.
2. Docker-in-Docker state after R2 restore -- does `dockerd` recognize restored image layers, or must images be re-pulled?
3. Sandbox provisioning latency distribution -- no published p50/p95 from Cloudflare for cold sandbox spin-up.
4. R2 egress costs for frequent wake operations -- need cost model for teams with 20+ daily wake cycles.

### Destroy Flow (Cloud)

- Terminate sandbox, revoke credentials, clean metadata
- Workspace `destroy` hard-terminates any non-finished/non-failed terminal

### TTL Enforcement

- TTL default: 24 hours
- Daily sweeper enforces expiration and marks final audit event
- Raw usage event retention: 13 months

### Org Quotas

- Max active workspaces per organization
- Quota enforcement at workspace creation time
- Convex OCC handles serialization natively

### SLOs

Full SLO targets: [reference/slos.md](../reference/slos.md)

Key M7 targets:
- p95 workspace wake from sleeping: <= 15s (cloud)
- p95 workspace create to `ready`: <= 60s (cloud)

## Desktop App Surface

- **Cloud sleep/wake indicators**: "sleeping" badge on cloud workspace, auto-wake on click
- **Sleeping workspace preview**: "waking workspace" response instead of 404
- **Quota warnings**: indicator when approaching org workspace limit

## Exit Gate

- Cloud workspace ready -> idle timeout -> sleeps automatically -> click -> wakes -> ready
- Cloud destroy -> confirmation dialog -> confirm -> sandbox terminated, credentials revoked, metadata cleaned
- Stale cloud workspaces auto-cleaned by TTL sweeper
- Org quota enforced: creating workspace beyond limit returns typed error

## Test Scenarios

```
cloud workspace ready -> idle timeout -> sleeps -> R2 backup created -> sandbox terminated
cloud workspace sleeping -> wake -> new sandbox provisioned -> R2 restore -> services start -> ready
cloud workspace sleeping -> preview URL visited -> "waking workspace" page shown -> workspace wakes
destroy cloud workspace -> confirmation -> sandbox terminated -> credentials revoked -> metadata cleaned
cloud workspace idle 24h -> TTL sweeper -> auto-destroyed -> audit event logged
org at quota limit -> create workspace -> quota_exceeded error
```
