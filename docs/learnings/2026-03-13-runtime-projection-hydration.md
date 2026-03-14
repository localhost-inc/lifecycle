# Renderer Reload Recovery Needs A Backend-Owned Runtime Projection

Date: 2026-03-13
Milestone: M4

## Context

Workspace setup progress, environment task progress, and activity state were previously modeled as append-only frontend queries that bootstrapped with `[]` and only listened for future lifecycle events.

That meant a renderer reload or late-mounted surface lost current runtime context even when the Rust process still knew exactly what the workspace was doing.

## Learning

Reload recovery for an event-driven desktop app should not depend on uninterrupted renderer subscriptions. The backend needs to own a queryable projection for any lifecycle state that users expect to survive:

1. controller-owned setup step snapshots
2. controller-owned environment task snapshots
3. a bounded activity fact log

The frontend should fetch that projection once, then continue reducing future facts on top of the fetched baseline. That keeps the query layer event-driven without making the renderer authoritative for runtime history.

One related detail matters: the projection should store authoritative facts, not already-rendered UI copy. That lets React rebuild view-specific summaries without coupling the backend to one presentation model.

## Milestone Impact

1. M4 Phase 5 can deliver reload-safe lifecycle surfaces before full provider adoption is complete.
2. The remaining provider migration should target the same projection and mutation boundary instead of adding another desktop-local cache layer.
3. Provider adoption is strongest when workspace-scoped reads and mutations move together; routing only mutations still leaves the renderer coupled to transport-local query names.

## Follow-Up Actions

1. Keep aggregate control-plane queries and native surface helpers explicitly outside `WorkspaceProvider`; do not let them drift back into workspace-scoped feature APIs by accident.
2. Decide whether full app relaunch recovery needs persisted projections or whether in-process controller lifetime is sufficient for M4.
3. Keep new lifecycle surfaces fact-backed; do not introduce new `[]`-bootstrap event-only queries for runtime state.
