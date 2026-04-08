# Desktop Mac

Native Swift/AppKit desktop app for the workspace route.

Goals:

1. Use the Lifecycle bridge for repos, workspaces, activity, and shell resolution.
2. Use native SwiftUI navigation primitives:
   top level -> `NavigationStack`
   core app shell -> `NavigationSplitView`
   workspace content -> center canvas + right extension sidebar
3. Mount a native Ghostty surface in a plain AppKit container so SwiftUI popovers can render above it.
4. Own the Ghostty dependency boundary inside `apps/desktop-mac`, independent from the legacy Tauri desktop app.

What it does today:

1. Loads sidebar data from `GET /repos`.
2. Resolves the active shell from `POST /workspaces/:id/shell`.
3. Uses a top-level `NavigationStack` for app destinations such as settings.
4. Uses a three-column `NavigationSplitView` for the main shell: sidebar, workspace canvas, extension sidebar.
5. Creates or attaches to the workspace tmux session and models its tmux windows as terminal surface bindings inside the canvas document.
6. Switches terminal surfaces locally inside each group, with each visible surface hosting its own native Ghostty terminal and isolated tmux mirror session.
7. Creates and closes tmux-backed terminal tabs from the native group chrome.
8. Creates sibling groups from `Split Right` and `Split Down` controls in the group chrome, matching the current desktop interaction pattern.
9. Resizes tiled groups with native split dividers.
10. Dragging one terminal tab onto another reorders surfaces inside the current group without mutating tmux window order.
11. Includes a `Popover Probe` button in the group chrome so overlay behavior is obvious.
12. Shows a workspace-level native footer with shell identity, workspace status, and canvas layout mode.

Launch:

```bash
bun run dev
```

Explicit desktop loop:

```bash
bun run dev:desktop
```

Canonical monorepo entrypoint:

```bash
./scripts/dev desktop
```

Inspect current dev state:

```bash
./scripts/dev status
```

Stop the current dev loop cleanly:

```bash
./scripts/dev stop
```

Tail a specific service log:

```bash
./scripts/dev logs bridge
./scripts/dev logs control-plane
./scripts/dev logs desktop-mac
./scripts/dev logs desktop-mac-app
```

Bridge + control-plane only, for Xcode debugging:

```bash
bun run dev:desktop:services
```

Or launch only the app:

```bash
bun run desktop:mac
```

Directly:

```bash
./apps/desktop-mac/scripts/open.sh
```

Print the canonical Xcode Run environment:

```bash
bun run desktop:mac:xcode-env
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
2. Otherwise it reads the bridge registration path resolved from `LIFECYCLE_BRIDGE_REGISTRATION`, then `LIFECYCLE_RUNTIME_ROOT`, then `~/.lifecycle/bridge.json`.
3. If no healthy bridge is available, it attempts `lifecycle bridge start` from `PATH`.
4. Set `LIFECYCLE_BRIDGE_START_COMMAND` to override that startup command for nonstandard environments.
5. After startup, the app keeps monitoring bridge discovery and automatically reconnects when the bridge registration URL or PID changes, which lets it survive TUI-driven bridge restarts.
6. In repo development mode, `LIFECYCLE_BRIDGE_URL=http://127.0.0.1:52222` means the app treats the bridge as externally owned and waits/reconnects instead of trying to supervise it itself.

Debugging:

1. Use `bun run dev:desktop` or `./scripts/dev desktop` when you want the whole repo-backed app loop. The root `scripts/dev` entrypoint is the canonical monorepo supervisor and owns bridge, control-plane, and the mac app process together.
2. Use `bun run dev:desktop:services` when you want Xcode to launch only the native app while bridge and control-plane keep running from the repo.
3. Open `apps/desktop-mac/Package.swift` in Xcode and run the auto-generated `LifecycleMac` scheme.
4. Paste the output of `bun run desktop:mac:xcode-env` into the scheme's Run environment variables so Xcode uses the same bridge/runtime contract as `bun run dev:desktop`.
5. Treat Xcode as the canonical path for breakpoints, sanitizers, Instruments, and crash debugging.
6. Use `bun run desktop:mac:smoke` or `./scripts/dev desktop-smoke` to verify the desktop dev loop contract end to end: startup, bridge restart, control-plane restart, and desktop hot reload.
7. The monorepo dev supervisor writes stable state and logs under `.lifecycle-runtime-dev/dev`, so `./scripts/dev status` and `./scripts/dev logs <service>` always point at the live runtime.

Diagnostics:

1. `desktop-mac` now uses native `Logger` / `OSLog` categories for `app`, `bridge`, `workspace`, `terminal`, `agent`, and `feedback`.
2. Long-running flows such as bridge discovery, bootstrap, workspace open, terminal attach, and agent actions emit signposts for Instruments.
3. Use `Help -> Export Feedback Bundle…` to write a timestamped bundle with current state, bridge health, and recent app logs, then inspect or attach that folder directly.

Known gaps:

1. The native app now models the center route as `canvas > group > surface`, but it still only supports tiled layout and terminal surfaces.
2. Dragging currently reorders terminal tabs only within a group; cross-group surface moves and edge-drop splitting are not implemented yet.
3. The app has typed top-level routes for settings and workspace deep links, but it does not persist or restore navigation state yet.
4. New groups currently auto-create a terminal surface instead of opening a launcher surface like the full desktop app.
5. Tmux window management is implemented for bridge shells that resolve to local tmux or ssh-backed tmux sessions; other persistent backends are not handled yet.
6. The Ghostty host is reused from the desktop native layer, so image-paste helpers are stubbed out in this target.
7. The build currently emits Ghostty linker warnings from `libghostty-fat.a`; the app still links successfully.
