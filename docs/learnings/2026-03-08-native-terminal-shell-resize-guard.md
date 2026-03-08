# Native Terminal Splitters Need A Hit Gutter - 2026-03-08

## Context

The desktop shell now supports draggable outer rails while macOS can embed a native Ghostty surface above the webview for workspace terminals.

That means shell sidebar drags are not purely DOM-local. The rail separators live inside the `WKWebView`, but the terminal surface is a sibling native `NSView` mounted above that webview.

## Learning

1. In a mixed `WKWebView` + sibling `NSView` shell, CSS stacking cannot put a DOM separator above the native terminal view. If the native frame reaches the shell seam, it can steal the first `pointerdown` that the rail drag depends on.
2. The first successful fix was input-boundary control, not resize debouncing. Shell rail resizing needs both:
   - a physical hit gutter between the native terminal frame and the shell separators so the first press lands on the DOM handle
   - native pointer pass-through during the drag so the webview keeps receiving movement after the cursor crosses the terminal region
3. The native sync bridge should stay boring while debugging host issues:
   - one authoritative `setFrame`
   - one size sync path
   - backing-size dedupe for repeated AppKit resize noise
4. Resize debouncing, temporary hiding, and snapshot-style workarounds are secondary tactics at best when the real bug is that the drag never starts in the webview handle.
5. Shell rail geometry should stay separate from sidebar presentation primitives. A collapsible navigation component can animate explicit open/close states, but live drag width should be owned by the shell container so the drag path stays symmetric and immediate.

## Milestone Impact

1. M3 native terminal hosting remains usable while shell rail resizing is enabled.
2. M5 and M6 can keep extending sidebar-driven workspace controls without reopening the native-host interaction boundary.

## Follow-Up Actions

1. If another DOM drag handle sits beside a sibling native surface, start by fixing the input boundary: reserve a host gutter and add native hit-test pass-through before adding more drag-state or resize-timing machinery.
2. Keep the native host frame sync minimal unless a future crash reproducer proves that live `ghostty_surface_set_size(...)` is the actual failure boundary.
3. If a shell rail needs both manual resize and off-canvas collapse, model those as separate shell states instead of overloading an icon-collapse UI primitive.
