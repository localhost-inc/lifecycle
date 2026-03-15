## Summary

If an app-owned shortcut should work while a native terminal owns focus, the macOS host menu needs to own that accelerator instead of the DOM.

## What Changed

1. Added an `Open File...` app-menu item with the `Cmd+P` accelerator in the desktop host.
2. Routed that menu item through the shared `app:shortcut` event contract as `open-file-picker`.
3. Disabled the duplicate DOM handler for `Cmd+P` on Tauri macOS so the shortcut has one native source of truth there.

## Why It Matters

The native terminal can take first responder above the webview, so React-only handling is not enough for app-global quick-open behavior. Keeping `Cmd+P` on the host menu makes file search available from the same native shortcut layer as settings and command palette.

## Milestone Impact

1. M3 workspace flows now keep file search reachable from app-owned shortcuts even when a native terminal surface is focused.
2. The macOS desktop host has a clearer separation between app-level accelerators and workspace-surface shortcuts.

## Follow-Up Actions

1. If more cross-route app actions are added later, prefer extending the shared `app:shortcut` menu contract before adding more native-surface-specific key forwarding.
2. Keep route-specific or surface-specific shortcuts out of the host menu unless they are explicitly meant to work through native focus.
