# WorkspaceProvider Interface

The `WorkspaceProvider` is the primary extensibility seam for workspace lifecycle operations. It is the adapter layer between the control plane and the environment where workspaces actually run. Workspace mode is selected **per-workspace** at creation time and stored as `workspace.mode`.

## Interface

```typescript
interface WorkspaceProvider {
  createWorkspace(input) → { workspace, worktree_path }
  startServices(manifest.services, env, secrets) → service_statuses
  healthCheck(manifest.services[].health_check) → pass/fail per service
  stopServices(service_names[]) → void
  runSetup(workspace_id) → void
  sleep(workspace_id) → void
  wake(workspace_id) → void
  destroy(workspace_id) → void
  createTerminal(workspace_id, launch_type, cols, rows, harness_provider?, harness_session_id?) → { terminal, attachment? }
  attachTerminal(terminal_id, cols, rows) → terminal_connection
  writeTerminal(terminal_id, data) → void
  resizeTerminal(terminal_id, cols, rows) → void
  detachTerminal(terminal_id) → void
  killTerminal(terminal_id) → void
  exposePort(workspace_id, service, port) → access_url | null
  getGitStatus(workspace_id) → git_status
  getGitChangesPatch(workspace_id) → unified_diff
  getGitDiff(workspace_id, file_path, scope) → unified_diff
  listGitLog(workspace_id, limit) → git_log_entries
  stageGitFiles(workspace_id, file_paths[]) → void
  unstageGitFiles(workspace_id, file_paths[]) → void
  commitGit(workspace_id, message) → commit_result
  pushGit(workspace_id) → push_result
}
```

Provider-specific runtime detail should not be stuffed into a generic `mode_state` field. If a field materially affects product behavior, model it explicitly on `workspace`; otherwise keep it inside the provider implementation.

## Execution Model

`lifecycle.json` describes **WHAT** to run. The `WorkspaceProvider` decides **WHERE**.

1. All workspaces are lifecycle-managed execution environments backed by a `WorkspaceProvider`.
2. Every workspace supports `share` with team-accessible preview URL (mechanism varies by provider).
3. Org TTL and cleanup are enforced by the control plane regardless of provider.
4. If the target provider's capacity is unavailable, create request is rejected with actionable error.
5. V1 ships both `CloudWorkspaceProvider` and `LocalWorkspaceProvider`. Both are implemented against the `WorkspaceProvider` interface and validated in parallel from Milestone 3 onward.
6. Platform stance is Cloudflare-first for cloud execution, edge routing, and storage integration.

## Event Kernel Contract

Normative event and hook rules live in [events.md](./events.md).

1. Provider-owned lifecycle mutations publish normalized fact events into the Lifecycle event kernel.
2. The desktop store, notifications, metrics, and future plugins are consumers of that kernel, not independent sources of truth.
3. Commands may expose `before|after|failed` hooks, but blocking hooks remain Lifecycle-owned until a plugin trust model exists.
4. High-frequency streams such as PTY output remain on dedicated transports rather than the generic event kernel.

## Terminal Stream Contract (M3+)

Terminal transport is split between control-plane mutations and ordered data streaming.

1. Control-plane operations stay typed and imperative (`create`, `attach`, `write`, `resize`, `detach`, `kill`).
2. `writeTerminal(terminal_id, data)` transports terminal input data that has already been encoded by the active terminal surface. Providers should treat it as terminal input bytes/data, not as abstract key events to reinterpret.
3. Terminal output is an ordered PTY data stream exposed as ordered chunks, not a coarse app event.
4. Local mode should use Tauri `Channel` for PTY output streaming.
5. Generic app events remain appropriate for terminal metadata/status changes, not high-frequency byte output.
6. Replay buffers are provider-owned implementation detail as long as attach/replay ordering is preserved.
7. Collaborative terminal viewing should attach multiple clients to the same authoritative PTY output stream. Viewer/watch mode consumes output plus replay, while control mode additionally sends input through `writeTerminal`.
8. Providers must not try to reconstruct remote terminal state by mirroring another user's key events into a separate terminal instance. Shared terminal state comes from the authoritative PTY output stream.
9. Native terminal renderers that require a locally-owned child process may bridge remote PTYs through a local attach/proxy command, but the authoritative terminal state still belongs to the remote PTY.

## Mode, Authority, and Aggregation

`workspace.mode` is the authority boundary for workspace lifecycle data.

1. `workspace.mode=local` means the local provider is authoritative for that workspace's runtime state, persistence, and lifecycle operations.
2. `workspace.mode=cloud` means the cloud provider and control plane are authoritative for that workspace's runtime state, persistence, and lifecycle operations.
3. Signing in enables cloud-mode workspaces and sync flows; it does not change the authority of existing local-mode workspaces.
4. Desktop surfaces may present local and cloud workspaces together in one list, but each workspace still has exactly one authoritative provider selected by `workspace.mode`.
5. Mixed-mode workspace lists must be aggregated from normalized domain records, not by composing raw storage-specific rows directly in UI code.
6. Mutations issued from aggregated views must dispatch back to the authoritative provider for the selected workspace.
7. `mode` is a workspace concern. Do not apply it broadly to unrelated entities unless a concrete execution-boundary need emerges.

## Git Operations Contract

Git operations follow the same authority rule as terminals and lifecycle mutations.

1. Git reads and writes are workspace-scoped provider operations, not raw host-path operations issued from React.
2. Frontend callers should key git operations by `workspace_id`; the provider resolves the authoritative execution context.
3. `workspace.mode=local`:
   - local provider resolves the workspace worktree on the host filesystem and executes git locally
4. `workspace.mode=cloud`:
   - cloud provider resolves git state from the cloud sandbox/control plane
   - local filesystem assumptions do not apply
5. The public git result types must stay provider-agnostic:
   - status includes current branch/head plus split index/worktree file state
   - changes patch returns the combined `HEAD -> worktree` diff for the primary Changes viewer
   - file diff uses explicit `scope` (`working|staged|branch`) for secondary or provider-level flows
   - log entries and commit/push results use normalized typed payloads
6. UI surfaces may hide unsupported git actions per mode until the authoritative provider exists, but the contract shape should not fork.

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
