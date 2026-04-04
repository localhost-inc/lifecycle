# Desktop Mac

Native Swift/AppKit desktop app for the workspace route.

Goals:

1. Use the Lifecycle bridge for repos, workspaces, activity, and shell resolution.
2. Keep the route shape aligned with the current desktop app:
   sidebar -> repos + workspaces
   workspace route -> center canvas + right inspector
   center canvas -> group / surface model
3. Mount a native Ghostty surface in a plain AppKit container so SwiftUI popovers can render above it.
4. Own the Ghostty dependency boundary inside `apps/desktop-mac`, independent from the legacy Tauri desktop app.

What it does today:

1. Loads sidebar data from `GET /repos`.
2. Resolves workspace activity from `GET /workspaces/activity`.
3. Resolves the active shell from `POST /workspaces/:id/shell`.
4. Creates or attaches to the workspace tmux session and models its tmux windows as terminal surface bindings inside the canvas document.
5. Switches terminal surfaces locally inside each group, with each visible surface hosting its own native Ghostty terminal and isolated tmux mirror session.
6. Creates and closes tmux-backed terminal tabs from the native group chrome.
7. Creates sibling groups from `Split Right` and `Split Down` controls in the group chrome, matching the current desktop interaction pattern.
8. Resizes tiled groups with native split dividers.
9. Dragging one terminal tab onto another reorders surfaces inside the current group without mutating tmux window order.
10. Includes a `Popover Probe` button in the group chrome so overlay behavior is obvious.

Launch:

```bash
bun run desktop:mac
```

Directly:

```bash
./apps/desktop-mac/scripts/open.sh
```

Bundle output:

```text
apps/desktop-mac/dist/Lifecycle.app
```

Ghostty bootstrap:

1. The pinned upstream Ghostty revision lives in `vendor/ghostty.lock`.
2. `./apps/desktop-mac/scripts/prepare-ghosttykit.sh` materializes the source checkout and `GhosttyKit.xcframework` under `apps/desktop-mac/.generated/ghostty/`.
3. `Package.swift` links the Swift app directly against that app-owned `GhosttyKit` output.

Bridge behavior:

1. If `LIFECYCLE_BRIDGE_URL` is set, the app uses it.
2. Otherwise it reads `~/.lifecycle/bridge.json`.
3. If no healthy bridge is available, it attempts `lifecycle bridge start` from `PATH`.
4. Set `LIFECYCLE_BRIDGE_START_COMMAND` to override that startup command for nonstandard environments.
5. After startup, the app keeps monitoring bridge discovery and automatically reconnects when the pidfile URL or PID changes, which lets it survive TUI-driven bridge restarts.

Known gaps:

1. The native app now models the center route as `canvas > group > surface`, but it still only supports tiled layout and terminal surfaces.
2. Dragging currently reorders terminal tabs only within a group; cross-group surface moves and edge-drop splitting are not implemented yet.
3. New groups currently auto-create a terminal surface instead of opening a launcher surface like the full desktop app.
4. Tmux window management is implemented for bridge shells that resolve to local tmux or ssh-backed tmux sessions; other persistent backends are not handled yet.
5. The Ghostty host is reused from the desktop native layer, so image-paste helpers are stubbed out in this target.
6. The build currently emits Ghostty linker warnings from `libghostty-fat.a`; the app still links successfully.
