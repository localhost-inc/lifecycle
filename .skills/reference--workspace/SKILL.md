---
name: reference--workspace
description: Workspace contract docs — provider, canvas, surface, environment, files — for workspace feature implementation
user-invocable: true
---

Apply the following workspace contracts as context for the current task. All workspace behavior should conform to these docs.

---

# WorkspaceProvider Interface

The `WorkspaceProvider` is the primary extensibility seam for workspace lifecycle operations. It is the adapter layer between the control plane and the environment where workspaces actually run. Workspace mode is selected **per-workspace** at creation time and stored as `workspace.mode`.

## Workspace vs Environment Boundary

Lifecycle should model three layers explicitly:

1. `workspace` — durable shell, identity, worktree ownership, provider mode, archive metadata
2. `environment` — singleton execution layer attached to the workspace; start/stop/reset/sleep/wake/fail semantics live here
3. `workspace_service` — per-service runtime inside the environment

In V1, the environment is represented on the workspace record rather than as a separate table because there is exactly one environment per workspace.

## Workspace Kind (Local)

`workspace.kind` captures how a local workspace gets its git context.

1. `root` — backed directly by `project.path`; `workspace.worktree_path` resolves to the repo root
2. `managed` — backed by a Lifecycle-created derived git worktree; Lifecycle owns the derived branch/worktree naming and cleanup lifecycle
3. `kind` is distinct from `workspace.mode`: `mode` answers who is authoritative (`local|cloud`), `kind` answers how the local workspace's git context is sourced

## Interface

```typescript
interface WorkspaceProvider {
  createWorkspace(input + manifest_json? + manifest_fingerprint?) → { workspace, worktree_path }
  renameWorkspace(workspace_id, name) → workspace
  startServices(workspace + manifest_json + manifest_fingerprint + service_names?) → service_statuses
  healthCheck(manifest.environment[kind=service].health_check) → pass/fail per service
  stopServices(service_names[]) → void
  runSetup(workspace_id) → void
  sleep(workspace_id) → void
  wake(workspace + manifest_json + manifest_fingerprint) → void
  destroy(workspace_id) → void
  getWorkspace(workspace_id) → workspace | null
  getWorkspaceServices(workspace_id) → workspace_services[]
  getWorkspaceSnapshot(workspace_id) → { workspace, services, terminals }
  getWorkspaceRuntimeProjection(workspace_id) → { setup, environment_tasks, activity }
  updateWorkspaceService(workspace_id, service, exposure, port_override?) → void
  syncWorkspaceManifest(workspace_id, manifest_json?, manifest_fingerprint?) → void
  createTerminal(workspace_id, launch_type, harness_provider?, harness_session_id?) → terminal
  listWorkspaceTerminals(workspace_id) → terminals[]
  getTerminal(terminal_id) → terminal | null
  renameTerminal(terminal_id, label) → terminal
  saveTerminalAttachment(workspace_id, file_name, base64_data, media_type?) → attachment
  detachTerminal(terminal_id) → void
  killTerminal(terminal_id) → void
  readWorkspaceFile(workspace_id, file_path) → file
  writeWorkspaceFile(workspace_id, file_path, content) → file
  listWorkspaceFiles(workspace_id) → file_entries[]
  openWorkspaceFile(workspace_id, file_path) → void
  exposePort(workspace_id, service, port) → access_url | null
  getGitStatus(workspace_id) → git_status
  getGitScopePatch(workspace_id, scope) → unified_diff
  getGitChangesPatch(workspace_id) → unified_diff
  getGitDiff(workspace_id, file_path, scope) → unified_diff
  listGitLog(workspace_id, limit) → git_log_entries
  listGitPullRequests(workspace_id) → pull_request_list
  getGitPullRequest(workspace_id, pull_request_number) → pull_request_detail
  getCurrentGitPullRequest(workspace_id) → branch_pull_request
  getGitBaseRef(workspace_id) → base_ref | null
  getGitRefDiffPatch(workspace_id, base_ref, head_ref) → unified_diff
  getGitPullRequestPatch(workspace_id, pull_request_number) → unified_diff
  getGitCommitPatch(workspace_id, sha) → commit_diff
  stageGitFiles(workspace_id, file_paths[]) → void
  unstageGitFiles(workspace_id, file_paths[]) → void
  commitGit(workspace_id, message) → commit_result
  pushGit(workspace_id) → push_result
}
```

