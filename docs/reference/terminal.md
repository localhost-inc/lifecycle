# Terminal Session Lifecycle

Canonical contracts for shell terminals and native terminal surfaces in the Lifecycle desktop app.

## Terminal Model

Terminal sessions are shell sessions attached to a workspace. They are not an agent harness, not a provider boundary, and not a source of truth for agent transcript state.

Every persisted terminal row has:

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

1. `launch_type` is currently `shell` for interactive workspace terminals.
2. Agent session state lives in `agent_session`, `agent_event`, `agent_message`, and `agent_message_part`, not in terminal rows.
3. Attachment storage is workspace-scoped and lives outside the worktree.

## Session Lifecycle

Terminal sessions follow this state machine:

1. `active -> detached | sleeping | finished | failed`
2. `detached -> active | sleeping | finished | failed`
3. `sleeping -> detached | active | failed`
4. `finished` and `failed` are terminal states

Rules:

1. Local terminal sessions are app-owned. On boot, stale live rows must be reconciled back to non-running state.
2. `create`, `attach`, and input require interactive workspace context.
3. `detachTerminal` hides the native surface without terminating the shell session.
4. `killTerminal` is the only intentional hard-stop for a live shell session.
5. Workspace destroy hard-terminates non-finished terminals.

## Surface Sync

Native terminal rendering stays inside the desktop host. The web app sends geometry and presentation facts only.

Rules:

1. Geometry, visibility, focus, opacity, theme, and font settings are synchronized into the native host.
2. Shell terminals use the runtime default shell startup path rather than an injected command string.
3. Closing a tab detaches the surface; it does not implicitly kill the shell.

## CLI Session Envelope

Shell terminals may still rely on Lifecycle workspace context being discoverable through the local environment, but that context is separate from agent-provider execution.

Relevant environment values:

1. `LIFECYCLE_WORKSPACE_ID`
2. `LIFECYCLE_TERMINAL_ID`
3. `LIFECYCLE_WORKSPACE_PATH` when a concrete checkout path exists
4. `LIFECYCLE_CLI_PATH` when the desktop app resolves a local `lifecycle` executable
5. `LIFECYCLE_BRIDGE`
6. `LIFECYCLE_BRIDGE_SESSION_TOKEN`

Rules:

1. This envelope is workspace-scoped shell context, not agent session transport.
2. Bridge calls must validate the current session token and workspace scope.
3. The desktop process should prepend the resolved Lifecycle CLI directory to `PATH` so shell terminals can discover `lifecycle`.

## Lifecycle Events

Terminal lifecycle events cover shell-session facts only:

1. `terminal.created`
2. `terminal.updated`
3. `terminal.status_changed`
4. `terminal.renamed`

Rules:

1. Agent turn lifecycle and transcript updates must use normalized `agent.*` events instead of terminal events.
2. Terminal events are valid inputs for workspace activity and shell-surface cache invalidation only.

## Persistence

Terminal persistence is baseline-schema SQLite owned by the desktop app.

Rules:

1. Schema changes must go through numbered SQL migrations in `apps/desktop/src-tauri/src/platform/migrations`.
2. Terminal boot reconciliation runs before the UI trusts persisted runtime state.
3. The baseline schema must boot a fresh database without follow-on compatibility migrations.

Key files:

1. `apps/desktop/src-tauri/src/capabilities/workspaces/terminal/`
2. `apps/desktop/src/features/terminals/`
