# Terminal typography matters as much as emulator correctness

Date: 2026-03-06
Updated: 2026-03-10
Milestone: M3

## Context

While improving the desktop terminal surface, Claude Code still looked rough even after several browser-terminal rendering fixes. The remaining issues were largely typography-driven: Claude's TUI uses symbol-heavy separators and glyphs that degrade quickly with narrow font coverage or editor-oriented defaults.

## Learning

Terminal quality is not only about escape-sequence support. For harness-driven TUIs, the selected monospace family materially affects perceived correctness, but the control should live with shared app typography rather than in a dedicated terminal settings surface.

## Decision

1. Default shared monospace typography to `Geist Mono` and let terminals consume that same selection.
2. Stop branding a custom bundled mono as a product asset.
3. Remove dedicated terminal font controls from settings and keep typography configuration under Appearance.

## Impact

1. The app shell and terminal surfaces now share the same monospace preference, which keeps typography consistent across UI and runtime surfaces.
2. Native libghostty terminals can follow the selected monospace family without a separate terminal font model.
3. Future terminal rendering work should treat native host behavior and shared typography as separate concerns.

## Follow-up

1. Keep theme and typography changes hot-updating active terminals so Appearance remains the single source of truth.
2. If Claude-specific artifacts remain, capture raw PTY output before adding emulator-side workarounds.
3. If a browser terminal ever returns, add only the minimum typography shim it needs instead of reintroducing a separate settings model.
