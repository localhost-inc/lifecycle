# Reactive Store Client for Desktop Data

## Context

The desktop app had started to split live data ownership across route loaders, layout components, and feature components. Workspace status patching lived in the dashboard layout, workspace detail state lived in the workspace panel, and transport code in the workspace API file was already acting like an event bus.

## Learning

For this app, the right abstraction boundary is:

1. `apps/desktop/src/store` owns the reactive cache, subscriptions, and event reduction.
2. Feature hooks expose normal domain reads such as `useProjectCatalog`, `useWorkspacesByProject`, `useWorkspace`, `useWorkspaceServices`, and `useWorkspaceSetup`.
3. Imperative backend/provider APIs stay transport-oriented and mutation-oriented.

This keeps reactivity implicit at the hook layer while leaving source authority explicit inside the store. It also gives the desktop app one app-facing channel for local Tauri state now and mixed local-plus-Convex aggregation later.

## Milestone Impact

1. M2: removes loader-owned runtime state for current project/workspace surfaces.
2. M3: creates a reusable event-driven substrate for terminal and harness runtime state.
3. M6: preserves a clean insertion point for Convex-backed remote sources without rewriting UI call sites.

## Follow-Up Actions

1. Add explicit collection-change events for projects and workspaces on the Rust side so the store can reduce more events directly and rely less on targeted invalidation after mutations.
2. Move future terminal/runtime streams through the same store client instead of introducing component-local subscriptions.
3. Introduce multi-source aggregation rules in the store when cloud workspaces and local workspaces are shown together.
