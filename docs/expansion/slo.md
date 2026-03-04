# Cold-Start Budget

> **Deprecated**: This content has been consolidated into [`../reference/slos.md`](../reference/slos.md), which includes both SLO targets and cold-start budgets. This file is kept for reference but should not be updated.

Engineering notes for workspace creation performance.

## Cloud Time Budget

Step-by-step time budget for the canonical `lifecycle.json` (Postgres + Redis + Bun app):

| Step                                        | First-ever p95 | Warm-cache p95 |
| ------------------------------------------- | -------------- | -------------- |
| Sandbox provisioning                        | 15s            | 6s             |
| Git clone + Docker pulls + setup (parallel) | 45s            | 12s            |
| Service startup + health checks             | 12s            | 12s            |
| **Total with 30% margin**                   | **~94s**       | **~39s**       |

## Parallelization DAG

1. Sandbox provisioning runs first (blocking).
2. After sandbox is ready, these run in parallel:
   - Git clone / worktree checkout
   - Docker image pulls (all services)
   - Dependency cache restore from R2
3. After clone + cache restore complete: run `setup` steps (sequential).
4. After setup + Docker pulls complete: start services.
5. After services start: run health checks (parallel per service).

## Pre-Warming Investment Priority (ordered by impact)

1. **Dependency cache in R2** (keyed by lockfile hash) — saves 15-35s on first-ever create.
2. **Pre-baked Docker images in sandbox base image** — saves 10-18s by eliminating cold pulls for common images (postgres, redis).
3. **Git repo cache in R2** — saves 5-10s for large repositories (shallow clone from cached bare repo).
4. **Warm sandbox pool** — evaluate cost vs benefit for V1; pre-provisioned sandboxes could eliminate the 6-15s provisioning step entirely.

## Assessment (Cloud)

The 60-second SLO is tight. The warm-cache path (~39s) clears it comfortably, but first-ever cold creates (~94s) will exceed it without investment. **Dependency caching (#1) and pre-baked Docker images (#2) are required for launch, not optional optimizations.** Target: **p95 <= 60s cold, p95 <= 30s warm**. The warm-cache path is the steady-state experience for active teams.

## Local Cold-Start Budget

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

### Assessment (Local)

The 30-second SLO is comfortable. First-ever cold creates are dominated by Docker pulls (one-time cost per image). Steady-state warm creates are well under budget. No pre-warming investment is required for local — the user's own machine provides the cache.
