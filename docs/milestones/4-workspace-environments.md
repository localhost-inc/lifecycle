# Milestone 4: "I can run and control a local workspace environment"

> Prerequisites: M3
> Introduces: local environment run/restart/stop/destroy, local preview, mutation locking, terminal/service separation
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

## Goal

M4 turns a local workspace into a controllable execution environment. Services can be started, restarted, stopped, previewed, and destroyed cleanly, with mutation locking and clear separation between agent terminals and service runtime state. No cloud, no auth, no network.

## Lifecycle Boundary

M4 should stop treating "workspace" and "environment" as the same thing.

1. `workspace`
   - durable shell, identity, worktree ownership, provider mode, archive metadata
2. `environment`
   - the singleton runnable service/process/container layer attached to a workspace
   - can go up and down without destroying the workspace
3. `service`
   - per-service runtime state inside the environment

Implementation direction:

1. Environment lifecycle state lives on a dedicated `environment` record keyed by `workspace_id`.
2. M4 should normalize toward:
   - workspace lifecycle metadata on `workspace`
   - environment lifecycle state and failure metadata on `environment`
3. `archive` is a workspace-lifecycle action and must drive the environment down as part of that transition.
4. `destroy` is a workspace-lifecycle action that tears the environment down and then removes the workspace.
5. Ordinary `start` and `stop` act on the environment, not on durable workspace existence.

## What You Build

1. `run` (start from `idle`, including workspace preparation when required, or restart through a full stop cycle) and `reset` (restore post-prepare baseline without introducing a separate `resetting` status).
2. Local stop (explicit SIGTERM process group with visible `stopping` state).
3. Local destroy (kill process group, prune git worktree, clean SQLite).
4. Local preview (stable Lifecycle-owned local proxy URL routed to the current service port).
5. Service share toggles and port overrides in desktop UI (local-scoped).
6. Terminal access stays available while services are stopped, as long as the workspace worktree still exists.
7. Mutation locking hardened with typed errors.
8. Desktop app: local environment controls, destruction confirmation, and explicit `idle|starting|running|stopping` indicators.
9. A Rust-side per-workspace runtime controller that owns preparation tasks, environment tasks, service supervisors, terminal runtime state, and destructive locking.
10. Provider-owned terminal creation so `createTerminal(...)` returns a live session rather than a deferred attach placeholder.
11. Terminal create must return a live session immediately; cross-restart session continuity remains deferred until a stable external host is worth the tradeoffs.
12. Authoritative fact coverage and reload-safe query hydration for lifecycle progress, service configuration, and activity state.

## Implementation Contracts

### Run/Reset Semantics

- **`run`**: restart all workspace service nodes using project-level `environment` config plus workspace-level service overrides from `service` records.
- **`reset`**: restore baseline fixtures and restart all defined services. This remains a runtime/product flow; it is not manifest-configurable in `lifecycle.json` yet.

### Workspace Persistence Contract (Local)

**Mental model:** A Lifecycle workspace is a reproducible environment with optional hibernation, not a persistent VM. Every wake is a partial reconstruction. Reproducibility > persistence.

Part of the local environment stop/start contract.

#### Local Workspace Runtime Persistence

What survives while the environment is idle:

| Resource                            | Survives sleep? | Mechanism                                        |
| ----------------------------------- | --------------- | ------------------------------------------------ |
| Filesystem / worktree               | Yes             | Already on disk -- no backup needed              |
| Git uncommitted changes             | Yes             | Already on disk                                  |
| Dependency cache                    | Yes             | Already on disk                                  |
| Docker images                       | Yes             | Docker Desktop manages image cache               |
| Docker volumes (e.g. Postgres data) | Yes             | Docker Desktop preserves volumes across restarts |
| Running processes                   | No              | SIGTERM process group on stop; restart on run    |
| Workspace metadata                  | Yes             | Stored in Tauri SQLite                           |

Stop/start contract:

1. Stop: transition `running -> stopping -> idle` while sending SIGTERM to the process group (services + containers). Worktree remains on disk.
2. Run from idle: transition `idle -> starting -> running`. Workspace preparation may run during `starting`, but it is not a separate public environment status. Skip workspace preparation and `git clone` once `prepared_at` is set.
3. Docker volumes survive idle periods; no re-seed is needed unless explicitly requested via `reset`.

