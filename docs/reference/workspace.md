# Backend + Workspace

Lifecycle uses three explicit seams:

1. `store` — the shared control-plane for persisted records (`project`, `workspace`, `service`, `agent_session`)
2. `WorkspaceClient` — the only host-aware workspace boundary for provisioning and existing-workspace runtime behavior
3. `AgentClient` — the host-aware agent boundary for first-party agent sessions, auth, model catalog, turns, approvals, attachments, and artifacts behind a Lifecycle-owned agent model

Host-native concerns such as OS app launching and native terminal surface synchronization stay outside these seams. Workspace placement is selected **per-workspace** at creation time and stored as `workspace.host`.

For `workspace.host=local`, `WorkspaceClient` talks to a generic native execution substrate. That local substrate should be shaped the same way a future `docker`, `remote`, or `cloud` provider would be shaped: explicit host capabilities underneath one host-aware workspace client, not a separate local control-plane backend.

## Catalog vs Runtime

Lifecycle separates catalog records from runtime-backed control-plane records:

1. `organization` and `project` live fully inside the Lifecycle database as catalog data.
2. `workspace` and `agent_session` are also persisted in the Lifecycle database, but those rows describe runtime instances that execute on a selected host or provider outside the database process.
3. UI catalog flows mutate store state first; runtime capabilities resolve through `WorkspaceClient` and `AgentClient` only after a persisted workspace record exists.

## Workspace Boundary

Lifecycle models the workspace as the concrete runnable instance:

1. `workspace` — identity, worktree ownership, host placement, preparation/archive state, and failure metadata
2. `service` — per-service execution inside the workspace
3. `terminal` — per-session interactive surface attached to the workspace
4. `agent_session` — first-party agent interaction thread attached to the workspace

State contracts:

1. `workspace.status` uses `provisioning | active | archiving | archived | failed`.
2. `workspace.environment_status` uses `idle | starting | running | stopping | failed`.
3. Environment start/stop flows transition `environment_status`; `workspace.status` is reserved for top-level workspace lifecycle.

## Agent Execution Model

Lifecycle agent execution is split into two layers:

1. `AgentClient` — app-facing agent surface for auth, model catalog, session lifecycle, turns, approvals, and persisted Lifecycle agent state
2. `AgentWorker` — private host-scoped runtime manager owned by each concrete `AgentClient`
3. provider runtime — private process/socket implementation details owned by each concrete `AgentWorker`

The app talks to `AgentClient`. `AgentClient` persists `agent_session` state through store, resolves the correct host-scoped `AgentWorker`, and never exposes runtime transport details to the UI.

For local sessions, the desktop no longer owns the provider runtime as a direct child process. `LocalAgentClient` launches a detached Lifecycle-owned host process as `lifecycle agent host --provider <provider> --session-id <agent_session_id> ...`. That detached host owns the real provider runtime child process, persists a small registration file keyed by `agent_session.id`, and exposes a reconnectable loopback websocket transport back to `AgentClient`.

Rules:

1. The detached host must survive desktop restarts and rebuilds so local agent sessions are not torn down with the app runtime.
2. `provider_session_id` is still discovered by the real provider runtime and reported back to `AgentClient`; it is never the transport address.
3. The detached host registration is keyed by Lifecycle `agent_session.id`, not by terminal id or provider thread id.
4. Reattachment is app-driven: on startup, `AgentClient` should reconnect persisted live sessions through the detached host registration before waiting for the next user turn.
5. The detached host may publish an initial runtime-state snapshot on reconnect so the desktop can reconcile session status even if the app was offline.

## Workspace Checkout Type (Local)

`workspace.checkout_type` captures how a local workspace gets its git context.

1. `root` — backed directly by `project.path`; `workspace.worktree_path` resolves to the repo root
2. `worktree` — backed by a Lifecycle-created derived git worktree; Lifecycle owns the derived branch/worktree naming and cleanup lifecycle
3. `checkout_type` is distinct from `workspace.host`: `host` answers where the workspace runs (`local|docker|remote|cloud`), `checkout_type` answers how the local workspace's git context is sourced

## Interface

```typescript
interface WorkspaceClient {
  readManifest(dir_path) → manifest_status
  getGitCurrentBranch(repo_path) → branch
  ensureWorkspace(workspace + project_path + base_ref? + worktree_root? + manifest_fingerprint?) → workspace
  renameWorkspace(workspace + project_path + name) → workspace
  inspectArchive(workspace) → { hasUncommittedChanges }
  archiveWorkspace(workspace + project_path) → void
  startServices(workspace + services + manifest_json + manifest_fingerprint + service_names?) → { preparedAt }
  stopServices(workspace) → void
  readFile(workspace, file_path) → file
  writeFile(workspace, file_path, content) → file
  subscribeFileEvents(workspace_id, worktree_path?) → unsubscribe
  listFiles(workspace) → file_entries[]
  openFile(workspace, file_path) → void
  getGitStatus(workspace) → git_status
  getGitScopePatch(workspace, scope) → unified_diff
  getGitChangesPatch(workspace) → unified_diff
  getGitDiff(workspace, file_path, scope) → unified_diff
  listGitLog(workspace, limit) → git_log_entries
  listGitPullRequests(workspace) → pull_request_list
  getGitPullRequest(workspace, pull_request_number) → pull_request_detail
  getCurrentGitPullRequest(workspace) → branch_pull_request
  getGitBaseRef(workspace) → base_ref | null
  getGitRefDiffPatch(workspace, base_ref, head_ref) → unified_diff
  getGitPullRequestPatch(workspace, pull_request_number) → unified_diff
  getGitCommitPatch(workspace, sha) → commit_diff
  stageGitFiles(workspace, file_paths[]) → void
  unstageGitFiles(workspace, file_paths[]) → void
  commitGit(workspace, message) → commit_result
  pushGit(workspace) → push_result
}
```

