# Desktop Mac

Native Swift/AppKit desktop app for the workspace route.

Goals:

1. Use the Lifecycle bridge for repos, workspaces, activity, and shell resolution.
2. Use native SwiftUI navigation primitives:
   top level -> `NavigationStack`
   core app shell -> `NavigationSplitView`
   workspace content -> center canvas + right extension sidebar
3. Mount a native Ghostty surface in a plain AppKit container so SwiftUI popovers can render above it.
4. Own the Ghostty dependency boundary inside `apps/desktop-mac`.

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

Launch the primary desktop dev loop:

```bash
just dev desktop
```

Bridge + control-plane only, for Xcode debugging:

```bash
just dev desktop-services
```

Inspect current dev state:

```bash
just status
```

Stop the current dev loop cleanly:

```bash
just stop
```

Tail a specific service log:

```bash
just logs bridge
just logs control-plane
just logs desktop-mac
just logs desktop-mac-app
```

Shortcut for the primary desktop dev loop:

```bash
just desktop
```

Print the canonical Xcode Run environment:

```bash
just xcode-env
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

1. If `LIFECYCLE_BRIDGE_URL` is set, the app uses it only after `/health` passes.
2. Otherwise it targets the fixed local bridge URL from `LIFECYCLE_BRIDGE_PORT`, defaulting to `http://127.0.0.1:52300`.
3. The bridge registration path resolved from `LIFECYCLE_BRIDGE_REGISTRATION`, then `LIFECYCLE_RUNTIME_ROOT`, then `~/.lifecycle/bridge.json` is used only for pid and diagnostics.
4. If no healthy bridge is available, it attempts `lifecycle bridge start` from `PATH`.
5. Set `LIFECYCLE_BRIDGE_START_COMMAND` to override that startup command for nonstandard environments.
6. After startup, the app keeps monitoring bridge health and pid changes so it can reconnect across bridge restarts on the fixed port.
7. In repo development mode, `LIFECYCLE_BRIDGE_URL=http://127.0.0.1:52300` means the app treats the bridge as externally owned and waits/reconnects instead of trying to supervise it itself.
8. In repo development mode, bridge `/health` must report the same `repoRoot` as `LIFECYCLE_REPO_ROOT`; this prevents attaching to a stale bridge from another checkout or an older bridge without runtime metadata.
9. The bridge publishes `GET /openapi.json`, and the Swift package builds its generated client from `Sources/Lifecycle/openapi.json`.
10. `Sources/Lifecycle/openapi.json` is a symlink to the canonical bridge artifact at `apps/cli/src/bridge/openapi.json`, so the bridge route and the Swift generator read the same document.

Debugging:

1. Use `just dev desktop` as the primary desktop entrypoint. The root `justfile` is the documented workflow layer and delegates to the canonical monorepo supervisor for bridge, control-plane, and the mac app process together.
2. Use `just dev desktop-services` when you want Xcode to launch only the native app while bridge and control-plane keep running from the repo.
3. Open `apps/desktop-mac/Package.swift` in Xcode and run the auto-generated `Lifecycle` scheme.
4. Paste the output of `just xcode-env` into the scheme's Run environment variables so Xcode uses the same bridge/runtime contract as `just dev desktop`.
5. Treat Xcode as the canonical path for breakpoints, sanitizers, Instruments, and crash debugging.
6. Use `just smoke` to verify the desktop dev loop contract end to end: startup, bridge restart, control-plane restart, and desktop hot reload.
7. The monorepo dev supervisor writes stable state and logs under the per-repo runtime root returned by `scripts/dev-runtime-root` (with supervisor state in `<runtime-root>/dev`), so `just status` and `just logs <service>` always point at the live runtime.
8. When bridge route contracts change, run `just bridge-generate` so `apps/cli/src/bridge/routed.gen.ts` and `apps/cli/src/bridge/openapi.json` stay in sync before building directly in Xcode outside the repo scripts.
9. Do not create a second copy of `openapi.json` under the app target. The app target should keep pointing at the bridge artifact via symlink so SwiftPM sees exactly one source of truth.
10. The desktop hot-reload loop coalesces rapid file edits. A newer reload request cancels the in-flight `swift build` runner and restarts from the latest tree instead of draining every queued build.

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