#### Restart vs Reset

- **Restart from idle** = restore "where you left off." Filesystem preserved, all services restarted, no re-seed. Skips workspace preparation and `git clone`.
- **Reset** = restore "known-good baseline." Filesystem reset to post-prepare state, data re-seeded, services restarted.

### Destroy Flow (Local)

- Kill process group, prune git worktree, clean SQLite metadata
- Workspace `destroy` hard-terminates any non-finished/non-failed terminal

### Live Preview Lifecycle (Local)

#### Contract (provider-agnostic)

1. **Scope**:
   - preview is defined per `service` record and represents routable access to an active service port inside a workspace execution environment
   - one workspace can expose multiple preview endpoints (for example `api`, `admin`, `docs`)
   - preview routing is workspace-runtime-owned; openability is derived from environment + service runtime state

2. **Protocol support**:
   - HTTP/HTTPS and WebSocket (`ws/wss`) upgrade must be supported
   - Long polling and server-sent events must pass through without gateway buffering breakage
   - Raw TCP/UDP access is out of scope for preview URLs

3. **UX guarantees**:
   - preview URL remains stable for the life of the workspace (including hot reload, port reassignment, and wake cycles)

#### Local Workspace Runtime Preview

1. **Routing model**:
   - `preview_url` is a stable Lifecycle-owned local proxy URL under `*.lifecycle.localhost`, using readable hostnames in the shape `<service>.<workspace>.lifecycle.localhost`
   - the proxy resolves the current `service.assigned_port` at request time
   - `assigned_port` is discovered and assigned at start time for the current run; it is not the user-facing preview address
   - there is no separate preview status machine; the UI derives preview availability from `environment.status`, `service.status`, and `assigned_port`

2. **Limitations**:
   - no TLS by default
   - tunnel-based sharing (e.g., Cloudflare Tunnel, ngrok) is expansion-scope

### Mutation Concurrency

Full error catalog: [reference/errors.md](../reference/errors.md)

- Transitional environment states reject new workspace/environment mutations with `workspace_mutation_locked` error
- Only `idle` and `running` states accept mutation requests

### Remediation Order (Current Architecture Gaps)

The current local runtime still splits authority across React surface state, Tauri commands, SQLite rows, supervisor maps, and native terminal attach behavior. M4 should close that gap in the following order.

#### Phase 1: Per-Workspace Runtime Controller

1. Introduce a Rust-side controller/actor keyed by `workspace_id`.
2. The controller owns preparation subprocess handles, environment task handles, service supervisors, terminal runtime handles, and destructive lock state.
3. `run`, `stop`, `reset`, `destroy`, `createTerminal`, `detachTerminal`, `killTerminal`, and future `sleep`/`wake` route through controller entrypoints rather than mutating each subsystem independently.

First implementation slice:

1. Add the controller registry, typed controller command/context types, and a cancellation model without expanding product behavior yet.

Exit condition:

1. All local runtime side effects for one workspace can be enumerated and cancelled from one authoritative Rust boundary.

#### Phase 2: Provider-Owned Terminal Sessions

1. `createTerminal(...)` must provision or register a live session before returning. Persisting a `terminal` row alone is not sufficient.
2. Native surface sync becomes presentation-only: geometry, visibility, focus, theme, font, and attach-to-existing-session behavior.
3. Terminal persistence reflects runtime truth; React surface mount must not be the first place a terminal actually starts.

Status (2026-03-13):
Local native terminal creation now provisions a live session before `terminal.created` is emitted, and surface sync reuses controller-owned session metadata instead of being the first launch point. Broader mutation-authority cleanup and typed event/error coverage are still pending later phases.

First implementation slice:

1. Move launch resolution, native session registration, and harness observer bootstrap into `create_terminal`, while keeping the surface sync API temporarily backward-compatible.

Exit condition:

1. A created terminal exists and can be queried before any workspace surface mounts.

Status (2026-03-13):

1. Local `create_terminal` now provisions a hidden native session immediately and stores controller-owned terminal session metadata for later attach/sync calls.
2. Sleeping terminal rows still recover through the first attach after app restart; a dedicated restore path remains follow-up work.