### Responsibility Split

1. All host-aware workspace behavior goes through `WorkspaceClient`, including `ensureWorkspace`, rename, archive, files, git, and service lifecycle control.
2. Source inspection that feeds workspace provisioning, such as manifest parsing and root-repository current-branch lookup, also goes through `WorkspaceClient`.
3. `AgentClient` owns agent session lifecycle, auth, model catalog, and host-specific provider runtime execution for the selected workspace host.
4. The agent transcript source of truth is `agent_event` plus its `agent_message` / `agent_message_part` projections; provider-local logs and terminal history are not query sources.
5. Desktop file reads, writes, listings, open actions, and file-event subscriptions may route through the local host file client when the workspace has a local `worktree_path`, even if `workspace.host` is not `local`.
6. `startServices(service_names?)` may target a single service chain; workspace execution must honor manifest `depends_on` edges.
7. When `startServices(service_names?)` is called against an already-active workspace, `ready` dependency services should be treated as satisfied boundaries.
8. Local create/start flows must carry the exact manifest content plus `manifest_fingerprint`.
9. Workspace creation first inserts a `workspace` row with `status=provisioning`; the workspace route then resolves `WorkspaceClient(workspace.host)` and calls `ensureWorkspace(...)`.
10. The app root should expose `WorkspaceClient` and `AgentClient` registries only. Once the route has a real `workspace` record, it should bind a route-scoped workspace scope that resolves the concrete `WorkspaceClient` and `AgentClient` for `workspace.host`.
11. Workspace-route children should consume bound `WorkspaceClient` / agent hooks from that scoped provider rather than re-resolving host-specific clients from partial state.
12. Desktop query reads and mutations must not bypass these seams with transport-local command calls.
13. Frontend consumers should read concrete workspace-scoped facts through store/query surfaces (`workspace`, `services`, `activity`, `service_logs`, `agent_sessions`) instead of asking `WorkspaceClient` to read back runtime facts that already exist in the event/query layer.
14. Lifecycle event payloads are state facts, not invalidation hints. Desktop store collections should apply `workspace.*` and `service.*` events through store mutations instead of refreshing around native-owned DB writes.
15. Frontend manifest watchers may invalidate workspace queries when `lifecycle.json` changes, but persisted workspace/service rows must still flow through the store/server path rather than direct native SQL.
16. For `host=local`, native code is an execution substrate only. `WorkspaceClient` owns service-graph interpretation, runtime env construction, lifecycle policy, and dispatch; native receives explicit paths, commands, service configs, and env.
17. Local-native commands should converge toward capability-shaped operations (`process`, `container`, `filesystem`, `git`, `preview`, `sidecar`) rather than workspace-backend-specific policy verbs.

## Execution Model

`lifecycle.json` describes **WHAT** to run. `WorkspaceClient` owns the host-aware workspace behavior selected by `workspace.host`.

1. All workspaces are lifecycle-managed execution instances backed by `WorkspaceClient`.
2. V1 ships a host-backed workspace implementation.
3. The app root exposes `WorkspaceClientRegistryProvider` and `AgentClientRegistryProvider` only. Those providers carry host-keyed registries, not bound clients.
4. Workspace scope binds one concrete `WorkspaceClient` and one concrete `AgentClient` for `workspace.host` through `WorkspaceClientProvider` and `AgentClientProvider`.
5. Descendants inside a bound workspace scope must use `useWorkspaceClient()` and `useAgentClient()` directly. They must not resolve host-specific clients themselves.
6. `docker`, `remote`, and `cloud` are explicit workspace hosts. If a host is supported, the app must register a concrete client for it explicitly. `local` and `docker` may share the same underlying implementation for mounted local-worktree reads/writes, but that registration must still be explicit.
7. Agent execution host follows `workspace.host`. `local` and `docker` may share the same underlying agent implementation until target-native providers exist, but each host still requires its own explicit bound `AgentClient`; `remote|cloud` still fail fast until explicit host implementations ship.

### Local Provider Discipline

The local provider should behave like one host implementation among several, not like a privileged backend:

