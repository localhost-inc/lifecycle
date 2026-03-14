# Native Terminal Lease Rerender Cleanup

Date: 2026-03-14

## Context

Native terminal surfaces on macOS are rendered as NSViews above the webview, so React unmount alone does not remove them from the screen. The `NativeTerminalSurface` component uses a lease registry to decide whether a cleanup should hide a surface or let a replacement render keep it alive.

## Learning

1. Cleanup in a broad React effect runs on ordinary rerenders, not just final unmount.
2. When a cleanup schedules a deferred native hide, the matching setup must re-claim ownership before the next sync work runs.
3. If a rerendered setup only re-syncs position without re-claiming the lease, a stale hide can delete the registry entry while leaving the native NSView visible, which breaks the real unmount cleanup later.
4. The reliable pattern for native overlay surfaces is:
   - cleanup schedules a deferred hide
   - setup re-claims the lease to cancel that hide when the same surface lifetime continues
   - final unmount hides only when no setup re-claims the lease

## Why It Matters

1. It prevents terminal NSViews from persisting on top of sibling routes such as Settings after the workspace subtree unmounts.
2. It keeps pane focus, theme, and layout rerenders from accidentally orphaning native terminal surfaces.
3. It sharpens the contract for any future native-above-webview surfaces that rely on deferred cleanup.

## Milestone Impact

1. M4 workspace lifecycle controls remain trustworthy because route changes and pane churn no longer leave stale terminal surfaces on screen.
2. M5 CLI-centric observability work can build on the same lease pattern for native terminal presence without reintroducing overlay leaks.

## Follow-Up

1. Keep lease ownership and deferred hide coordination in the same effect lifecycle when native surfaces depend on DOM geometry.
2. Add regression tests for same-owner rerender paths whenever a cleanup schedules deferred native teardown.
