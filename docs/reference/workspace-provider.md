# WorkspaceProvider Interface

The `WorkspaceProvider` is the primary extensibility seam for workspace lifecycle operations. It is the adapter layer between the control plane and the environment where workspaces actually run. Workspace mode is selected **per-workspace** at creation time and stored as `workspace.mode`.

## Interface

```typescript
interface WorkspaceProvider {
  createWorkspace(manifest, ref, secrets) → { mode_state, worktree_path }
  startServices(manifest.services, env, secrets) → service_statuses
  healthCheck(manifest.services[].health_check) → pass/fail per service
  stopServices(service_names[]) → void
  runSetup(manifest.setup.steps, env, secrets) → step_results[]
  sleep(workspace_id) → backup_metadata
  wake(workspace_id, backup_metadata) → mode_state
  destroy(workspace_id) → void
  openTerminal(workspace_id, cols, rows) → terminal_connection
  exposePort(workspace_id, service, port) → access_url | null
}
```

## Execution Model

`lifecycle.json` describes **WHAT** to run. The `WorkspaceProvider` decides **WHERE**.

1. All workspaces are lifecycle-managed execution environments backed by a `WorkspaceProvider`.
2. Every workspace supports `share` with team-accessible preview URL (mechanism varies by provider).
3. Org TTL and cleanup are enforced by the control plane regardless of provider.
4. If the target provider's capacity is unavailable, create request is rejected with actionable error.
5. V1 ships both `CloudWorkspaceProvider` and `LocalWorkspaceProvider`. Both are implemented against the `WorkspaceProvider` interface and validated in parallel from Milestone 3 onward.
6. Platform stance is Cloudflare-first for cloud execution, edge routing, and storage integration.

## `CloudWorkspaceProvider` (V1)

1. Cloud sandbox plane:
   - per-branch Cloudflare Sandbox instances
   - terminal access via sandbox terminal API
   - preview URLs via Cloudflare Workers routing
   - ephemeral test data and fixtures
2. Capacity pools:
   - `standard` pool for default workspace lifecycle
   - optional `boost` pool for expensive or latency-sensitive workloads
3. Warm infrastructure:
   - dependency/image cache surfaces (R2) that reduce create/wake spend and latency

## `LocalWorkspaceProvider` (V1)

1. Local execution plane:
   - local Git worktree checked out on host filesystem
   - Tauri Rust backend handles process supervision, PTY management, Docker integration, and local state persistence
   - localhost ports for service access
2. Requirements:
   - local workspaces operate without network — Convex connection only required for cloud workspaces and fork-to-cloud
   - Tauri desktop app must be running (the Rust backend IS the local process supervisor — no separate daemon)
   - Docker Desktop required for `image` runtime services
