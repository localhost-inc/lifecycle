# Pane Selection And Rendering Contract

Date: 2026-03-13
Milestone: M4 Phase 6

## What Changed

1. Workspace pane selection now validates pane existence and tab membership at the reducer boundary before mutating pane-local state.
2. Stale `select-tab` dispatches can no longer fabricate orphan pane state for pane ids that do not exist in the layout tree.
3. Rendered pane tab selection is now treated as a derived view concern, separate from the pane's stored selection intent.
4. Runtime waiting state now only appears when a pane is actually waiting to render a selected runtime tab and has no visible fallback tab already rendering.
5. `activePaneId` is now canonical non-null surface state, and the controller no longer carries a “pick the first pane if active is invalid” recovery path.

## Why It Matters

1. `rootPane` is the authority on pane existence. Reducer actions must not be able to create pane-local state for ids outside that tree.
2. A pane can store a selected runtime tab that is not yet visible. That does not make it the rendered active tab if another visible tab is already on screen.
3. Reusing one `active` concept for both stored selection intent and rendered output makes drag, focus, and loading behavior hard to reason about.
4. Controller-level fallback logic hides model bugs. If pane repair is needed, it belongs in normalization and reducer ownership, not in the render/controller layer.

## Impact

1. Pane selection and tab rendering now have a clearer authority split: reducer state stores pane-local selection intent, and view helpers derive the rendered active tab from visible tabs.
2. Loading affordances are less misleading because a pane no longer advertises “waiting for runtime” when it is already rendering a different visible tab.
3. The render/controller layer now consumes a required active pane contract instead of improvising backup pane selection.

## Follow-Up Actions

1. Continue shrinking `WorkspaceSurfaceController` so persistence, provider mutations, and window/platform policy do not remain coupled in one module.
2. Move the workspace pane tree toward a more explicit grid/split contract modeled on VS Code editor groups and split view ownership.
