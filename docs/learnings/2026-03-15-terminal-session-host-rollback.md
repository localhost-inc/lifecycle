# 2026-03-15 Terminal Session Host Rollback

## Context

Lifecycle briefly moved local terminal lifetime out of the desktop app and into an external `tmux` session host so local shell and harness sessions could survive app restart.

That experiment introduced native UX side effects in the integrated terminal surface, including the tmux status bar leaking into sessions where the product expected a plain terminal.

## Learning

1. Restart persistence is not free. An external terminal host changes the user-visible terminal contract, not just the backend lifetime model.
2. For Lifecycle's current desktop surface, terminal fidelity inside the running app matters more than cross-restart continuity.
3. A future restart-safe terminal host needs an explicit product contract for shell UX, status-line behavior, attach semantics, and harness compatibility before it lands.

## Milestone Impact

1. M3 returns to desktop-process-owned native terminal sessions.
2. M4 no longer treats external session hosting as complete work; restart persistence is deferred again.

## Follow-Up Actions

1. Keep local terminal create/detach/kill semantics stable without an external host.
2. Revisit restart persistence only with a design that preserves terminal UX parity inside the app.
