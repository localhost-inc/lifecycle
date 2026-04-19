# Terminal Contracts

Canonical contract for terminal-related state in Lifecycle.

## Current Scope

Lifecycle currently ships an interactive terminal surface through the CLI-owned TUI. Live shell attach, tmux persistence, input routing, and workspace activity rules live in [TUI](./tui.md) and in the host-aware `WorkspaceClient` shell runtime contract.

The persisted `terminal` table is still legacy data from earlier desktop terminal work. It is no longer the source of truth for the live shell runtime.

Rules:

1. The active interactive terminal/runtime path is CLI + TUI, not the legacy desktop terminal model.
2. Terminal rows are retained only as persisted data in the `terminal` table.
3. The desktop shell no longer treats terminal rows as active runtime-controlled surfaces.
4. Agent execution state lives in `agent_session`, `agent_event`, `agent_message`, and `agent_message_part`, not in terminal rows.

## Persisted Record

Every persisted terminal row still has:

1. `id`
2. `workspace_id`
3. `launch_type`
4. `created_by`
5. `label`
6. `label_origin`
7. `status`
8. `failure_reason`
9. `exit_code`
10. `started_at`
11. `last_active_at`
12. `ended_at`

Rules:

1. The record shape remains part of the baseline schema until a deliberate migration removes it.
2. Existing rows must remain readable across app restarts and workspace deletion flows.
3. The app may reconcile stale terminal rows on startup and shutdown, but no live TUI shell runtime is restored from them.

## Persistence

Terminal persistence is part of the shared control-plane database owned by `lifecycle db server`.

Rules:

1. Schema changes must go through numbered SQL migrations in `packages/db/migrations`.
2. The baseline schema must boot a fresh database without follow-on compatibility migrations.
3. Consumers should treat terminal rows as inert persisted records, not as active runtime state.

Key files:

1. `packages/db/migrations/0001_init.sql`
2. `packages/db/src/migrations.ts`
3. `packages/contracts/src/db.ts`
4. `packages/contracts/src/terminal.ts`
