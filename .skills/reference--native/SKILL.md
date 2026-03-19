---
name: reference--native
description: Native platform interop, compositor layering, overlay strategy, terminal runtime contract
user-invocable: true
---

Apply the following native platform contracts as context for the current task. Use these for native terminal integration, overlay/popover decisions, and platform adapter work.

---

# Native Platform Interop

Canonical contracts for native platform integration in the Lifecycle desktop app. Covers the platform adapter boundary, compositor layering, overlay strategy, login shell environment, and the terminal runtime contract.

## Platform Adapter Boundary

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
- `apps/desktop/src-tauri/src/platform/native_terminal/macos.rs` — macOS adapter
- `apps/desktop/src-tauri/src/platform/native_terminal/mod.rs` — facade
- `apps/desktop/src-tauri/src/platform/native_overlay/macos.rs` — macOS overlay adapter
- `apps/desktop/src-tauri/src/platform/native_overlay/mod.rs` — overlay facade

## Compositor Layering

Native terminal surfaces (Ghostty `NSView`s) sit **outside** the webview's compositing layer. CSS `z-index` is meaningless across the native/webview boundary.

Consequences:
1. Any popover, dropdown, or modal that overlaps a terminal surface renders **behind** it.
2. Interactive UI that would overlap terminals must use the extension panel (beside terminals, not over them) or route-level dialog suppression.
3. Status indicators in the nav bar are fine; interactive menus that would overlay terminals are not.
4. The sibling ordering is: `main webview < native terminals`. There is no webview layer above terminals.

## Overlay Strategy

After evaluating both a separate `WebviewWindow` and a same-window child webview for overlays, both were retired. The shipped strategy is:

1. **Popovers and menus** stay in their local DOM/popover implementation unless they have a proven native-layering requirement.
2. **Workspace-local modal flows** that collide with native terminals use **route-driven dialogs with temporary native-terminal suppression** — the workspace route takes over the surface and terminals are hidden while the modal is active.
3. **No shared overlay host** — no `WebviewWindow`, no child webview overlay, no screenshot-swap primitive.

Rules:
- Disabled infrastructure is still cost. If an overlay host is not shippable, remove its route, contracts, shortcuts, and compatibility callers.
- Terminal-adjacent controls should prefer inline or header-owned layouts (pane chrome) over floating above native surfaces.
- Screenshot swaps are not a valid desktop primitive — they add timing-sensitive visual jank and another surface lifecycle.
- Reintroduce shared overlay infrastructure only if a specific live workflow cannot be solved by local popovers or route-level dialog ownership.

## Login Shell Environment

When the desktop app starts from a GUI launcher, its initial process environment can be materially thinner than the user's login-shell environment. This leaks into libghostty child processes.

The fix is **startup-time environment hydration**, not terminal-level launch shaping:

1. Capture a login-shell env snapshot with bounded startup timeout.
2. Merge it into the app process environment **before** libghostty initialization and before background terminal-adjacent work begins.
3. Re-apply Ghostty-specific overrides (`TERM_PROGRAM`, `NO_COLOR` handling) afterward.
4. Log success or failure as diagnostics without dumping full environment contents.

Rules:
- Terminal launch code focuses on working directory and command semantics, not reconstructing ambient process env.
- If terminal sessions need workspace-scoped env (like service discovery vars), that is a separate explicit contract — not an overload of startup hydration.

## Terminal Runtime Contract

Lifecycle uses a **single authoritative local terminal runtime path**: native libghostty sessions.

1. **One runtime path** — native libghostty. No PTY fallback, no PTY supervisor API, no replay cursor contract, no PTY-specific failure codes in public types.
2. **Typed lifecycle operations** — `create`, `detach`/hide, `kill`. Terminal behavior is a native-session lifecycle, not a stream attachment protocol.
3. **Surface synchronization** — geometry, visibility, focus, and theming are synced between the webview and native surface.
4. If cloud or remote terminal transport is introduced later, model it as its own authoritative provider contract instead of reviving a local PTY API surface.

## AppKit Exception Boundary

For the embedded native terminal, the crash boundary is the **full AppKit selector path**, not just individual Ghostty C calls:

1. All selector-exposed Ghostty calls (focus sync, key binding lookup, key release, preedit updates, IME point reads, selection cleanup) need `@try/@catch` containment.
2. Selection-related selectors (`mouseDown:`, `copy:`) wrap the whole selector body because responder changes, coordinate conversion, and pasteboard work are part of the same failure boundary.
3. Embedded runtime callback wiring must include clipboard callbacks (`read_clipboard_cb`, `confirm_read_clipboard_cb`, `write_clipboard_cb`) — not just `wakeup_cb` and `action_cb` — because `copy-on-select` writes the selection clipboard on mouse-up.

Rules:
- Keep embedded runtime callback wiring in sync with upstream Ghostty when bumping `vendor/ghostty.lock`.
- If a crash survives selector-level containment, treat it as evidence of a non-Objective-C fault (native memory bug or invalid surface lifecycle).

Key files:
- `apps/desktop/src-tauri/native/lifecycle_native_terminal.m` — terminal bridge with exception boundaries
- `apps/desktop/src-tauri/native/lifecycle_native_overlay.m` — overlay bridge
- `apps/desktop/src-tauri/native/lifecycle_native_platform.m` — platform bootstrap
