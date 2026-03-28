# Tauri Backend Architecture

This backend follows a capability + platform layout.

## Goals

1. Keep product capabilities explicit (`files`, `git`, `runtime`, later `terminals`, `previews`, `auth`).
2. Keep side-effect adapters centralized (`git`, `runtime`, `events`).
3. Keep shared contracts/types isolated (`shared`).
4. Make command handlers thin enough to split by use-case without cross-file churn.

## Module Map

- `src/lib.rs`
  - App bootstrap, dependency wiring, Tauri command registration.
- `src/capabilities/`
  - `files/commands.rs`: file command adapters.
  - `files/file.rs`: explicit local file read/write/list logic.
  - `files/open.rs`: open-in-editor and open-in-app helpers.
  - `git/commands.rs`: git command adapters.
  - `git/git.rs`: workspace-targeted git operations over explicit local paths.
  - `git/git_watcher.rs`: root worktree watcher plumbing.
  - `runtime/ensure.rs`: local workspace materialization for an already-persisted workspace row.
  - `runtime/environment_commands.rs`: runtime environment command adapters.
  - `runtime/environment.rs`: environment submodules such as port assignment.
  - `runtime/stop.rs`: stop/sleep flow.
  - `runtime/shared.rs`: runtime event emission helpers reused across ensure/environment/stop.
  - `runtime/manifest.rs`: local runtime manifest model/serde contracts.
  - `runtime/state_machine.rs`: allowed workspace transitions.
  - `runtime/commands.rs`: runtime/workspace mutation command adapters.
  - `targets.rs`: explicit local-worktree path helpers shared across files and git.
- `src/platform/`
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
2. `platform/*` may depend on `shared/*` and capability type contracts only when necessary (for now: runtime manifest structs used by runtime adapters).
3. `shared/*` must not depend on capability or platform modules.
4. Cross-capability imports should be minimized; prefer shared contracts if needed.

## Commands and Use-Cases

The renderer/store path talks to `lifecycle db server`, a CLI loopback server backed by `packages/db`. Native Tauri capabilities do not own control-plane database state.

Native commands are split by capability domain, not by the old `workspaces/*` bucket:

1. `ensure_workspace`, `rename_workspace`, `archive_workspace`, `get_workspace_activity`, `get_workspace_service_logs` -> `runtime/*`
2. `prepare_environment_start`, `run_environment_step`, `start_environment_service`, `stop_environment_service`, `stop_workspace_services` -> `runtime/*`
3. Desktop project-local helpers such as manifest reads and current-branch lookup stay in the app layer and use generic `fs` or `git` execution instead of project-specific native commands.
4. `get_workspace_git_*`, `stage_workspace_git_files`, `commit_workspace_git`, `push_workspace_git` -> `git/*`
5. `read_workspace_file`, `write_workspace_file`, `list_workspace_files`, `open_workspace_file` -> `files/*`

## Testing Strategy

1. Pure policy/state tests live with the module (`state_machine.rs`).
2. Helper and data-integrity tests live with internals (`workspaces/shared.rs`), including FK and transition lock behavior.
3. Command behavior tests should stay close to the use-case module they validate.
4. End-to-end runtime tests can be added under `src-tauri/tests/` when process/container fakes are introduced.

## Refactor Guidance

When adding a new workspace mutation:

1. Put it in the narrowest capability domain possible: `files`, `git`, or `runtime`.
2. Keep `runtime/*` for local runtime orchestration and ephemeral controller state, not generic file or git access.
3. Keep platform adapters generic; avoid embedding workflow policy in `platform/*`.
4. Register commands in `lib.rs` with concrete module paths.