Status (2026-03-15):

1. The external `tmux` session-host experiment was rolled back after native side effects made the integrated terminal UX worse.
2. Local terminal creation still validates launch configuration before returning, but the live process is again owned by the native Ghostty surface inside the running desktop app.
3. Desktop app restart is therefore still a terminal termination boundary for local sessions.

#### Phase 3: Destructive Locking And Cancellation

1. Add a dedicated destructive mutation lock separate from the environment status machine. Do not overload the workspace shell record with a new destructive enum.
2. `stop` and `destroy` must cancel preparation and environment task subprocesses in addition to supervisor-managed services and live terminal sessions.
3. Rename, terminal create/attach, and other mutable operations reject during the destructive window with typed conflict errors.

First implementation slice:

1. Route `stop` and `destroy` through controller-managed cancellation fanout before worktree prune and SQLite cleanup.

Exit condition:

1. No preparation task, environment task, service process, or terminal can outlive a completed local stop or destroy flow.

Status (2026-03-13):

1. `stop` and `destroy` now cancel controller-owned runtime work before cleanup, and `destroy` always creates a controller lock even for previously idle workspaces.
2. Workspace rename, manifest sync, service updates, terminal rename/attachment writes, git write operations, and workspace file writes now reject with `workspace_mutation_locked` when a destroy is in progress.

#### Phase 4: Typed Errors And Authoritative Fact Coverage

1. The Tauri boundary must return an error envelope aligned with [reference/errors.md](../reference/errors.md): `code`, `message`, `details`, `request_id`, `suggested_action`, `retryable`.
2. Provider-owned lifecycle mutations publish normalized facts for manifest sync outcomes, service status/log changes, and terminal/workspace lifecycle changes.
3. React surfaces branch on error `code` and consume facts; they must stop repairing cache state manually after local mutations.

First implementation slice:

1. Serialize `LifecycleError` into a typed envelope and add authoritative fact emission for manifest sync completion.

Exit condition:

1. Workspace and environment mutations can drive desktop updates without component-local cache invalidation or `String(error)` fallbacks.

Status (2026-03-13):

1. `LifecycleError` now serializes through a typed Tauri error envelope with `code`, `message`, `details`, `requestId`, `suggestedAction`, and `retryable` fields, and the desktop workspace/terminal APIs normalize object or string payloads through a shared helper.
2. Manifest file watchers only invalidate the affected workspace queries. Backend-owned service reads reconcile idle manifest state from `lifecycle.json` before returning data.
3. `WorkspaceLayout` no longer manually invalidates workspace/service queries after manifest sync, and the main workspace lifecycle surfaces now format user-facing failures from typed error codes instead of raw `String(error)` fallbacks.

#### Phase 5: Recoverable Projections And Provider Adoption

1. Environment state, services, service logs, and activity must load from authoritative workspace-scoped selector/query APIs on initial mount and continue refreshing from those backend-owned selectors as future facts arrive.
2. The desktop app should adopt explicit `ControlPlane` and `WorkspaceRuntime` abstractions in `packages/runtime` instead of calling Tauri commands directly from feature APIs and query source code.
3. Query and mutation call sites should target control-plane or workspace-runtime operations keyed by project/workspace identity, not transport-local command names.

First implementation slice:

1. Add direct reads for service log and activity state, and introduce control-plane/runtime-backed adapters in the desktop query source and mutation paths.

Exit condition:

1. Reload and late-mount recover current lifecycle state without depending on uninterrupted event delivery.

Status (2026-03-13):

1. The Rust workspace controller now owns service-log and activity selectors that can be fetched through `get_workspace_service_logs` and `get_workspace_activity`.
2. Desktop service-log and activity hooks read those workspace-scoped selectors directly, and future lifecycle facts only invalidate/refetch the affected queries instead of being reduced into frontend-owned projections.
3. Desktop workspace create/rename/destroy, workspace catalog reads, project list/manifest reads, and project-level branch lookup now flow through the local `ControlPlane`; live workspace environment/service/file/terminal/git reads and mutations flow through the local `WorkspaceRuntime`.
4. `features/workspaces/api.ts`, `features/workspaces/catalog-api.ts`, `features/projects/api/projects.ts`, `features/projects/api/current-branch.ts`, `features/terminals/api.ts`, `features/git/api.ts`, and the desktop query source no longer invoke transport-local Tauri command names directly for control-plane or runtime-backed reads.
5. The remaining direct desktop calls are intentionally narrower and explicitly separated into non-runtime modules: project import/remove flows, host app-launch helpers, and native terminal surface synchronization.

