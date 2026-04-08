# Native Platform Interop

Canonical contracts for native platform integration in the Lifecycle desktop app. Covers the platform adapter boundary, compositor layering, overlay strategy, login shell environment, and the terminal runtime contract.

## Platform Adapter Boundary

Native support is execution-only:

1. Control-plane state lives behind `packages/db` and `lifecycle db server`.
2. Native code does not own or query persisted `project`, `workspace`, `service`, or `agent_session` rows.
3. Native capabilities execute commands, supervise processes, inspect local files and git state, and emit lifecycle events back to the app.
4. `WorkspaceClient` must be able to treat the local native layer the same way it would treat `docker`, `remote`, or `cloud`: as a host substrate with explicit capabilities, not as a special control-plane backend.

## Local Host Substrate

For `workspace.host=local`, native code is the local execution substrate behind `WorkspaceClient`.

The contract is intentionally generic:

1. `WorkspaceClient` owns host semantics, policy, and service-graph orchestration.
2. Native code owns only the local execution primitives needed to satisfy those decisions.
3. The same high-level host semantics should remain possible for `local`, `docker`, `remote`, and `cloud`, even when the concrete transport differs.

### Capability Domains

Native code should expose capability-shaped operations, not control-plane behavior:

1. **Process execution** — run commands with explicit `cwd`, `env`, timeout, stdout/stderr capture, exit status, and cancellation.
2. **Process supervision** — start, monitor, stop, and inspect long-lived local processes keyed by explicit runtime ids.
3. **Container execution** — start, monitor, stop, and inspect local containers from explicit image/runtime config.
4. **Filesystem access** — read, write, list, watch, and open files rooted at explicit local paths.
5. **Git access** — run git reads and writes against explicit repo/worktree paths with no record lookup.
6. **Preview routing** — manage local preview proxy primitives and local port exposure from explicit runtime inputs.
7. **Sidecar lifecycle** — spawn and reconnect long-lived Lifecycle-owned loopback services such as `db/server` and agent hosts.
8. **Runtime event fanout** — emit normalized `workspace.*`, `service.*`, `terminal.*`, and related fact events derived from local runtime changes.
9. **Native window and terminal integration** — own AppKit/webview/ghostty/platform integration that cannot live in shared TypeScript.

### Native Non-Responsibilities

Native code must not:

1. Read or write control-plane SQL state.
2. Resolve `workspace_id`, `project_id`, `service.name`, or `agent_session.id` back into canonical records.
3. Decide workspace naming, branch naming, worktree naming, archive policy, or host placement.
4. Parse catalog records to infer what should happen next.
5. Own lifecycle manifest policy or service-graph policy; it should receive explicit steps, services, commands, and env from `WorkspaceClient`.
6. Hide failures behind local-only fallback behavior.

### Command Shape Rules

Native commands should be expressed in terms of explicit runtime inputs:

1. Prefer `path`, `cwd`, `env`, `command`, `service_config`, `runtime_id`, and `port` inputs.
2. Avoid commands that need native to "look up the workspace" in order to know what to do.
3. Keep workspace ids as correlation keys for events, controller guards, and logs, not as authority for policy or data lookup.
4. Treat native controller registries as ephemeral runtime state only; they must not become a hidden control plane.

The native terminal seam is explicit and boring:

1. A **platform-neutral facade** owns the terminal sync and lifecycle API the app calls.
2. **Platform modules** (`macos`, `unsupported`) own resource discovery, FFI structs, AppKit bridge details, and webview extraction.
3. Shared terminal capability code passes typed sync data, not raw view pointers or platform-specific bridge concerns.

This keeps platform expansion cheap without forcing speculative cross-platform abstractions.

Rules:
- Platform-specific types, selectors, and FFI calls must not leak past the facade boundary into shared terminal or workspace code.
- Adding a future platform implementation happens behind the existing facade instead of rewriting the terminal capability layer.
- The `unsupported` platform module provides a clear stub path without shaping the macOS implementation.

Key files:
- `apps/desktop-legacy-do-not-touch/src-tauri/src/platform/native_terminal/macos.rs` — macOS adapter
- `apps/desktop-legacy-do-not-touch/src-tauri/src/platform/native_terminal/mod.rs` — facade
- `apps/desktop-legacy-do-not-touch/src-tauri/src/platform/native_overlay/macos.rs` — macOS overlay adapter
- `apps/desktop-legacy-do-not-touch/src-tauri/src/platform/native_overlay/mod.rs` — overlay facade