### Provider Responsibility Split

1. `createWorkspace` and `destroy` are workspace-lifecycle operations.
2. `startServices`, `stopServices`, `sleep`, `wake`, and reset flows operate on the environment attached to that workspace.
3. `startServices(service_names?)` may target a single service chain; providers must honor manifest `depends_on` edges.
4. When `startServices(service_names?)` is called against an already-active workspace, providers should treat `ready` dependency services as satisfied boundaries.
5. Local create/start/wake flows must carry the exact manifest content plus `manifest_fingerprint`.
6. The provider boundary should expose one coherent workspace-scoped API.

## Execution Model

`lifecycle.json` describes **WHAT** to run. The `WorkspaceProvider` decides **WHERE**.

1. All workspaces are lifecycle-managed execution environments backed by a `WorkspaceProvider`.
2. V1 ships both `CloudWorkspaceProvider` and `LocalWorkspaceProvider`.
3. Platform stance is Cloudflare-first for cloud execution.

## Event Foundation Contract

1. Provider-owned lifecycle mutations publish normalized fact events into the Lifecycle event foundation.
2. The desktop query cache, notifications, metrics, and future plugins are consumers of that foundation.
3. Commands may expose `before|after|failed` hooks.
4. High-frequency terminal rendering stays inside the native terminal host.

## Terminal Session Contract (M3+)

1. Control-plane operations stay typed and imperative (`create`, `detach`, `kill`).
2. Session runtime stays provider-owned (local: native session; cloud: sandbox PTY).
3. Desktop-only geometry, visibility, focus, theme, and font synchronization stay outside the provider interface.
4. `detachTerminal(terminal_id)` hides the active surface without terminating the session.
5. `killTerminal(terminal_id)` is the only action that intentionally ends a live session.

## Mode, Authority, and Aggregation

1. `workspace.mode=local` means the local provider is authoritative.
2. `workspace.mode=cloud` means the cloud provider is authoritative.
3. Signing in enables cloud-mode workspaces; it does not change the authority of existing local-mode workspaces.
4. Mixed-mode workspace lists must be aggregated from normalized domain records.
5. Mutations from aggregated views must dispatch to the authoritative provider.

## Git Operations Contract

1. Git reads and writes are workspace-scoped provider operations.
2. Frontend callers should key git operations by `workspace_id`.
3. The public git result types must stay provider-agnostic.
4. Authoritative git mutations publish repository-level fact events.

## `LocalWorkspaceProvider` (V1)

1. Local Git worktree on host filesystem.
2. Tauri Rust backend handles process supervision, libghostty, Docker, local state persistence.
3. Lifecycle-managed loopback binds plus `*.lifecycle.localhost` routing.
4. `workspace.kind=root` uses `project.path` as `workspace.worktree_path`.
5. `workspace.kind=managed` uses a Lifecycle-owned derived git worktree.
6. Worktree creation mirrors existing `.env` and `.env.local` files from the source repo.
7. Local workspaces operate without network.

## `CloudWorkspaceProvider` (V1)

1. Per-branch Cloudflare Sandbox instances.
2. Sandbox-owned PTY sessions for terminal runtime.
3. Desktop terminal attach via provider-minted credentials.
4. Shared terminal fan-in/fan-out via Durable Object multiplexer.
5. Preview URLs via Cloudflare Workers routing.

---

# Workspace Canvas Contract

The **target inner workspace model** for Lifecycle once a workspace becomes one kind of top-level page tab.

## Core Model

The workspace canvas is the **split-only center pane surface** inside a workspace. It is optimized for live execution and local work, not for durable project navigation.

Key rules:
1. one workspace tab
2. one split tree
3. one surface per pane
4. no pane-local tab groups

## Canvas Boundary

Owns: split layout, active pane, pane headers, workspace-local surface placement, canvas restore state

Does **not** own: project-level navigation, top-level page-tab state, workspace header, workspace extension strip/panel state

## Pane Model

The canvas is a recursive row/column split tree. Each leaf pane contains a compact pane header strip and exactly one active surface.

## Surface Kinds

The canvas may host: terminal session, file surface, local changes review, workspace-local commit detail, service preview, empty pane

Project-scoped artifacts (pull request detail) should normally open as **page tabs**.

## Open and Replace Rules

