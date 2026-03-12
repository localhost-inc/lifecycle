# Cloud Terminal Attach Helper Is A Presentation Attachment, Not The Terminal Runtime

Date: 2026-03-12
Milestone: M6

## Context

After aligning the cloud terminal worldview with the local native terminal architecture, one unresolved seam remained: what exactly is the local process launched inside the native terminal surface for a cloud session?

Without an explicit answer, reconnect and failure handling stay muddy. The desktop app can easily start treating a local helper restart like a terminal lifecycle event, even though the real terminal session lives remotely in the sandbox.

## Learning

The cloud attach helper needs its own narrow contract.

1. The remote PTY session remains the authoritative terminal runtime.
2. The local attach helper is only an ephemeral presentation bridge between the native terminal host and the provider transport.
3. Helper restarts should reconnect to the same provider-owned `terminalId`; they must not imply a new terminal session.
4. Helper launch failures, token-expiry failures, and transient disconnects are usually local attach/presentation failures, not canonical terminal lifecycle failures.
5. Attach tokens should be passed through env vars, not argv, so short-lived credentials do not leak through process listings or shell history.

## Impact

- M6 now has a concrete desktop-side attach target in [reference/cloud-terminal-attach.md](../reference/cloud-terminal-attach.md).
- The error model is clearer: provider-owned terminal failure and desktop-local attach failure are no longer conflated.
- Future implementation can define a stable `lifecycle terminal attach` helper entrypoint without broadening the workspace surface or provider lifecycle contracts.

## Follow-Up

1. When implementation starts, define reconnect backoff and user-visible attach-state UX (`connecting`, `reconnecting`, `needs retry`) without overloading provider terminal status.
2. Decide whether the attach helper should live in the main desktop binary, the CLI binary, or a shared packaged helper while preserving the same command surface.
3. If web terminal fallback is ever scheduled, treat it as a separate client contract instead of weakening the native-host attach boundary.
