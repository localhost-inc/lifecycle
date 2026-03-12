# WorkspaceProvider Interface

The `WorkspaceProvider` is the primary extensibility seam for workspace lifecycle operations. It is the adapter layer between the control plane and the environment where workspaces actually run. Workspace mode is selected **per-workspace** at creation time and stored as `workspace.mode`.

Preview transport and tunnel-routing direction is captured in [tunnel.md](./tunnel.md).

## Workspace vs Environment Boundary

Lifecycle should model three layers explicitly:

1. `workspace`
   - durable shell, identity, worktree ownership, provider mode, archive metadata
2. `environment`
   - singleton execution layer attached to the workspace
   - start/stop/reset/sleep/wake/fail semantics live here
3. `workspace_service`
   - per-service runtime inside the environment

In V1, the environment is represented on the workspace record rather than as a separate table because there is exactly one environment per workspace.

## Workspace Kind (Local)

`workspace.kind` captures how a local workspace gets its git context.

1. `root`
   - backed directly by `project.path`
   - `workspace.worktree_path` resolves to the repo root so a newly added project is immediately usable as-is
2. `managed`
   - backed by a Lifecycle-created derived git worktree
   - Lifecycle owns the derived branch/worktree naming and cleanup lifecycle
3. `kind` is distinct from `workspace.mode`
   - `mode` answers who is authoritative (`local|cloud`)
   - `kind` answers how the local workspace's git context is sourced

## Interface

