# External local terminals need a host boundary outside the app process

## Context

The native Ghostty embed gave Lifecycle a strong terminal presentation layer, but the PTY lifetime still lived inside the Tauri process. That made app restart a hard termination boundary even though the product already persisted terminal identity and restart-specific `sleeping` state in SQLite.

## Learning

Local terminal persistence needs a real runtime boundary outside Lifecycle's process.

1. `terminal.id` is already the durable identity, so the external host should key its runtime session directly from that id instead of inventing a second session namespace.
2. The native Ghostty view should stay presentation-only: attach, detach, resize, focus, theme, and input routing.
3. Provider-owned `createTerminal(...)` must provision the external runtime before returning, otherwise a persisted row can claim a live session that does not exist.
4. Restart recovery is cleaner when startup reconciliation keeps live rows in `sleeping` and the first attach decides whether the external session still exists.

## Milestone Impact

1. M4 now has a concrete restart-safe local terminal contract: external `tmux` session host plus attach-only native presentation.
2. M3's original "app quit terminates local terminals" limitation is now historical rather than current behavior.

## Follow-Up

1. Replace the `tmux` adapter with a dedicated daemon only if Lifecycle needs stronger control over exit semantics, audit data, or cross-platform parity.
2. Tighten post-restart exit reporting for harness terminals if preserving precise nonzero exit codes becomes product-critical.
