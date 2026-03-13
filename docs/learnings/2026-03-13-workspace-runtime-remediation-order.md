# Per-Workspace Runtime Authority Should Converge On A Rust Controller

Date: 2026-03-13
Milestone: M4 with M5 and M6 follow-on impact

## Context

A read-only architecture review found that local runtime authority is still fragmented across React surface state, Tauri commands, SQLite rows, supervisor maps, and native terminal attach behavior.

The concrete gaps were:

1. `create_terminal` persists metadata, but the live native session is still launched later from surface sync.
2. `stop_workspace` and `destroy_workspace` stop supervisor-managed services, but setup and environment task subprocesses are not owned by the same cancellation path.
3. Destroy-time mutations are not serialized behind a dedicated destructive lock.
4. `LifecycleError` is modeled as typed Rust enums, but the Tauri boundary serializes it as a plain string.
5. Query reducers and desktop components still rely on partial event coverage and manual cache repair.
6. A `WorkspaceProvider` abstraction already exists in `packages/runtime`, but the desktop app still talks to Tauri commands directly in many places.

## Learning

The remediation order matters. The highest-leverage sequence is:

1. Introduce a per-workspace Rust controller that owns setup tasks, environment tasks, service supervisors, terminal runtime state, and destructive locking.
2. Make terminal creation provider-owned so `createTerminal(...)` returns a live session before any React surface mounts.
3. Route stop and destroy through controller-managed cancellation fanout and a dedicated destructive lock.
4. Restore typed error envelopes and finish authoritative fact coverage for lifecycle and service mutations.
5. Hydrate progress and activity projections from authoritative snapshots, then reduce future facts.
6. Only then split `WorkspaceSurface` into controller/view responsibilities and finish normalizing the tab store.

One implementation detail matters here: if the query layer needs to refetch after every lifecycle mutation, the UI still leaks transport knowledge. The better pattern is:

1. emit typed facts for local mutations that only patch one record in place (for example service exposure/port/preview changes)
2. emit authoritative post-reconcile projections when a mutation can add, remove, or reorder records (for example manifest sync updating the full `workspace_service` set)
3. keep component code unaware of cache repair mechanics

Doing the UI cleanup first would mostly move the same authority problems around. Correctness has to move to the Rust/provider boundary before the React surface can get meaningfully simpler.

## Milestone Impact

1. M4 now needs to treat runtime ownership consolidation as core scope, not optional cleanup after local environment controls ship.
2. M5 CLI work should reuse the same controller and provider boundary instead of introducing parallel local lifecycle semantics.
3. M6 cloud attach and cloud provider work can reuse the same authority model once the local path is coherent.

## Follow-Up Actions

1. Keep the concrete execution order in [docs/milestones/m4.md](../milestones/m4.md) aligned with actual implementation progress.
2. Do not add new ad hoc `workspace.status` values for destructive flows; use explicit lock/context state instead.
3. Add regression coverage per phase for terminal create-before-attach, stop/destroy cancellation, typed error envelopes, fact-driven cache updates, and reload recovery.
4. Keep pushing typed error helpers toward all workspace-adjacent surfaces until the remaining raw `String(error)` paths are gone.
