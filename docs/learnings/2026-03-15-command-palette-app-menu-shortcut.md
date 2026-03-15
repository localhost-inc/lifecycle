## Summary

`Cmd+K` needs to live on the same macOS app-menu shortcut path as other cross-surface actions whenever a native terminal can own first responder status.

## What Changed

1. Added a `Command Palette...` app-menu item with the `Cmd+K` accelerator in the desktop host.
2. Routed that menu item through the shared `app:shortcut` event contract as `open-command-palette`.
3. Disabled the duplicate DOM handler for `Cmd+K` on Tauri macOS so the shortcut has one native source of truth there.

## Why It Matters

The native Ghostty surface handles `Cmd+K` as a terminal clear-screen command if the host app does not intercept it first. Moving the shortcut into the app menu keeps command palette intent app-owned instead of leaking into focused terminal behavior.

## Milestone Impact

1. M3 workspace flows keep app-level command access available even while a native terminal surface owns focus.
2. The desktop shortcut contract is now more consistent: settings and command palette both use the host-menu path on macOS Tauri.

## Follow-Up Actions

1. Completed on 2026-03-15: `Cmd+P` now uses the same native app-menu contract; see `docs/learnings/2026-03-15-file-picker-app-menu-shortcut.md`.
2. Keep native surface shortcut forwarding limited to workspace-owned actions; reserve the app-menu contract for global app intents.
