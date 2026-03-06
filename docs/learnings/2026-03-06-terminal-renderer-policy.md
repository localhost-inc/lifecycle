# Terminal sharpness needs an explicit renderer policy

Date: 2026-03-06
Milestone: M3

## Context

The desktop terminal looked materially worse than native macOS terminals even after PTY streaming, xterm upgrades, and typography controls were in place. The remaining problem was not a single missing font knob; it was that the app always attempted the WebGL renderer and always enabled xterm transparency, even though the terminal background is opaque and the native app is running inside `WKWebView`.

## Learning

Terminal text quality needs an explicit policy, not just user-adjustable font fields. Renderer choice, transparency, and bundled font availability all affect whether xterm text looks crisp or washed out on a given platform.

## Decision

1. Add a first-class terminal renderer setting: `system|dom|webgl`.
2. Resolve `system` to `dom` on macOS and `webgl` elsewhere.
3. Disable xterm transparency unless the terminal background is actually translucent.
4. Bundle `Lifecycle Mono` so the default stack is reproducible on every install.
5. Surface runtime diagnostics in settings so renderer/font state is inspectable without guessing.

## Impact

1. New installs and reset flows default to a sharper macOS terminal path without changing PTY behavior.
2. Users still have an explicit escape hatch to force WebGL when they want throughput over text quality.
3. Future terminal regressions can be debugged from renderer/font diagnostics instead of screenshot-driven guesswork.

## Follow-up

1. If multi-tab terminal diagnostics become noisy, scope diagnostics to the active tab instead of using the latest snapshot.
2. If non-macOS text quality reports show the same issue, revisit the `system` renderer default for those platforms.
3. If the product introduces real translucent terminal backgrounds later, re-evaluate the transparency gate rather than re-enabling it globally.