#### Phase 6: Workspace Surface Split And Tab Store Normalization

1. `features/workspaces` owns pane and tab orchestration only.
2. File draft state, conflict state, save/discard prompts, and file-session bookkeeping live in `features/files`.
3. Extract a controller layer from the workspace canvas host so the rendered view stays declarative and does not carry mutation authority or file-editor lifecycle.
4. Normalize runtime-tab identity, document-tab identity, pane-local order, hidden runtime keys, and per-tab view state into one coherent store model.

First implementation slice:

1. Move file-session ownership out of the workspace canvas host and introduce a dedicated canvas controller module that only composes workspace, terminal, and file feature state.

Exit condition:

1. The workspace canvas host is for runtime-backed tabs and document tabs, not the implementation owner of file editing behavior.

Status (2026-03-13):

1. File-session ownership for dirty state, conflict tracking, pruning, and close-confirmation copy now lives in `features/files/state/workspace-file-sessions.ts` instead of being embedded directly in the canvas host.
2. `WorkspaceCanvas` now composes that file-session controller as feature-owned state while continuing to host pane/tab orchestration.
3. `WorkspaceCanvas` now delegates runtime/document/pane derived state, terminal/document mutation handlers, and keyboard/native-shortcut side effects to `workspace-canvas-controller.tsx`, leaving the render component as a thin declarative shell over `WorkspacePaneTree`.
4. Workspace-surface state now keys document tabs by `documentsByKey` internally, and the controller derives ordered document arrays for view-only consumers instead of treating the array as authoritative state.
5. Hidden runtime visibility and per-tab view state now share one `tabStateByKey` store instead of being tracked in parallel `hiddenRuntimeTabKeys` and `viewStateByTabKey` maps.
6. The old pre-`rootPane` persistence fallback is gone; legacy snapshots that only stored `activeTabKey` or `tabOrderKeys` without a pane tree now normalize to the default empty pane layout instead of being silently reconstructed.
7. The previous `workspace-surface-logic.ts` grab bag has been replaced by focused modules for reducer transitions, tab helpers, shortcut/platform helpers, IDs, and open-document request types.
8. Pane layout nodes are now layout-only; `paneTabStateById` owns per-pane active selection and tab membership, so tab/document/runtime mutations no longer rewrite the pane tree just to move tabs around.
9. Controller/runtime derivation now consumes pane snapshots built from `paneTabStateById` instead of reading raw pane-state maps directly in each helper call site.
10. Pane drag/drop targeting now resolves against measured pane geometry and reuses the last visible drop intent at commit time, removing the old `elementFromPoint(...)` dependency and keeping preview/result behavior aligned.
11. Pane selection now validates pane existence and tab membership at the reducer boundary, so stale `select-tab` actions can no longer create orphan pane state or point `activePaneId` at a non-existent layout leaf.
12. Rendered pane activity is now derived separately from stored pane selection intent, and runtime waiting state only appears when a pane has no visible fallback tab while a selected live runtime tab is still attaching.
13. Workspace pane topology now flows through an explicit layout contract (`inspect/split/close/update`) instead of letting reducers and controllers manipulate the recursive pane tree through scattered helper combinations.
14. `activePaneId` is now canonical non-null surface state, and controller/render code no longer carries a “fallback to the first pane” recovery path when pane selection is invalid.
15. Drag-created pane splits now carry an explicit initial ratio instead of defaulting every drag split to `0.5`, which makes nested pane sizing more predictable.
16. Pane drag/drop targeting now uses explicit edge zones for split behavior and reserves same-pane body-center drops as no-ops, which makes drop previews and committed split results align more closely.
17. Nested split groups now stretch to fill their allocated split space instead of collapsing to content height, which removes the dead-gap layout bug after repeated top/bottom drag splits.
18. Closing the last tab in a pane, or moving it into an already-existing pane, now collapses that emptied source pane while preserving a single empty pane as the workspace landing surface and preserving newly created split panes during split-drag flows.
19. Pane drag/drop body targeting now resolves against the actual pane body element instead of the full pane shell, so header controls are no longer accidental split targets and top-edge split math starts below the header.
20. Pane drag feedback now renders as a first-class overlay from the same measured body geometry used by the resolver, which makes the visible landing zones line up with the committed body-drop result instead of only showing an inferred preview inside pane content.
21. Pane drop geometry, zone resolution, and overlay rendering now live in a dedicated `workspace-pane-drop-zones.tsx` module instead of being embedded in `workspace-pane-tree.tsx`, so the pane tree is back to owning layout wiring rather than hidden drag authority.
22. The remaining Phase 6 work is still open: continue trimming canvas controller/view complexity now that the pane-state ownership migration is complete.