1. Open into the active pane, replace the current surface unless the user explicitly splits.
2. Explicit split creates a sibling pane.
3. Reopening a singleton surface should focus its existing pane.

## Empty Pane Rules

Empty panes are first-class canvas states. They show quick launch actions and are valid drop targets.

## Rearrangement

1. Drag to resize split ratios.
2. Whole-pane rearrangement by drag.
3. Row/column regrouping when drop target implies a new split shape.
4. Unit of rearrangement is the pane node, not an inner tab.

## Restore Rules

Per workspace. Persist: split topology, split ratios, pane contents by identifier-only snapshot, active pane. Must **not** override provider/runtime authority.

---

# Workspace Surface Contract

The **current implementation contract** for the mixed runtime/document tab model.

## Tab Classes

1. Runtime tabs: backed by provider/runtime entity (`terminal_id`, future `agent_session_id`)
2. Document tabs: backed by workspace content (`diff:commit:<sha>`, `file:<path>`)

## Ownership Rules

1. Runtime lifecycle remains provider-authoritative.
2. Document tabs are desktop-owned UI state.
3. Desktop-owned surface layout includes `activePaneId`, split tree, per-pane `tabOrderKeys`, `hiddenRuntimeTabKeys`.

## Pane Tree Model

1. Tree of split nodes and leaf panes.
2. Leaf panes own `activeTabKey` plus ordered `tabOrderKeys`; split nodes own `direction` plus `ratio`.
3. Tabs belong to exactly one pane at a time.
4. Splitting creates a sibling leaf that starts empty.
5. Dragging tabs transfers ownership between panes.

## Runtime Mount Semantics

1. Inactive runtime tabs must remain mounted when their host depends on attachment continuity.
2. Switching tabs hides runtime presentation without destroying the resource.
3. Closing a runtime tab detaches/hides, does not kill.

## Git Diff Surfaces

1. Current local edits open as a single route-driven `Changes` dialog over the workspace canvas.
2. Repeated `Changes` opens update dialog inputs instead of opening new tabs.
3. History commit diffs remain commit-scoped document tabs keyed by SHA.

---

# Workspace Environment Graph

The workspace execution model behind `lifecycle.json`.

## Lifecycle Split

### `workspace`

Owns coarse worktree-scoped steps: `workspace.setup`, `workspace.teardown`

`workspace.setup` is for filesystem work only — install deps, generate code, materialize config. If something needs a running dependency, it belongs in `environment` as a `task`.

### `environment`

A DAG of typed nodes keyed by node id. Node kinds: `task`, `service`.

## Node Semantics

### `task`

One-shot deterministic work. Dependency satisfied when task exits `0`. Failures block downstream. Cadence controlled with `run_on`.

### `service`

Supervised long-lived workload. Dependency satisfied when service becomes ready. Runtime may be `process` or `image`. Readiness via `health_check`.

Only `kind: "service"` nodes seed `workspace_service` rows, previews, exposure settings, and port overrides.

## Execution Order

1. Parse and validate `lifecycle.json`.
2. Run eligible `workspace.setup` steps.
3. Build environment graph.
4. Drop create-scoped task nodes after first successful start.
5. Topologically sort; reject missing deps or cycles.
6. Execute tasks and start services in dependency order.
7. Transition to `active` after all required health checks pass.

## Dependency Rules

1. `depends_on` is the only scheduling edge.
2. Nodes can depend on tasks or services.
3. Missing deps or cycles fail startup.

---

# Workspace Files Contract

File tabs inside the workspace surface.

## Ownership

1. File tabs are document tabs keyed by `file:<path>`.
2. `features/workspaces` owns tab orchestration; `features/files` owns renderer selection, editor config, draft/conflict handling.
3. File reads/writes go through the workspace/provider boundary.

## Surface Model

1. File tabs do not split into separate viewer/editor kinds.
2. Per-tab presentation may switch between `view` and `edit`.
3. Only file types with materially better preview expose `view`.

## Renderer Registry

File-type behavior registered through a shared renderer registry. Adding a new type means defining metadata and optionally a preview component.

## Editor Contract

Default edit surface is shared CodeMirror. File types influence the editor through configuration, not reimplementation.

## Session Behavior

1. Draft state survives tab switches.
2. Closing dirty tab requires discard confirmation.
3. Disk changes during dirty draft → explicit conflict state.
