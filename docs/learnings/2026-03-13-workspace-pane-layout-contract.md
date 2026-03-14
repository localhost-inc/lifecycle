# Workspace Pane Layout Contract

Date: 2026-03-13
Milestone: M4 Phase 6

## What Changed

1. Workspace pane topology now has an explicit layout contract in `workspace-surface-panes.ts` instead of exposing raw recursive tree helpers directly to reducers and controllers.
2. Pane callers now go through `inspectWorkspacePaneLayout(...)`, `getWorkspacePane(...)`, `splitWorkspacePaneLayout(...)`, `closeWorkspacePaneLayout(...)`, and `updateWorkspacePaneLayoutSplit(...)`.
3. Reducer and controller code no longer compute pane count, first pane fallback, or split/close semantics by manually traversing the layout tree.

## Why It Matters

1. Raw tree surgery spreads layout semantics across reducers, controllers, persistence, and drag code. That makes split, close, and selection behavior harder to reason about and easier to break.
2. A dedicated layout contract is closer to how VS Code models editor-group and split-view ownership: topology operations live behind one boundary, and the rest of the surface consumes explicit outcomes.
3. Drag/drop and resize work needs a trustworthy topology layer underneath it. Without that, UI-level fixes keep fighting hidden layout inconsistencies.

## Impact

1. Pane layout operations now have explicit success/failure results, which keeps reducer transitions honest when a pane or split id is stale.
2. State normalization, pane selection, and layout mutation now share one pane-topology vocabulary instead of each re-deriving layout facts independently.

## Follow-Up Actions

1. Move the layout model further toward an explicit grid/split state with first-class operation types, instead of keeping the raw recursive tree as the only serialized structure.
2. Keep drag overlay targeting and resize behavior layered on top of the layout contract, not mixed back into pane-tree traversal logic.
