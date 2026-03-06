# Terminal typography matters as much as emulator correctness

Date: 2026-03-06
Milestone: M3

## Context

While improving the desktop terminal surface, Claude Code still looked rough even after moving to newer xterm packages, enabling WebGL, and tightening PTY streaming behavior. The remaining issues were largely typography-driven: Claude's TUI uses symbol-heavy separators and glyphs that degrade quickly with narrow font coverage or editor-oriented line height defaults.

## Learning

Terminal quality is not only about escape-sequence support. For harness-driven TUIs, the default font stack, symbol fallback coverage, and line-height choices materially affect perceived correctness.

## Decision

1. Use a terminal-specific default font stack instead of a generic code-editor stack.
2. Include symbol-friendly fallbacks such as `Symbols Nerd Font Mono`, `Apple Symbols`, `Segoe UI Symbol`, and `Noto Sans Symbols 2`.
3. Expose terminal font family, font size, and line height as user settings so rendering can be tuned per machine without code changes.

## Impact

1. The in-app terminal now has denser defaults that are better suited for full-screen TUIs like Claude Code.
2. Users have a direct escape hatch when platform fonts or installed symbol fonts behave differently.
3. Future terminal rendering work should treat typography and renderer choice as separate concerns.

## Follow-up

1. Consider a dedicated terminal settings surface with presets such as `Balanced`, `Dense`, and `Nerd Font`.
2. Evaluate whether theme changes should hot-update the active xterm instance instead of requiring a remount.
3. If Claude-specific artifacts remain, capture raw PTY output before adding emulator-side workarounds.
