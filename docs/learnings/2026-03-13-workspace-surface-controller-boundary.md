# Workspace Surface Should Render, Not Orchestrate Runtime Side Effects

Date: 2026-03-13
Milestone: M4

## Context

`WorkspaceSurface` had already shed file-session ownership, but it was still directly owning:

1. runtime/document/pane derived state
2. terminal create/detach flows
3. keyboard shortcut handling
4. native terminal shortcut subscriptions
5. window-close interception for tab closing

That kept the view component coupled to runtime authority even after the provider boundary cleanup landed.

## Learning

A useful intermediate boundary is a dedicated surface controller hook that owns orchestration and side effects while the render component stays declarative.

For the workspace surface, the practical split is:

1. `workspace-surface-controller.tsx`
   - reducer state and derived pane/runtime projections
   - runtime/document mutation handlers
   - keyboard/native shortcut and window-close side effects
2. `workspace-surface.tsx`
   - error chrome
   - prop wiring into `WorkspaceSurfacePaneTree`

This does not solve tab-store normalization by itself, but it removes the main view-layer mutation authority so later identity/store work can happen in a smaller surface area.

## Milestone Impact

1. M4 Phase 6 now has both feature-owned file session state and a dedicated surface controller boundary in place.
2. The remaining Phase 6 work is narrower: tab identity, pane-local ordering, hidden runtime keys, and view-state normalization.

## Follow-Up Actions

1. Normalize runtime-tab/document-tab identity into one coherent store model.
2. Collapse pane-local order and per-tab view state into clearer controller-owned primitives.
3. Keep new runtime side effects out of `WorkspaceSurface`; add them to the controller layer or feature-owned modules instead.
