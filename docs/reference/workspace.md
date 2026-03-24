# Backend + Workspace

Lifecycle uses three explicit seams:

1. `Backend` — projects, workspaces, ownership, manifest reads, branch lookup, and workspace create/rename/destroy
2. `WorkspaceClient` — live workspace-scoped execution once a workspace exists: services, terminals, files, git, activity, and service logs
3. `AgentClient` — first-party agent sessions, turns, approvals, attachments, and artifacts behind a Lifecycle-owned agent model

Host-native concerns such as OS app launching and native terminal surface synchronization stay outside these seams. Workspace placement is selected **per-workspace** at creation time and stored as `workspace.target`.

## Workspace Boundary

Lifecycle models the workspace as the concrete runnable instance:

1. `workspace` — identity, worktree ownership, target placement, preparation/archive state, and failure metadata
2. `service` — per-service execution inside the workspace
3. `terminal` — per-session interactive surface attached to the workspace
4. `agent_session` — first-party agent interaction thread attached to the workspace

## Agent Execution Model

Lifecycle agent execution is split into three layers:

1. `AgentOrchestrator` — desktop-side coordinator that creates and binds sessions, owns normalized event fanout, and persists Lifecycle agent state
2. `AgentSession` — harness-facing live object for one persisted `agent_session` record
3. `AgentWorker` — deployed execution unit running on the target runtime and wrapping the real Claude or Codex provider session

The harness talks to `AgentSession`. `AgentSession` interfaces with `AgentWorker`. `AgentWorker` runs on the target `WorkspaceRuntime`.

For local sessions, the desktop no longer owns the provider worker as a direct child process. It launches a detached Lifecycle-owned host process as `lifecycle agent host --provider <provider> --session-id <agent_session_id> ...`. That detached host owns the real `lifecycle agent worker <provider>` child process, persists a small registration file keyed by `agent_session.id`, and exposes a reconnectable loopback websocket transport back to `AgentOrchestrator`.

Rules:

1. The detached host must survive desktop restarts and rebuilds so local agent sessions are not torn down with the app runtime.
2. `provider_session_id` is still discovered by the real provider worker and reported back to `AgentOrchestrator`; it is never the transport address.
3. The detached host registration is keyed by Lifecycle `agent_session.id`, not by terminal id or provider thread id.
4. Reattachment is app-driven: on startup, `AgentOrchestrator` should reconnect persisted live sessions through the detached host registration before waiting for the next user turn.
5. The detached host may publish an initial worker-state snapshot on reconnect so the desktop can reconcile session status even if the app was offline.

## Workspace Checkout Type (Local)

`workspace.checkout_type` captures how a local workspace gets its git context.

1. `root` — backed directly by `project.path`; `workspace.worktree_path` resolves to the repo root
2. `worktree` — backed by a Lifecycle-created derived git worktree; Lifecycle owns the derived branch/worktree naming and cleanup lifecycle
3. `checkout_type` is distinct from `workspace.target`: `target` answers where the workspace runs (`local|docker|remote|cloud`), `checkout_type` answers how the local workspace's git context is sourced

## Interface

