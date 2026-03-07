# Local Terminal Lifecycle Boundaries - 2026-03-05

## Context

Milestone 3 now has a Rust PTY supervisor, terminal persistence, and a desktop terminal surface that can detach and reattach within the same Tauri app session.

## Learning

Two lifecycle boundaries need to stay explicit in the implementation:

1. Local PTY sessions are app-owned, not daemon-owned. If the desktop app disappears, any previously `active`, `detached`, or `sleeping` terminal rows must be reconciled on the next boot instead of pretending the process still exists.
2. Replay and detach semantics can be tested directly at the Rust supervisor layer with `tauri::ipc::Channel::new(...)` and chunk deserialization, without needing to boot a full webview test harness.

## Milestone Impact

1. M3: terminal replay, detach, and exit behavior can be covered with unit tests that exercise the real PTY supervisor and persistence rules.
2. M5: sleep and wake work must distinguish between metadata transitions and true process survival semantics.
3. M6: CLI attach work still needs its own transport layer; it should not rely on desktop-only in-memory supervisor state.

## Follow-Up Actions

1. Add an end-to-end desktop validation pass for the Tauri `invoke` + `Channel` path before closing the remaining M3 PTY architecture item.
2. Keep startup reconciliation logic aligned with any future daemon-backed persistence decision instead of silently reviving stale rows.