```typescript
interface WorkspaceProvider {
  createWorkspace(input) → { workspace, worktree_path }
  startServices(manifest.services, env) → service_statuses
  healthCheck(manifest.services[].health_check) → pass/fail per service
  stopServices(service_names[]) → void
  runSetup(workspace_id) → void
  sleep(workspace_id) → void
  wake(workspace_id) → void
  destroy(workspace_id) → void
  createTerminal(workspace_id, launch_type, harness_provider?, harness_session_id?) → terminal
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

### Provider Responsibility Split

1. `createWorkspace` and `destroy` are workspace-lifecycle operations.
2. `startServices`, `stopServices`, `sleep`, `wake`, and reset flows operate on the environment attached to that workspace.
3. Future archive/unarchive flows are workspace-lifecycle operations that must drive the environment down or back up as needed.
4. The provider boundary should expose one coherent workspace-scoped API even when the underlying behavior targets the environment or a service within it.

## Execution Model

`lifecycle.json` describes **WHAT** to run. The `WorkspaceProvider` decides **WHERE**.

1. All workspaces are lifecycle-managed execution environments backed by a `WorkspaceProvider`.
2. Workspaces may expose previews through direct local URLs or optional tunnel-backed share URLs, depending on provider capabilities and configured policy.
3. Org TTL and cleanup are enforced by the control plane regardless of provider.
4. If the target provider's capacity is unavailable, create request is rejected with actionable error.
5. V1 ships both `CloudWorkspaceProvider` and `LocalWorkspaceProvider`. Both are implemented against the `WorkspaceProvider` interface and validated in parallel from Milestone 3 onward.
6. Platform stance is Cloudflare-first for cloud execution, edge routing, and storage integration.

## Event Foundation Contract

Normative event and hook rules live in [events.md](./events.md).

1. Provider-owned lifecycle mutations publish normalized fact events into the Lifecycle event foundation.
2. The desktop query cache, notifications, metrics, and future plugins are consumers of that foundation, not independent sources of truth.
3. Commands may expose `before|after|failed` hooks, but blocking hooks remain Lifecycle-owned until a plugin trust model exists.
4. High-frequency terminal rendering, input, and output stay inside the native terminal host rather than the generic event foundation.

Execution-state facts should follow the thing that changed:

1. workspace facts describe durable workspace lifecycle and metadata
2. environment facts describe start/stop/reset/sleep/wake/fail transitions
3. service facts describe per-service runtime changes

## Terminal Session Contract (M3+)

Terminal control stays split between typed lifecycle mutations and native surface synchronization.

1. Control-plane operations stay typed and imperative (`create`, `detach`, `kill`).
2. `createTerminal(...)` provisions a native-backed terminal session and returns typed terminal metadata; once created, input and output are owned by the native host rather than a JS byte-stream contract.
3. Desktop-only geometry, visibility, focus, theme, and font synchronization for native surfaces stay outside the provider interface.
4. `detachTerminal(terminal_id)` hides the active native surface without terminating the running session.
5. `killTerminal(terminal_id)` is the only normal terminal-level action that intentionally ends a live session.

## Mode, Authority, and Aggregation

`workspace.mode` is the authority boundary for workspace lifecycle data.

1. `workspace.mode=local` means the local provider is authoritative for that workspace's environment state, persistence, and lifecycle operations.
2. `workspace.mode=cloud` means the cloud provider and control plane are authoritative for that workspace's environment state, persistence, and lifecycle operations.
3. Signing in enables cloud-mode workspaces and sync flows; it does not change the authority of existing local-mode workspaces.
4. Desktop surfaces may present local and cloud workspaces together in one list, but each workspace still has exactly one authoritative provider selected by `workspace.mode`.
5. Mixed-mode workspace lists must be aggregated from normalized domain records, not by composing raw storage-specific rows directly in UI code.
6. Mutations issued from aggregated views must dispatch back to the authoritative provider for the selected workspace.
7. `mode` is a workspace concern. Do not apply it broadly to unrelated entities unless a concrete execution-boundary need emerges.

### Future Local Target Split

As a future consideration, local mode may still support more than one execution target. That should remain a target concern, not a new top-level mode.

1. `workspace.mode=local` should continue to mean the local provider is authoritative.
2. Future local targets may include:
   - `host`
   - `docker`
   - `remote_host`
3. `ssh` should not be modeled as a peer to those targets.
4. `ssh` is transport for reaching a `remote_host`, not an authority mode.
5. If Lifecycle's control plane provisions and owns the remote machine, that is `cloud` even if some implementation path also uses SSH under the hood.

The decision rule is simple:

1. `local` means user-owned authority.
2. `cloud` means Lifecycle-owned authority.
3. target selection answers where the environment runs; transport answers how the provider reaches it.

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
7. Authoritative git mutations publish repository-level fact events such as `git.status_changed`, `git.head_changed`, and `git.log_changed` after commit, stage, unstage, push, checkout, or equivalent provider-owned transitions.

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
   - Tauri Rust backend handles process supervision, libghostty integration, Docker integration, and local state persistence
   - localhost ports for service access
   - `workspace.kind=root` uses `project.path` as `workspace.worktree_path`, so adding a project yields an immediately usable repo-backed workspace without creating a derived worktree first
   - `workspace.kind=managed` uses a Lifecycle-owned derived git worktree and managed branch identity
   - `workspace.name` remains a user-facing label; the managed git branch (`source_ref`) and worktree directory name are derived as kebab-cased Lifecycle-owned identifiers from that label plus the workspace id
   - worktree creation mirrors existing local `.env` and `.env.local` files from the source repo when the destination path does not already exist, so developer-owned local config remains available inside managed workspaces
2. Requirements:
   - local workspaces operate without network — Convex connection only required for cloud workspaces and fork-to-cloud
   - Tauri desktop app must be running (the Rust backend IS the local process supervisor — no separate daemon)
   - Docker Desktop required for `image` runtime services

### Future Local Targets

V1 local execution is host-oriented, but the long-term provider model should leave room for additional local targets without redefining `workspace.mode`.

1. `host`
   - processes run on the user's machine
   - image services may still use local Docker sidecars
2. `docker`
   - the local environment runs in a stronger containerized boundary
   - better fit for workspace-local networking and isolation
3. `remote_host`
   - the environment runs on a user-managed machine outside the local laptop
   - initial transport may be SSH, but authority remains `local`
