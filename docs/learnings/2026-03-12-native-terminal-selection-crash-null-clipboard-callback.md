# Native Terminal Selection Copy Requires Embedded Clipboard Callbacks

Date: 2026-03-12
Milestone: M3

## Context

Text highlighting in the embedded Ghostty terminal still crashed after selector-level `@try/@catch` hardening.

`lldb` showed the real fault was a main-thread `EXC_BAD_ACCESS` at `pc=0x0` in Ghostty's selection copy path:

1. `Surface.mouseButtonCallback`
2. `Surface.setSelection`
3. `Surface.copySelectionToClipboards`
4. `app.opts.write_clipboard(...)`

Our `ghostty_runtime_config_s` initializer only populated `wakeup_cb` and `action_cb`, leaving `read_clipboard_cb`, `confirm_read_clipboard_cb`, and `write_clipboard_cb` null.

## Learning

For the embedded runtime, selection highlighting is not just a mouse interaction. On macOS, the default Ghostty `copy-on-select` path writes the selection clipboard on mouse-up, so the clipboard callbacks are part of the minimum runtime contract.

That means:

1. A selector-level exception boundary is necessary for Objective-C failures, but it cannot catch null native function pointers or other hard faults.
2. Any embedded Ghostty host that enables `copy-on-select` or paste actions must wire the clipboard callbacks, not only wakeup and action callbacks.
3. When our embed bridge diverges from upstream Ghostty's runtime wiring, the Swift macOS runtime is the reference implementation to compare first.

## Impact

1. Highlighting no longer depends on a null `write_clipboard_cb`, which removes the hard crash we saw on selection mouse-up.
2. The embedded native terminal now owns its pasteboard bridge explicitly instead of relying on manual `copy:` and `paste:` code paths alone.
3. Future platform adapters need a checklist for required embedded runtime callbacks, not just surface rendering hooks.

## Follow-Up

1. Keep embedded runtime callback wiring in sync with upstream Ghostty when bumping `vendor/ghostty.lock`.
2. Replace the current auto-confirm clipboard fallback with a proper Lifecycle confirmation UX if we want Ghostty's paste protection semantics instead of permissive host behavior.
3. If another selection crash appears after this fix, treat it as a different native bug rather than extending Objective-C exception guards again.
