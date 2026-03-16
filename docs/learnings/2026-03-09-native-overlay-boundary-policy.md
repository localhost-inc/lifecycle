# Native Overlay Surface Policy - 2026-03-09

> Superseded on 2026-03-15 by [2026-03-15-hosted-overlay-retirement.md](./2026-03-15-hosted-overlay-retirement.md). Lifecycle no longer uses a shared hosted-overlay runtime; current guidance is route-driven workspace dialogs plus native-terminal suppression for modal above-terminal flows.

## Context

The desktop app now embeds the active terminal as a native `NSView` above the Tauri `WKWebView`. That made DOM popovers fail anywhere they crossed into native territory, including the Git action popover in the right rail and title-bar actions above the terminal lane.

## Observation

1. A React portal only changes DOM placement inside the webview. It does not move content above sibling native views.
2. The real consistency goal is not a native menu implementation. It is one JS popover system that desktop callers can use without caring about native overlap.
3. A persistent child `WebviewWindow` can act as a single above-native overlay surface when it is booted with the app and kept separate from popover content ownership.
4. The main failure mode in earlier attempts was lifecycle design: lazy boot and mixed ownership. The overlay surface has to be infrastructure; the popover UI has to stay in JS.

## Decision

1. Desktop popovers should default to one persistent hosted overlay window above native surfaces.
2. JS owns popover rendering, styling, state, and behavior inside that host window.
3. Native/Tauri windowing owns only z-order, window lifecycle, and viewport alignment to the main app window.
4. DOM popovers remain a browser fallback, not the primary desktop primitive.

## Impact on Milestones

1. M5: title-bar and right-rail popovers can converge on one desktop overlay channel instead of separate native and DOM policies.
2. M5: the terminal can stay a native `NSView` without forcing popover authors to reason about native overlap.
3. M6: future shell and workspace overlays should build on the shared hosted-window manager instead of adding more special-case native menu code.

## Follow-Up Actions

1. Migrate additional desktop popovers onto the hosted overlay manager until the remaining DOM desktop popovers are gone.
2. Add a targeted manual smoke test for hosted overlays above the terminal, because the failure mode is visual and cross-surface.
3. If the shared child-window host proves insufficient in real runtime use, replace only the surface layer with a native `NSPanel`/child `NSWindow` while keeping JS content ownership intact.
