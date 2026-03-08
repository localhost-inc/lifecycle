# ghostty-web is a viable browser-surface replacement path for M3

Date: 2026-03-06
Milestone: M3

## Context

After ruling out direct `libghostty` embedding as the immediate next move, we ran a desktop terminal spike against `ghostty-web` to see whether Lifecycle could keep its existing Tauri PTY transport and still replace the fragile `xterm.js` rendering layer.

## Learning

`ghostty-web` is materially more than a marketing-level "drop-in" for our use case:

1. The core PTY contract did not need to change. The existing Tauri `invoke` + `Channel` transport still fits because the browser terminal surface only needs `open`, `write`, `resize`, `focus`, `onData`, and a fit strategy.
2. The package includes the xterm-compatible `Terminal` API plus `FitAddon`, so the current attach/write/resize loop ports cleanly.
3. The package does not preserve the entire xterm addon ecosystem. WebGL, unicode addon wiring, and xterm-specific theme refresh helpers had to be removed or simplified.
4. `ghostty-web` uses its own canvas renderer, so the old DOM/WebGL renderer preference is no longer a real runtime switch. That setting should be treated as compatibility metadata unless we reintroduce a second engine.
5. Our old line-height preference no longer maps directly because Ghostty Web currently exposes font family and size controls but not a matching line-height API.

This changes the practical recommendation from the earlier `libghostty` evaluation:

1. Going fully native is still a much larger architecture bet.
2. Replacing `xterm.js` inside the browser shell is now a credible near-term move.
3. The limiting factor is no longer the PTY/backend contract; it is how much xterm-specific UI/settings code we still carry around the surface.

## Decision

Use `ghostty-web` as the current browser terminal spike for M3 instead of continuing to invest in `xterm.js` rendering fixes.

## Impact

1. Keeps the existing Tauri PTY supervisor and provider contract intact.
2. Raises terminal fidelity without committing the app to a native AppKit rewrite.
3. Makes the renderer settings model partially stale because Ghostty Web currently owns rendering through canvas.

## Follow-up

1. Validate the terminal interactively in the desktop app against Claude/Codex full-screen TUIs before removing the old xterm packages.
2. Simplify terminal settings so they reflect the Ghostty Web engine instead of the old DOM/WebGL choice.
3. If Ghostty Web still falls short in live app testing, only then escalate to a native `libghostty`/`NSView` spike.

## Sources

1. Repo implementation:
   - `apps/desktop/src/features/terminals/components/terminal-surface.tsx`
   - `apps/desktop/src/features/terminals/ghostty-runtime.ts`
   - `apps/desktop/src-tauri/src/platform/runtime/terminal.rs`
2. Ghostty Web upstream:
   - https://github.com/coder/ghostty-web
   - https://www.npmjs.com/package/ghostty-web
