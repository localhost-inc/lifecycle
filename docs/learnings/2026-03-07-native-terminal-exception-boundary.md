# Native Terminal ObjC Exceptions Must Be Caught At The Bridge

Date: 2026-03-07
Milestone: M3

## Context

The macOS native terminal integration mounts Ghostty-backed `NSView` surfaces through Objective-C bridge functions in `apps/desktop/src-tauri/native/lifecycle_native_terminal.m`.

## Learning

If AppKit or the embedded Ghostty surface raises an `NSException` inside one of those exported bridge functions, the failure does not flow back through Rust as a typed `LifecycleError`. It can terminate the desktop process and look like a silent app crash.

The bridge boundary needs to catch `NSException` and translate it into `lifecycle_native_terminal_last_error()` output so the Rust/Tauri layer can surface a normal attach/sync failure instead of losing the whole app.

In a mixed `WKWebView` + sibling native `NSView` layout, webview `window.blur` is not a reliable signal for terminal focus. The webview can blur precisely because the native terminal gained focus. Ghostty app focus also needs to be derived globally across mounted native surfaces, because `ghostty_app_set_focus` is app-wide state, not per-surface state.

Embedded Ghostty's `command` surface option is not a generic argv launch path. The embed runtime treats any non-empty command as a shell-expanded string and also forces `wait-after-command = true`. That is acceptable for one-shot harness commands, but it is the wrong contract for a plain shell tab. Native shell terminals should use Ghostty's default-shell startup path instead of sharing the harness command mode.

For keyboard input, the embedded bridge also needs to honor `ghostty_surface_key_translation_mods(...)` before it calls `interpretKeyEvents`. Raw AppKit modifier flags are not always the same modifiers Ghostty expects for text translation, and that mismatch can show up first in plain shells where normal echoed printable input is the primary interaction mode.

The bigger keyboard regression was architectural: ordinary printable typing was being routed through `ghostty_surface_text(...)`. Embedded Ghostty treats that API like clipboard paste input, not like a normal keystroke. Raw-mode TUIs can sometimes appear to tolerate that, but canonical shell echo depends on ordinary printable keys flowing through `ghostty_surface_key(...)` with the translated `NSEvent` text attached. `ghostty_surface_text(...)` should stay reserved for actual paste-style input paths.

`tauri dev` does not preserve useful context when the desktop child exits from native code. If the app aborts or dies from an uncaught native exception, the dev loop usually only reports that `target/debug/Lifecycle` exited with status `1`. Native desktop work therefore needs a durable diagnostics file plus panic/exception/signal hooks in the app process itself.

## Impact

- Native terminal sync/hide/close failures should degrade into actionable errors instead of process exits.
- Crash investigations need to distinguish process death from native view failures that can now be reported through the command path.
- Crash investigations need an app-owned diagnostics file, because the dev runner and unified log often only show `appDeath` without a usable stack or exception reason.
- Native shell launch regressions should be evaluated against Ghostty's embedded command semantics first, not against our PTY launch helpers.
- Native keyboard regressions need to be checked against both raw-mode TUIs and canonical shell echo, because one can pass while the other is still broken and can hide that the bridge is incorrectly using paste-style text injection for ordinary typing.

## Follow-Up

- Add persistent panic/error logging for the desktop app so future silent exits leave breadcrumbs even when they are not hard macOS crashes.
- If a caught native exception still appears during terminal sync, log the full exception name/reason with terminal ID and sync context.
- If shell tabs still need a Lifecycle-controlled shell executable, add that through a dedicated native-shell startup contract rather than passing an interactive shell string via `surfaceConfig.command`.
- Keep the macOS bridge aligned with upstream Ghostty's `keyDown`, `performKeyEquivalent`, `doCommand`, and preedit flows; avoid local "send raw text if it seems printable" heuristics unless the upstream embed contract changes.
