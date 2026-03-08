## Summary

App-wide shortcuts that must keep working while a native surface owns focus should be routed through the host application menu, not only through DOM `keydown` listeners.

## What Changed

1. Added a macOS Tauri app menu entry for `Settings...` with the `Cmd+,` accelerator.
2. Emitted a shared desktop `app:shortcut` event from Tauri menu activation.
3. Added a frontend app-hotkey listener that handles the same shortcut intent in browser/non-mac environments.

## Why It Matters

The embedded native terminal can own first responder status above the webview, so React-only hotkey handlers are not truly app-wide. Using the app menu keeps accelerators available when focus is inside native terminal surfaces while still leaving a shared frontend intent layer for future shortcuts such as a command switcher.

## Milestone Impact

1. M3 workspace flows now have a real app-level shortcut path for settings and future cross-surface commands.
2. Native terminal focus no longer blocks app-owned accelerators that should outlive any single workspace surface.

## Follow-Up Actions

1. Add `Cmd+K` to the same app shortcut contract when the command switcher UI exists.
2. Keep workspace-tab shortcuts on the workspace surface contract and reserve the app shortcut contract for actions that should work across routes and focused surfaces.
