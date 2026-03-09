# libghostty is not a near-term replacement for the Tauri webview terminal

Date: 2026-03-06
Milestone: M3

## Context

The current browser-based terminal surface is not meeting quality expectations, so we evaluated Ghostty as a possible replacement path. The key question was whether `libghostty` could replace the existing `xterm.js` terminal inside the current Tauri + React architecture without breaking the terminal lifecycle, replay, and future shared-session contracts already defined in this repo.

## Learning

There are two materially different Ghostty integration targets:

1. `libghostty`
   - Native embedding API used by Ghostty's macOS app today.
   - Not yet a stable, reusable general-purpose embedding API.
   - Exposes a large host-driven surface API for app lifecycle, focus, clipboard, mouse, IME, splits, drawing, and platform-specific rendering behavior.
2. `libghostty-vt`
   - Early public library for terminal parsing, state, key encoding, and related VT utilities.
   - Portable across native targets and WebAssembly.
   - Does not provide a drop-in terminal widget for a browser or Tauri webview.

For Lifecycle, this distinction matters more than raw terminal fidelity. The backend PTY contract is already renderer-agnostic enough to survive a frontend swap, but the frontend terminal panel is tightly coupled to `xterm.js` assumptions such as addon loading, write scheduling, fit-based sizing, DOM/WebGL renderer policy, theme application, and `onData` input handling.

That means adopting `libghostty` is not a library swap:

1. Using `libghostty` directly would require a native terminal surface inside a Tauri app that is currently built around a webview UI. That is a platform integration project, not just a renderer choice.
2. Using `libghostty-vt` in the webview would require us to build and own the renderer, input bridge, selection model, hyperlinks, sizing logic, performance policy, and browser/native glue ourselves.
3. Either path would be a larger rewrite than the product roadmap justifies for a terminal that is already planned to become a secondary shell/debug surface in M4.

## Decision

Do not pursue `libghostty` as a near-term replacement for the current Lifecycle terminal surface.

Near-term stance:

1. Keep the existing PTY/provider architecture and `xterm.js` terminal surface.
2. Treat `libghostty` as watchlist technology until its embedding API is clearly stable and reusable outside Ghostty's own macOS app.
3. Treat `libghostty-vt` as a possible future building block for isolated use cases, not as a drop-in terminal replacement.

## Impact

1. Preserves the existing terminal provider contract, detach/reattach replay behavior, and M6 shared-session text transport assumptions.
2. Avoids a platform-specific rewrite that would split the desktop terminal surface away from the current Tauri webview architecture.
3. Clarifies that terminal quality work should focus on current-surface improvements unless the product explicitly chooses a native terminal strategy.

## Follow-up

1. If we want optional renderer experiments later, first extract a renderer adapter boundary from the current `TerminalSurface` so alternatives can be tested without changing PTY transport.
2. Revisit `libghostty` only when upstream offers a documented, stable embedding story for third-party apps across the platforms we care about.
3. If we want to explore Ghostty tech sooner, run a narrow spike around `libghostty-vt` for read-only replay/log rendering or key/paste utilities, not for the main interactive terminal.

## Sources

1. Repo contracts and implementation:
   - `docs/milestones/m3.md`
   - `docs/milestones/m4.md`
   - `docs/milestones/m6.md`
   - `docs/reference/workspace-provider.md`
   - `apps/desktop/src/features/terminals/components/terminal-surface.tsx`
   - `apps/desktop/src-tauri/src/platform/runtime/terminal.rs`
2. Ghostty upstream:
   - https://github.com/ghostty-org/ghostty/blob/main/README.md
   - https://github.com/ghostty-org/ghostty/blob/main/include/ghostty.h
   - https://github.com/ghostty-org/ghostty/blob/main/include/ghostty/vt.h
   - https://mitchellh.com/writing/libghostty-is-coming