```typescript
interface Backend {
  getProjectWorkspace(project_id) → workspace | null
  listWorkspaces() → workspace[]
  listWorkspacesByProject() → Record<project_id, workspace[]>
  listProjects() → project[]
  readManifestText(dir_path) → string | null
  getCurrentBranch(project_path) → string
  createWorkspace(local_create_context + manifest_json? + manifest_fingerprint?) → { workspace, worktree_path }
  renameWorkspace(workspace_id, name) → workspace
  destroyWorkspace(workspace_id) → void
  getWorkspace(workspace_id) → workspace | null
}

interface WorkspaceClient {
  startServices(workspace + manifest_json + manifest_fingerprint + service_names?) → service_statuses
  healthCheck(manifest.environment[kind=service].health_check) → pass/fail per service
  stopServices(workspace_id) → void
  getActivity(workspace_id) → lifecycle_events[]
  getServiceLogs(workspace_id) → service_logs[]
  getServices(workspace_id) → services[]
  createTerminal(workspace_id, launch_type) → terminal
  listTerminals(workspace_id) → terminals[]
  renameTerminal(workspace_id, terminal_id, label) → terminal
  saveTerminalAttachment(workspace_id, file_name, base64_data, media_type?) → attachment
  detachTerminal(workspace_id, terminal_id) → void
  killTerminal(workspace_id, terminal_id) → void
  interruptTerminal(workspace_id, terminal_id) → void
  readFile(workspace_id, file_path) → file
  writeFile(workspace_id, file_path, content) → file
  subscribeFileEvents(workspace_id, worktree_path?) → unsubscribe
  listFiles(workspace_id) → file_entries[]
  openFile(workspace_id, file_path) → void
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

### Responsibility Split

1. `createWorkspace`, `renameWorkspace`, `destroyWorkspace`, and `getWorkspace` are backend operations.
2. Project list reads, manifest reads, and current-branch lookup are backend operations.
3. `startServices`, `stopServices`, and reset flows operate on the workspace's runnable services and belong to `WorkspaceClient`.
4. File, git, terminal, activity, service, and service-log reads are workspace operations.
5. Agent session create/list/get and future turn or approval operations belong to `AgentClient`, not `WorkspaceClient`.
6. `AgentClient` may create `AgentSession` objects backed by persisted `agent_session` rows and runtime-deployed `AgentWorker` instances.
7. The agent transcript source of truth is `agent_event` plus its `agent_message` / `agent_message_part` projections; provider-local logs and terminal history are not query sources.
8. Desktop file reads, writes, listings, open actions, and file-event subscriptions may route through the local host file client when the workspace has a local `worktree_path`, even if the runtime target is not `local`.
9. `startServices(service_names?)` may target a single service chain; workspace execution must honor manifest `depends_on` edges.
10. When `startServices(service_names?)` is called against an already-active workspace, `ready` dependency services should be treated as satisfied boundaries.
11. Local create/start flows must carry the exact manifest content plus `manifest_fingerprint`.
12. Backend create owns workspace identity, source-ref derivation, and the returned workspace record. Desktop clients must not synthesize those fields locally.
13. Desktop query reads should not bypass these seams with transport-local command calls.
14. Frontend consumers should read concrete workspace-scoped facts through separate queries (`workspace`, `services`, `terminals`, `activity`, `service_logs`, `agent_sessions`) instead of depending on a synthetic snapshot aggregate.
15. Backend-owned live selectors should stay split by concern as well; do not collapse activity, service logs, and other unrelated facts into a synthetic controller facts bag.
16. Frontend manifest watchers may invalidate workspace queries when `lifecycle.json` changes, but reconciliation of persisted idle service state must remain backend-owned.

## Execution Model

`lifecycle.json` describes **WHAT** to run. The `Backend` decides workspace identity and target placement, and `WorkspaceClient` owns the live workspace operations.

1. All workspaces are lifecycle-managed execution instances backed by `WorkspaceClient`.
2. V1 ships a host-backed workspace implementation.
3. `docker`, `remote`, and `cloud` are explicit workspace targets. The desktop client currently routes `docker` workspaces through the same host workspace client path as `local` for mounted local-worktree reads/writes, while terminal execution for `docker` runs inside a workspace container; `remote` and `cloud` still fail fast until they have target-native clients.
4. Agent execution target follows the workspace target. `AgentWorker` is deployed by the target runtime: local host process for `local`, workspace container process for `docker`, target-native agent host for `remote|cloud`.

## Event Foundation Contract

1. Backend and workspace mutations publish normalized fact events into the Lifecycle event foundation.
2. The desktop query cache, notifications, metrics, and future plugins are consumers of that foundation.
3. Commands may expose `before|after|failed` hooks.
4. High-frequency terminal rendering stays inside the native terminal host.
5. `WorkspaceClient.writeFile(...)` publishes a `workspace.file_changed` fact event for cache invalidation; it is not a workspace activity entry.

## Terminal Session Contract (M3+)

1. Backend operations stay typed and imperative (`create`, `detach`, `kill`).
2. Session execution stays terminal-owned (local: native session; cloud: sandbox PTY).
3. Desktop-only geometry, visibility, focus, theme, and font synchronization stay outside the workspace client interface.
4. `detachTerminal(workspace_id, terminal_id)` hides the active surface without terminating the session.
5. `killTerminal(workspace_id, terminal_id)` is the only action that intentionally ends a live session.
6. Terminals are shell surfaces only. Agent sessions use `AgentClient` and `agent_*` state instead of terminal rows or terminal lifecycle events.

## Targets and Aggregation

1. `workspace.target=local` means the desktop host workspace client is authoritative.
2. `workspace.target=docker` reuses the desktop host workspace client path for mounted local-worktree flows, but terminal sessions execute through a long-lived Docker sandbox container built from the shipped sandbox Dockerfile.
3. `workspace.target=remote|cloud` reserve explicit non-local placements in the shared contract.
4. Mixed-target workspace lists must be aggregated from normalized domain records.
5. Mutations from aggregated views must dispatch to the authoritative workspace client for that target.
6. Workspace resolution must dispatch calls by `workspace.target`.
7. Terminal control operations are workspace-scoped; `terminal_id` is never an authority boundary by itself.
8. File-tree freshness is gated by local worktree availability. Workspaces with a local `worktree_path` may use the host file subscription implementation; remote-only targets without a local path must use target-native subscriptions.

## Git Operations Contract

1. Git reads and writes are workspace-scoped execution operations.
2. Frontend callers should key git operations by `workspace_id`.
3. The public git result types must stay provider-agnostic.
4. Authoritative git mutations publish repository-level fact events.

## `Backend` + Host Workspace (V1)

1. Local Git worktree on host filesystem.
2. Tauri Rust backend handles process supervision, libghostty, Docker, local state persistence.
3. Lifecycle-managed loopback binds plus `*.lifecycle.localhost` routing.
4. `workspace.checkout_type=root` uses `project.path` as `workspace.worktree_path`.
5. `workspace.checkout_type=worktree` uses a Lifecycle-owned derived git worktree.
6. Worktree creation mirrors existing `.env` and `.env.local` files from the source repo.
7. Local workspaces operate without network.

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

The canvas may host: terminal session, file surface, local changes review, workspace-local commit detail, browser surface, empty pane

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

Per workspace. Persist: split topology, split ratios, pane contents by identifier-only snapshot, active pane. Must **not** override backend or workspace-client authority.

---

# Workspace Surface Contract

The **current implementation contract** for the mixed live/document tab model.

## Tab Classes

1. Live tabs: backed by workspace-owned session entities (`terminal_id`, future `agent_session_id`)
2. Document tabs: backed by workspace content or canvas-owned browser state (`diff:commit:<sha>`, `file:<path>`, `browser:<key>`)

## Ownership Rules

1. Live session lifecycle remains workspace-client-authoritative.
2. Document tabs are desktop-owned UI state.
3. Desktop-owned surface layout includes `activePaneId`, split tree, per-pane `tabOrderKeys`, `hiddenTerminalTabKeys`.

## Pane Tree Model

1. Tree of split nodes and leaf panes.
2. Leaf panes own `activeTabKey` plus ordered `tabOrderKeys`; split nodes own `direction` plus `ratio`.
3. Tabs belong to exactly one pane at a time.
4. Splitting creates a sibling leaf that starts empty.
5. Dragging tabs transfers ownership between panes.

## Runtime Mount Semantics

1. Inactive live tabs must remain mounted when their host depends on attachment continuity.
2. Switching tabs hides live presentation without destroying the resource.
3. Closing a live tab detaches/hides, does not kill.

## Git Diff Surfaces

1. Current local edits open as a single route-driven `Changes` dialog over the workspace canvas.
2. Repeated `Changes` opens update dialog inputs instead of opening new tabs.
3. History commit diffs remain commit-scoped document tabs keyed by SHA.

## Browser Surfaces

1. Browser tabs are document tabs keyed by `browser:<key>`.
2. Service previews open in the workspace browser surface by default, keyed per service identity so repeated opens focus the existing pane.
3. Browser tabs are desktop-owned state and may keep embedded webview session state alive across pane switches until the tab is explicitly closed.

---

# Workspace Environment Graph

The workspace execution model behind `lifecycle.json`.

## Lifecycle Split

### `workspace`

Owns coarse worktree-scoped steps: `workspace.prepare`, `workspace.teardown`

`workspace.prepare` is for filesystem work only — install deps, generate code, materialize config. If something needs a running dependency, it belongs in `environment` as a `task`.

### `environment`

A DAG of typed nodes keyed by node id. Node kinds: `task`, `service`.

## Node Semantics

### `task`

One-shot deterministic work. Dependency satisfied when task exits `0`. Failures block downstream. Cadence controlled with `run_on`.

### `service`

Supervised long-lived workload. Dependency satisfied when service becomes ready. Runtime may be `process` or `image`. Readiness via `health_check`.

Only `kind: "service"` nodes seed `service` rows, derived preview routes, and port overrides.

## Execution Order

1. Parse and validate `lifecycle.json`.
2. Run eligible `workspace.prepare` steps.
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
2. `features/workspaces` owns tab orchestration; `features/explorer` owns renderer selection, editor config, draft/conflict handling.
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
