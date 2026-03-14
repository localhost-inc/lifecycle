# Pane Drag Geometry Contract

Date: 2026-03-13
Milestone: M4 Phase 6

## What Changed

1. Workspace tab drag/drop targeting now resolves against measured pane geometry instead of relying on `document.elementFromPoint(...)`.
2. Drag commit now reuses the last resolved preview intent so a drop cannot apply a different split/move target than the one the user just saw.
3. Drag-created pane splits now carry an explicit initial split ratio instead of always defaulting to `0.5`, so preview geometry and resulting pane sizes stay aligned.

## Why It Matters

1. `elementFromPoint(...)` is too brittle for a workspace surface that mixes DOM panes, split gutters, and sibling native terminal surfaces.
2. Recomputing drop intent on pointer-up creates a correctness gap: the committed layout can diverge from the visible preview if the DOM under the pointer changes or the final event resolves differently.
3. A fixed 50/50 drag split feels arbitrary and makes nested pane layouts hard to predict.

## Impact

1. The pane tree now has a more trustworthy drag contract: measured geometry determines preview and commit, and drag-created splits start from a deliberate size.
2. Future pane drag work should treat preview state as the source of truth for commit behavior, not as a best-effort visual hint.

## Follow-Up Actions

1. Add an integration test path for drag/drop over a live native terminal pane once we have a reliable browser-level harness for sibling native surfaces.
2. Consider extracting the pane geometry snapshot logic into a dedicated hook if `WorkspaceSurfacePaneTree` grows further.
