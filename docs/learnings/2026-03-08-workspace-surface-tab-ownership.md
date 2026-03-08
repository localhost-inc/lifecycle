## Summary

The workspace tab model must live at `WorkspaceSurface`, not in terminal-specific UI. Terminal panels are one runtime-backed tab kind, but launcher, diff, and future editor tabs all share the same workspace-owned strip, ordering, close semantics, and hotkeys.

## What Changed

1. Added workspace-owned persisted tab presentation state for mixed tabs:
   - `tabOrderKeys`
   - `hiddenRuntimeTabKeys`
2. Defined launcher tabs as desktop-owned workspace documents.
3. Moved workspace shortcut intent handling out of the terminal feature contract and into the workspace surface contract, while still allowing the native Ghostty view to forward focused key equivalents.
4. Changed runtime tab close behavior from kill to detach/hide at the workspace strip level.

## Why It Matters

The previous terminal-first composition leaked provider/runtime concerns into the shared tab bar. That made standard tab behavior harder to implement correctly because the strip belonged to a terminal surface instead of the workspace surface that actually owns mixed tabs.

## Milestone Impact

1. M3 now treats the launcher as the default entry tab for local terminal workflows.
2. Terminal lifecycle remains provider-owned, but tab ordering and visibility are explicitly desktop-owned workspace state.

## Follow-Up Actions

1. Keep future file editor and preview tabs on the same `WorkspaceSurface` model instead of creating feature-local tab strips.
2. If additional native surfaces can take focus later, have them emit the same workspace shortcut intent contract rather than introducing feature-specific hotkey paths.
