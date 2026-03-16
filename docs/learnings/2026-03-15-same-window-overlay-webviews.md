# Same-Window Overlay Webviews - 2026-03-15

## Context

The desktop app renders native terminal surfaces as sibling `NSView`s relative to the main Tauri webview. A separate overlay `WebviewWindow` worked around that layering boundary, but it introduced cross-window focus, viewport sync, and input behavior that was more complex than the underlying problem.

## Observation

1. The real requirement is native-surface interleaving, not a second top-level window.
2. AppKit sibling ordering is specific enough for `main webview < native terminals < overlay webview` if the overlay surface is its own child webview in the same window.
3. Tauri/Wry already support transparent child webviews on macOS when `macOSPrivateApi` is enabled.
4. Tauri's child-webview API is still behind the `unstable` feature, so Lifecycle should treat it as an owned platform seam rather than a casual UI helper.

## Decision

1. Desktop hosted overlays should use a transparent child webview attached to the main window, not a separate `WebviewWindow`.
2. The overlay route, payload contract, and JS-owned rendering stay the same; only the host transport changes.
3. Window-level sync should be minimized to child-webview sizing and readiness instead of cross-window move/focus orchestration.

## Impact on Milestones

1. M4: workspace dialogs and menus can move above native terminals without inventing more one-off native views.
2. M5: desktop overlay infrastructure becomes simpler to reason about because it stays inside one native window.
3. M6: future workspace-level overlay surfaces can reuse the child-webview host instead of layering more top-level windows.

## Follow-Up Actions

1. Add a focused manual smoke test for overlay rendering above terminals after terminal attach, tab drag, and window resize.
2. Decide whether the overlay payload contract should rename `ownerWindowLabel` to reflect that it now targets the owner webview label.
3. If Tauri's `unstable` child-webview API regresses, isolate the fallback at the host transport boundary instead of leaking it into callers.
