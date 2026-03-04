# SLOs and Operational Limits

Service level objectives, operational limits, and cold-start performance budgets.

## SLO Targets

### `CloudWorkspaceProvider`

- p95 workspace create to `ready`: <= 60 seconds
- p95 workspace wake from sleeping: <= 15 seconds
- p95 project `setup` phase duration: <= 30 seconds
- p95 service startup to healthy: <= 45 seconds
- log stream event latency: <= 2 seconds p95
- control-plane availability (Convex): 99.9% monthly
- p95 preview route reconcile after healthy service restart: <= 5 seconds

### `LocalWorkspaceProvider`

- p95 workspace create to `ready`: <= 30 seconds (no sandbox provisioning)
- p95 workspace wake from sleeping: <= 5 seconds (just restart processes)
- p95 service startup to healthy: <= 45 seconds (app-dependent, same as cloud)
- desktop app responsiveness: p95 local state update <= 100ms, p95 Convex sync (when signed in) <= 3 seconds

## Limits

- Max active workspaces per user: 5 (default policy)

## Cleanup Defaults

- TTL default: 24 hours
- Daily sweeper enforces expiration and marks final audit event
- Raw usage event retention: 13 months

## Cold-Start Budget

### Cloud Time Budget

Step-by-step time budget for the canonical `lifecycle.json` (Postgres + Redis + Bun app):

| Step                                        | First-ever p95 | Warm-cache p95 |
| ------------------------------------------- | -------------- | -------------- |
| Sandbox provisioning                        | 15s            | 6s             |
| Git clone + Docker pulls + setup (parallel) | 45s            | 12s            |
| Service startup + health checks             | 12s            | 12s            |
| **Total with 30% margin**                   | **~94s**       | **~39s**       |

### Cloud Parallelization DAG

1. Sandbox provisioning runs first (blocking).
2. After sandbox is ready, these run in parallel:
   - Git clone / worktree checkout
   - Docker image pulls (all services)
   - Dependency cache restore from R2
3. After clone + cache restore complete: run `setup` steps (sequential).
4. After setup + Docker pulls complete: start services.
5. After services start: run health checks (parallel per service).

### Cloud Pre-Warming Investment Priority (ordered by impact)

1. **Dependency cache in R2** (keyed by lockfile hash) — saves 15-35s on first-ever create.
2. **Pre-baked Docker images in sandbox base image** — saves 10-18s by eliminating cold pulls for common images (postgres, redis).
3. **Git repo cache in R2** — saves 5-10s for large repositories (shallow clone from cached bare repo).
4. **Warm sandbox pool** — evaluate cost vs benefit for V1; pre-provisioned sandboxes could eliminate the 6-15s provisioning step entirely.

### Cloud Assessment

The 60-second SLO is tight. The warm-cache path (~39s) clears it comfortably, but first-ever cold creates (~94s) will exceed it without investment. **Dependency caching (R2, keyed by lockfile hash) and pre-baked Docker images are required for launch, not optional optimizations.** Target: **p95 <= 60s cold, p95 <= 30s warm**. The warm-cache path is the steady-state experience for active teams.

### Local Time Budget

Step-by-step time budget for the canonical `lifecycle.json` (Postgres + Redis + Bun app) on `LocalWorkspaceProvider`:

| Step                                        | First-ever p95 | Warm-cache p95 |
| ------------------------------------------- | -------------- | -------------- |
| Git worktree create                         | 2s             | 2s             |
| Docker pulls + setup (parallel)             | 30s            | 5s             |
| Service startup + health checks             | 12s            | 12s            |
| **Total with 30% margin**                   | **~57s**       | **~25s**       |

### Key Differences from Cloud

1. **No sandbox provisioning** — eliminates the 6-15s blocking step entirely.
2. **No R2 round-trips** — dependencies are cached locally on disk.
3. **Docker image cache is persistent** — Docker Desktop retains pulled images across workspace lifecycles.
4. **Wake is near-instantaneous** — no backup/restore. SIGTERM → restart processes. Target: **p95 <= 5s**.

### Local Assessment

The 30-second SLO is comfortable. First-ever cold creates are dominated by Docker pulls (one-time cost per image). Steady-state warm creates are well under budget. No pre-warming investment is required for local — the user's own machine provides the cache.
