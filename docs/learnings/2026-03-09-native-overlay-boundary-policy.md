# Native Overlay Boundary Policy - 2026-03-09

## Context

The desktop app now embeds the active terminal as a native `NSView` above the Tauri `WKWebView`. That made the Git action popover fail in the workspace right rail: the popover was wider than the rail, spilled left over the terminal lane, and the native surface occluded part of it.

## Observation

1. A React portal only changes DOM placement inside the webview. It does not move content above sibling native views.
2. Overlay bugs around the native terminal are usually geometry problems, not missing `z-index`.
3. We need two different overlay paths:
   - DOM overlays that stay inside a non-native boundary such as the right rail.
   - Native overlays for actions that must cross over the terminal lane.

## Decision

1. Treat `data-overlay-boundary` regions as safe DOM lanes for popovers, menus, and similar floating UI.
2. Constrain right-rail overlays to the rail width instead of allowing them to spill into the native terminal area.
3. Keep the existing native menu/child-window path for overlays that must appear above the terminal surface.

## Impact on Milestones

1. M5: workspace lifecycle and Git rail actions can keep using custom web UI as long as those overlays stay inside the rail boundary.
2. M5: title bar actions that need to cross the terminal lane should continue to use native presentation.
3. M6: future command surfaces should choose their overlay mode up front instead of relying on a later `z-index` fix.

## Follow-Up Actions

1. Reuse the boundary-aware overlay path for other right-rail and inspector popovers.
2. Add a native child-window/panel path for custom overlays that need text input above the terminal lane.
3. Keep tooltip and menu designs compact near native surfaces so they can remain boundary-contained when possible.
