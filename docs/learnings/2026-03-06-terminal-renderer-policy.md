# Terminal sharpness needs an explicit renderer policy

Date: 2026-03-06
Updated: 2026-03-10
Milestone: M3

## Context

The desktop terminal looked materially worse than native macOS terminals even after PTY streaming, xterm upgrades, and typography controls were in place. The remaining problem was not a single missing font knob; it was that the app always attempted the WebGL renderer and always enabled xterm transparency, even though the terminal background is opaque and the native app is running inside `WKWebView`.

## Learning

Terminal text quality needed an explicit policy while the desktop app still carried a browser terminal. Once the product direction moved fully to native libghostty, those renderer and transparency controls stopped being product settings and became legacy implementation baggage.

## Decision

1. Remove browser-terminal renderer policy from the desktop product path instead of exposing it in settings.
2. Remove the bundled custom mono path and default shared monospace typography to `Geist Mono`.
3. Let Appearance own the shared monospace choice so the native terminal and code UI follow the same font.

## Impact

1. New installs default to a single shared typography model instead of a separate terminal-font model.
2. The native terminal path now owns text quality by default without carrying browser-renderer controls through the desktop UX.
3. Future terminal regressions should be investigated in the native host and Ghostty theme bridge instead of adding more user-facing renderer controls.

## Follow-up

1. If a browser fallback returns later, reintroduce it as an isolated contract rather than reshaping the native desktop UX.
2. If the product introduces real translucent terminal backgrounds later, decide that in the native Ghostty layer rather than reviving a browser-oriented renderer model.