## Compositor Layering

Native terminal surfaces (Ghostty `NSView`s) sit **outside** the webview's compositing layer. CSS `z-index` is meaningless across the native/webview boundary.

Consequences:
1. Any popover, dropdown, or modal that overlaps a terminal surface renders **behind** it.
2. Interactive UI that would overlap terminals must use the extension panel (beside terminals, not over them) or route-level dialog suppression.
3. Status indicators in the nav bar are fine; interactive menus that would overlay terminals are not.
4. The sibling ordering is: `main webview < native terminals`. There is no webview layer above terminals.

## Overlay Strategy

After evaluating both a separate `WebviewWindow` and a same-window child webview for overlays, both were retired. The shipped strategy is:

1. **Popovers and menus** stay in their local DOM/popover implementation by default.
2. **Workspace-local modal flows** stay route-driven when they need full-page ownership, and native-terminal suppression still applies when they would overlap a live terminal surface.
3. **No shared overlay host** — no `WebviewWindow`, no child webview overlay, no screenshot-swap primitive.

Rules:
- Disabled infrastructure is still cost. If an overlay host is not shippable, remove its route, contracts, shortcuts, and compatibility callers.
- Terminal-adjacent controls should still prefer inline or header-owned layouts (pane chrome) over unnecessary floating UI.
- Screenshot swaps are not a valid desktop primitive — they add timing-sensitive visual jank and another surface lifecycle.
- Reintroduce shared overlay infrastructure only if a specific live workflow cannot be solved by local popovers or route-level dialog ownership.

## Login Shell Environment

When the desktop app starts from a GUI launcher, its initial process environment can be materially thinner than the user's login-shell environment. This leaks into terminal child processes.

The fix is **startup-time environment hydration**, not terminal-level launch shaping:

1. Capture a login-shell env snapshot with bounded startup timeout.
2. Merge it into the app process environment before background terminal-adjacent work begins.
3. Re-apply terminal-specific overrides (`TERM_PROGRAM`, `NO_COLOR` handling) afterward when needed.
4. Log success or failure as diagnostics without dumping full environment contents.

Rules:
- Terminal launch code focuses on working directory and command semantics, not reconstructing ambient process env.
- If terminal sessions need workspace-scoped env (like service discovery vars), that is a separate explicit contract — not an overload of startup hydration.

## Terminal Runtime Contract

Lifecycle uses a **single authoritative local terminal runtime path**: native `libghostty` surfaces on macOS.

1. **One runtime path** — native local hosting on macOS. Do not keep a browser fallback contract alive in product code by default.
2. **Typed lifecycle operations** — `create`, `detach`, `kill`, and native surface sync.
3. **Renderer ownership** — terminal drawing lives in the AppKit layer above the webview, so the compositor-layering rules above remain part of the contract.
4. If cloud or remote terminal transport is introduced later, model it as its own authoritative provider contract instead of splitting the local desktop terminal path again.

## AppKit Exception Boundary

For the embedded native terminal, the crash boundary is the **full AppKit selector path**, not just individual Ghostty C calls:

1. All selector-exposed Ghostty calls (focus sync, key binding lookup, key release, preedit updates, IME point reads, selection cleanup) need `@try/@catch` containment.
2. Selection-related selectors (`mouseDown:`, `copy:`) wrap the whole selector body because responder changes, coordinate conversion, and pasteboard work are part of the same failure boundary.
3. Embedded runtime callback wiring must include clipboard callbacks (`read_clipboard_cb`, `confirm_read_clipboard_cb`, `write_clipboard_cb`) — not just `wakeup_cb` and `action_cb` — because `copy-on-select` writes the selection clipboard on mouse-up.

Rules:
- Keep embedded runtime callback wiring in sync with upstream Ghostty when bumping `vendor/ghostty.lock`.
- If a crash survives selector-level containment, treat it as evidence of a non-Objective-C fault (native memory bug or invalid surface lifecycle).

Key files:
- `apps/desktop-legacy-do-not-touch/src-tauri/native/lifecycle_native_terminal.m` — terminal bridge with exception boundaries
- `apps/desktop-legacy-do-not-touch/src-tauri/native/lifecycle_native_overlay.m` — overlay bridge
- `apps/desktop-legacy-do-not-touch/src-tauri/native/lifecycle_native_platform.m` — platform bootstrap
