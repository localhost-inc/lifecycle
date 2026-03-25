# Terminal Persistence

Canonical contract for the legacy terminal record that still exists in the desktop SQLite schema.

## Current Scope

Lifecycle no longer ships a native terminal runtime, terminal surface sync path, terminal-specific bridge session envelope, or terminal-specific desktop UI.

Rules:

1. Terminal rows are retained only as persisted data in the `terminal` table.
2. The workspace canvas, bridge, CLI, and desktop shell no longer model terminals as active tabs or runtime-controlled surfaces.
3. Agent execution state lives in `agent_session`, `agent_event`, `agent_message`, and `agent_message_part`, not in terminal rows.

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
3. The app may reconcile stale terminal rows on startup and shutdown, but no live terminal runtime is restored from them.

## Persistence

Terminal persistence remains baseline-schema SQLite owned by the desktop app.

Rules:

1. Schema changes must go through numbered SQL migrations in `apps/desktop/src-tauri/src/platform/migrations`.
2. The baseline schema must boot a fresh database without follow-on compatibility migrations.
3. Consumers should treat terminal rows as inert persisted records, not as active runtime state.

Key files:

1. `apps/desktop/src-tauri/src/platform/migrations/0001_baseline.sql`
2. `apps/desktop/src-tauri/src/platform/db.rs`
3. `packages/contracts/src/db.ts`
4. `packages/contracts/src/terminal.ts`
