# Tauri Backend Architecture

This backend follows a capability + platform layout.

## Goals

1. Keep product capabilities explicit (`projects`, `workspaces`, later `terminals`, `previews`, `auth`).
2. Keep side-effect adapters centralized (`db`, `git`, `runtime`, `events`).
3. Keep shared contracts/types isolated (`shared`).
4. Make command handlers thin enough to split by use-case without cross-file churn.

## Module Map

- `src/lib.rs`
  - App bootstrap, dependency wiring, Tauri command registration.
- `src/capabilities/`
  - `projects/commands.rs`: project CRUD commands.
  - `workspaces/ensure.rs`: workspace provisioning for an already-persisted workspace row.
  - `workspaces/environment.rs`: service start/orchestration and environment helpers.
  - `workspaces/stop.rs`: stop/sleep flow.
  - `workspaces/query.rs`: read models and lookup commands.
  - `workspaces/shared.rs`: workspace command internals reused across ensure/environment/stop.
  - `workspaces/manifest.rs`: workspace manifest model/serde contracts.
  - `workspaces/state_machine.rs`: allowed workspace transitions.
  - `workspaces/commands/workspace.rs`: workspace mutation command adapters.
  - `workspaces/commands/environment.rs`: environment command adapters.
  - `workspaces/commands/git.rs`: git command adapters.
  - `workspaces/commands/files.rs`: file command adapters.
- `src/platform/`
  - `db.rs`: SQLite open + FK policy + `tauri-plugin-sql` migrations (SQL files under `platform/migrations`).
  - `git/worktree.rs`: git worktree/branch/SHA adapters.
  - `git/status.rs`: git status/diff/log/public adapter surface.
    - `git/status/runner.rs`: shared git subprocess execution policy.
    - `git/status/z_records.rs`: shared NUL-delimited parser cursor for `-z` git output.
  - `runtime/supervisor.rs`: process/container lifecycle.
  - `runtime/prepare.rs`: setup step execution + event streaming.
  - `runtime/health.rs`: readiness probes.
- `src/shared/`
  - `errors.rs`: typed errors + status enums.

## Dependency Rules

1. `capabilities/*` may depend on `platform/*` and `shared/*`.
2. `platform/*` may depend on `shared/*` and capability type contracts only when necessary (for now: workspace manifest structs used by runtime adapters).
3. `shared/*` must not depend on capability or platform modules.
4. Cross-capability imports should be minimized; prefer shared contracts if needed.

## Commands and Use-Cases

Workspace commands are split by use-case, not by transport:

1. `ensure_workspace` -> `workspaces/ensure.rs`
2. `start_workspace_services` -> `workspaces/environment.rs`
3. `stop_workspace` -> `workspaces/stop.rs`
4. `get_workspace`, `get_workspace_services`, `get_current_branch` -> `workspaces/query.rs`

## Testing Strategy

1. Pure policy/state tests live with the module (`state_machine.rs`).
2. Helper and data-integrity tests live with internals (`workspaces/shared.rs`), including FK and transition lock behavior.
3. Command behavior tests should stay close to the use-case module they validate.
4. End-to-end runtime tests can be added under `src-tauri/tests/` when process/container fakes are introduced.

## Refactor Guidance

When adding a new workspace mutation:

1. Add a dedicated file under `capabilities/workspaces/` if it is a new user-facing use-case.
2. Reuse helpers in `workspaces/shared.rs` only for truly shared behavior.
3. Keep platform adapters generic; avoid embedding workflow policy in `platform/*`.
4. Register commands in `lib.rs` with concrete module paths.