#### Sequencing Guardrails

1. Do not reintroduce environment lifecycle state onto `workspace`; use `environment.status` plus explicit lock/context state instead.
2. Do not let native surface sync remain session-launch authoritative after Phase 2.
3. Do not ship new UI-local cache repair for service or manifest mutations; missing fact coverage should block completion instead.
4. Keep the local terminal path native-host-only. This plan does not revive PTY fallback semantics.
5. Land regression coverage with each phase: terminal create-before-attach, stop/destroy cancellation, typed error envelopes, authoritative fact reduction, and reload recovery.

### Terminal / Service Separation

- Environment `idle` means services are down while the worktree remains available for interactive terminal work.
- Terminal create/attach stays available whenever the workspace has interactive context.
- Workspace `destroy` still hard-terminates any non-finished/non-failed terminal.
- Terminal state machine: [reference/state-machines.md](../reference/state-machines.md)

### SLOs

Full SLO targets: [reference/slos.md](../reference/slos.md)

Key M4 targets:

- p95 workspace restart from idle: <= 5s (local)
- p95 workspace create to `running`: <= 30s (local)

## Desktop App Surface

- **Run button**: restart all services from manifest + overrides
- **Per-service run controls**: boot an individual service and whatever its dependency chain requires, from either `idle` or an already-`running` environment
- **Reset button**: restore post-prepare baseline, re-seed, restart
- **Destroy button**: kill workspace with confirmation dialog
- **Reset/destroy confirmation**: explicit confirmation dialogs with workspace identifier
- **Workspace extension strip**: workspace-scoped right-edge strip for Git and Environment, visible only on workspace tabs
- **Extension panel model**: one active extension panel at a time, opening to the left of the strip with persisted width
- **Environment status indicators**: `idle`, `starting`, `running`, and `stopping`
- **Service share toggles**: per-service on/off toggle in the Environment extension (local-scoped)
- **Port overrides**: editable port field per service in the Environment extension
- **Preview URL display**: stable `*.lifecycle.localhost` URL with copy button in the Environment extension

## Exit Gate

- Full local environment loop works: create -> run -> terminal -> reset -> stop -> run -> preview -> destroy
- `run` restarts services without re-running workspace preparation
- Per-service run boots the selected service plus its manifest dependencies
- Additive per-service run from `running` preserves already-ready dependency services instead of restarting them
- `reset` restores post-prepare baseline and re-seeds data
- Idle environment shows `idle` state and can be started again without recreating the worktree
- Destroy shows confirmation dialog -> confirms -> workspace gone, worktree pruned
- Terminal remains usable while services are idle
- Share toggle -> preview URL shows stable `*.lifecycle.localhost`

## Test Scenarios

```
workspace running -> run -> services stop, then restart through idle, then running again
workspace running -> run docs -> docs chain boots through starting -> running without restarting unrelated ready services
workspace idle -> run www -> api boots automatically through depends_on -> running
workspace running -> reset -> services restart and data is re-seeded without a separate resetting status
workspace running -> stop -> SIGTERM sent -> stopping -> idle
workspace idle -> terminal remains usable -> run -> services restart -> running
destroy workspace -> confirmation dialog -> confirm -> workspace removed -> worktree pruned -> clean state
share service -> preview URL shows stable `*.lifecycle.localhost` -> opens in browser
mutation during transitional state -> workspace_mutation_locked error
```
