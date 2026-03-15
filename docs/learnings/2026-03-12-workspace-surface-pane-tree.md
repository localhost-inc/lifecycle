# Workspace Surface Pane Tree

## Context

The workspace surface started as one mixed tab strip with one `activeTabKey`. That model held for launcher, terminal, diff, and file tabs until split panes became a real product need. Adding horizontal and vertical splits means the center surface is no longer "which tab is active?" but "which pane is focused, which tab is active inside each leaf, and how is the pane tree laid out?"

## Superseded Note

1. Item 9 below was revised on 2026-03-15 after pane-close testing showed that merging the clicked pane's tabs into the survivor read as closing the wrong pane.

## Learning

1. Split panes require a tree-shaped surface model. A flat `tabOrderKeys` list cannot express horizontal and vertical nesting, pane-local active tabs, or future pane-targeted actions.
2. The durable surface state needs two levels of selection:
   - `activePaneId` for keyboard shortcuts, launcher placement, and default open targets
   - `pane.activeTabKey` for the visible document/runtime inside each leaf
3. Split nodes should own only layout concerns (`direction`, `ratio`, child pointers). Leaf panes should own tab concerns. Mixing those responsibilities into one node shape makes restore and reducer logic harder to reason about.
4. Tabs should stay single-owned even after panes exist. Reopening an already-open diff, file, PR, or terminal should focus the pane that already owns it instead of duplicating the tab across panes.
5. Splitting should create an immediately usable sibling pane by seeding a launcher into the new leaf. An empty pane with no launcher creates a dead surface and pushes setup complexity into unrelated reducers.
6. Cross-pane tab drag/drop should transfer tab ownership, not mirror the same tab into both panes. When the destination pane is only a launcher placeholder, the moved tab should replace that placeholder.
7. The VS Code editor-group model is the right interaction target for splits:
   - drop on the center of another pane to move into that group
   - drop on its tab strip to place before or after a specific tab
   - drop on a pane edge to create a new split on that side
8. Native terminal visibility and terminal focus are no longer the same thing. Multiple terminal panes may be visible at once, but only the focused pane's active terminal should receive Ghostty focus and pointer input.
9. The first pane-close implementation tried to merge the clicked pane's tabs into the sibling leaf to preserve user state, but that behavior was later rolled back because it read as closing the wrong pane in stacked layouts.
10. Restore compatibility matters because the pane-tree change replaces a persisted shape. Reading legacy flat snapshots into a single root leaf keeps existing local state usable without adding a long-lived compatibility layer.

## Milestone Impact

1. M3: confirms the workspace surface can evolve beyond a single tab strip without changing runtime-tab ownership or native terminal lifecycle semantics.
2. M4: makes it practical to keep environment controls, files, diffs, and terminals visible together in one workspace while preserving explicit provider/runtime boundaries.

## Follow-Up Actions

1. Add pane-focus shortcuts so keyboard-heavy users can move focus without clicking.
2. Consider drag previews or directional overlays so split-edge targets are more visually explicit while dragging.
3. Consider pane presets or saved layouts only after restore UX for the base tree feels reliable.
4. Keep document and runtime tab restore logic pane-aware as more tab types are added.
