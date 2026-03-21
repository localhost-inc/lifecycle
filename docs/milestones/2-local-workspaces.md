# Milestone 2: "I can start a workspace and it reaches running"

> Prerequisites: M1
> Introduces: `workspace`, `environment`, and `service` entities, `Backend` + `LocalRuntime`, environment state machine
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

## Goal

User creates a local workspace, then clicks "Run" and watches its local environment progress through `idle → starting → running` with per-service health indicators.

## What You Build

1. Local workspace creation (git worktree checkout).
2. Tauri Rust backend: process supervisor for service lifecycle.
3. Docker Desktop integration for `image` runtime services.
4. Health check gate (tcp + http) → running transition.
5. Prepare step execution (sequential, exactly-once on first start).
6. Desktop app: workspace environment status display with service health indicators.

## Entity Contracts

### `workspace` (durable shell + worktree owner)

1. Purpose:
   - durable workspace identity at one ref/SHA
   - owns the worktree and provider selection
   - always scoped to a `project` — regardless of mode
2. Required fields:
   - `id`
   - `project_id`
   - `source_ref`
   - `git_sha`
   - `worktree_path` — absolute filesystem path for local workspaces; null for cloud workspaces until cloud execution lands
   - `mode` (`cloud|local`) — which `Runtime` runs this workspace
   - `created_by` (nullable — not set for local workspaces pre-auth)
   - `created_at`, `updated_at`, `last_active_at`, `expires_at`
   - `prepared_at` (nullable timestamp; set once workspace preparation has completed successfully)
   - `source_workspace_id` (nullable UUID) — if this workspace was created via fork, references the originating workspace

   - workspace display name is derived from `source_ref` (e.g., branch name `feature/auth-fix` → "auth-fix"); no separate `name` field in V1

3. Workspace invariants:
   - the workspace is the durable shell; ordinary environment up/down does not create or destroy it
   - workspace preparation durability is tracked on `workspace.prepared_at`
   - the environment state machine is authoritative for run/stop/reset/sleep/wake behavior

### `environment` (singleton execution state per workspace)

1. Purpose:
   - lifecycle state for the runnable execution layer attached to a workspace
   - typed failure metadata for the last environment failure
2. Required fields:
   - `workspace_id` (primary key, foreign key to `workspace.id`)
   - `status` (`idle|starting|running|stopping`)
   - `failure_reason` (nullable typed enum)
   - `failed_at` (nullable timestamp)
   - `created_at`, `updated_at`
3. Invariants:
   - exactly one environment row per workspace
   - environment up/down does not create or destroy the workspace shell
   - transitional environment status acts as the mutation lock for environment-scoped operations

### `service` (per-service runtime state)

1. Purpose:
   - runtime state for a single service within a workspace; extracted from embedded map to eliminate OCC contention between concurrent service updates
2. Required fields:
   - `id`
   - `environment_id`
   - `name` — key from project `lifecycle.json` environment graph for `kind: "service"` nodes
   - `status` (`stopped|starting|ready|failed`)
   - `status_reason` (nullable typed enum; required when `status=failed`)
   - `assigned_port` (nullable) — local host port assigned for the current run and reserved by the provider for that runtime session
   - `preview_url` (nullable) — runtime-owned stable preview route derived from workspace + service identity
   - `created_at`
   - `updated_at`
3. Invariants:
   - unique (`environment_id`, `name`)
   - `assigned_port` must be null when the provider is not currently holding a runtime bind for the service
   - `preview_url` is stable runtime-owned routing identity; whether it is openable is derived from runtime state, not from a separate preview status field

## Implementation Contracts

### Workspace Environment State Machine

Full transition rules: [reference/state-machines.md](../reference/state-machines.md)

M2-relevant environment semantics (local mode):

| State | `LocalRuntime` behavior |
|-------|----------------------------------|
| `idle` | Worktree is ready; services are stopped |
| `starting` | Running first-boot preparation (if needed) and starting local processes + containers |
| `running` | Health checks pass on localhost |
| `stopping` | Services are shutting down before returning to `idle` |

### `Backend` + `Runtime`

Full interface: [`/reference--workspace`](../../.skills/reference--workspace/SKILL.md)

M2 implements `Backend` + `LocalRuntime`:
- `createWorkspace`: git worktree checkout
- `startEnvironment`: run workspace preparation on first start, then spawn local processes + Docker containers
- `healthCheck`: tcp/http probes against localhost
- `stopEnvironment`: SIGTERM process group

### Health Check Contract

- Per-service `health_check` object with `kind` (`tcp` or `http`)
- Environment transitions to `running` only after all defined service health checks pass
- Full spec: [reference/lifecycle-json.md](../reference/lifecycle-json.md)

### Workspace Topology

- One workspace owns one execution environment in V1, logically mapped to one Git worktree path
- Lifecycle manages worktree create/prune to avoid branch checkout collisions

### Testing Experience Design

1. Project runtime config (`lifecycle.json`) drives execution:
   - `workspace.prepare` for filesystem-scoped first-start or every-start preparation
   - `environment` task and service nodes for runtime ordering and long-lived execution
   - fixture/seed behavior
2. Fast reset path: deterministic seed and clean state restore
3. Test-first UX: one keypath for `create -> test -> share results`
4. Output quality: real-time logs, summarized failures with links to full logs

### Reliability Baseline

1. Environment mutations use `environment.status` as the implicit lock in V1. Failed starts surface typed errors through `environment.failure_reason` and then return to `idle`. Local workspaces use SQLite transactions.
2. Workspace health checks (service readiness + probe endpoints).
3. Preparation completion is persisted via `prepared_at`, so first-boot preparation runs exactly once per workspace creation.

## Desktop App Surface

- **Workspace environment status display**: idle → starting → running progression
- **Per-service health indicators**: spinner → green checkmark
- **Prepare failures and service logs**: coarse state plus logs for debugging
- **Running state**: all services green, workspace badge "running"

## Exit Gate

- You create a workspace, then click "Run"
- Watch progress: idle → starting → running
- Each service shows health status (spinner → green checkmark)
- Prepare failures and service logs stay available for debugging
- When running, all services green, workspace badge says the environment is "running"

## Test Scenarios

```
select project → create workspace → click Run → watch idle→starting→running transitions
services with health_check show individual status progression
prepare step failure → environment returns to idle with failure reason and logs
service health check failure → environment returns to idle with failure reason and service context
stop workspace → environment transitions running→stopping→idle
```