1. `WorkspaceClient` decides how to materialize and operate a local workspace from persisted records plus explicit local facts.
2. The local native layer should only execute the resulting plan against explicit local paths and runtime configs.
3. If a future `docker`, `remote`, or `cloud` host would need the same semantic operation, that semantic should live at the `WorkspaceClient` layer rather than inside native Rust.
4. Native-local helpers that are inherently OS-specific, such as "open this path in the default app" or native terminal surface sync, stay below the workspace host boundary.

## Event Foundation Contract

1. Backend and workspace mutations publish normalized fact events into the Lifecycle event foundation.
2. The desktop query cache, notifications, metrics, and future plugins are consumers of that foundation.
3. Commands may expose `before|after|failed` hooks.
4. High-frequency terminal rendering stays inside the native terminal host.
5. `WorkspaceClient.writeFile(...)` publishes a `workspace.file_changed` fact event for cache invalidation; it is not a workspace activity entry.

## Terminal Session Contract (M3+)

1. Terminal operations stay typed and imperative (`create`, `detach`, `kill`).
2. Session execution stays terminal-owned (local: native session; cloud: sandbox PTY).
3. Desktop-only geometry, visibility, focus, theme, and font synchronization stay outside the workspace host client interface.
4. `detachTerminal(workspace_id, terminal_id)` hides the active surface without terminating the session.
5. `killTerminal(workspace_id, terminal_id)` is the only action that intentionally ends a live session.
6. Terminals are shell surfaces only. Agent sessions use `AgentClient` and `agent_*` state instead of terminal rows or terminal lifecycle events.

## Targets and Aggregation

1. `workspace.host=local` means the desktop host client is authoritative.
2. `workspace.host=docker` currently uses an explicitly registered desktop client backed by the same local implementation for mounted local-worktree flows.
3. `workspace.host=remote|cloud` reserve explicit non-local placements in the shared contract.
4. Mixed-target workspace lists must be aggregated from normalized domain records.
5. Mutations from aggregated views must dispatch to the authoritative host client for that target.
6. Workspace resolution must dispatch calls by `workspace.host`.
7. Terminal control operations are workspace-scoped; `terminal_id` is never an authority boundary by itself.
8. File-tree freshness is gated by local worktree availability. Workspaces with a local `worktree_path` may use the host file subscription implementation; remote-only targets without a local path must use target-native subscriptions.

## Git Operations Contract

1. Git reads and writes are workspace-scoped execution operations.
2. Frontend callers should key git operations by `workspace_id`.
3. The public git result types must stay provider-agnostic.
4. Authoritative git mutations publish repository-level fact events.

## Host Workspace (V1)

1. Local Git worktree on host filesystem.
2. The local native substrate handles process supervision, libghostty, Docker, preview routing, and other local execution primitives. Persisted control-plane state stays behind `packages/db` and `packages/store`.
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

Surface definitions own typed `surface + options` contracts, singleton/reopen identity, and tab presentation details such as title, leading icon, and live status indicators (`isRunning`, `needsAttention`, `isDirty`). The canvas only owns placement, selection, reopen, zoom, and focus state for those surfaces.

## Pane Model

The canvas is a recursive row/column split tree. Each leaf pane contains a compact pane header strip and exactly one active surface.

## Surface Kinds

The canvas may host: terminal session, file surface, local changes review, workspace-local commit detail, preview surface, empty pane

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

Per workspace. Persist: split topology, split ratios, pane contents by identifier-only snapshot, active pane. Must **not** override backend or workspace-host-client authority.

---

# Workspace Surface Contract

The **current implementation contract** for the workspace canvas tab model.

## Tab Classes

1. Session-backed tabs: backed by workspace-owned session entities such as `agent_session_id`.
2. Canvas-backed tabs: backed by desktop-owned surface state such as `diff:commit:<sha>`, `file:<path>`, `preview:<key>`, and `pull-request:<number>`.

## Ownership Rules

1. Session lifecycle remains workspace-host-client-authoritative.
2. Canvas-backed tabs are desktop-owned UI state.
3. Desktop-owned surface layout includes `activePaneId`, split tree, and per-pane `tabOrderKeys`.

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

## Render Locality

1. Pane-local UI state must stay pane-local. File draft updates, dirty indicators, launch-menu state, and tab rename state must not invalidate sibling pane content.
2. Canvas-wide topology changes may rerender the affected branch of the split tree, but non-layout edits must not remount unrelated pane bodies.
3. Pane headers reserve a fixed trailing controls footprint so opening or closing local controls does not shift the tab strip or resize the active pane body.

## Git Diff Surfaces

1. Current local edits open as a single route-driven `Changes` dialog over the workspace canvas.
2. Repeated `Changes` opens update dialog inputs instead of opening new tabs.
3. History commit diffs remain commit-scoped tabs keyed by SHA.

## Preview Surfaces

1. Preview tabs are keyed by `preview:<key>`.
2. Service previews open in the workspace preview surface by default, keyed per service identity so repeated opens focus the existing pane.
3. Preview surfaces render as ordinary iframe-backed pane content inside the React tree.
4. Opening a preview in the system browser is an explicit secondary action from the preview toolbar.

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

1. File tabs are keyed by `file:<path>`.
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
