# Rust Command And Lifecycle Cleanup Benefits From Typed Request/Context Boundaries

Date: 2026-03-12
Milestone: M3

## Context

The desktop Rust crate had accumulated a few broad orchestration seams:

1. `capabilities/workspaces/commands.rs` owned nearly every workspace, terminal, git, and file Tauri command in one module.
2. Workspace lifecycle flows like create/start passed the same app/db/workspace/runtime values through long helper chains.
3. Native terminal sync still threaded a large flat argument list from the frontend into the Rust backend.
4. Rusqlite error mapping was repeated across many backend modules.

This made backend changes noisier than they needed to be and pushed `clippy` warnings toward structural issues instead of useful signal.

## Learning

Typed request and context boundaries are the right cleanup primitive for this crate.

1. Tauri command names can stay stable while the backend becomes more maintainable if the command boundary is split by domain and the widest commands deserialize a single request object.
2. Workspace lifecycle orchestration gets simpler when helper chains operate on a shared execution context rather than repeatedly accepting `app`, `db_path`, `workspace_id`, `worktree_path`, `supervisor`, and runtime env separately.
3. Native terminal sync is easier to reason about when the Rust boundary mirrors the frontend payload shape directly.
4. A small shared rusqlite-to-`LifecycleError` helper layer removes repetitive conversion noise and makes real control-flow differences easier to review.
5. Harness integrations stay extensible when the registry is a thin facade and each provider owns its own parser/session-store config in a dedicated module.

## Impact

1. The workspace command boundary is now split into domain modules while preserving the public command names.
2. Workspace creation and startup flows now use typed request/context objects instead of wide parameter lists.
3. The native terminal sync path now takes a single typed payload from the Tauri boundary through the Rust runtime layer.
4. The harness subsystem is now split into shared parsing/session-store helpers plus a provider-per-file registry, so adding new providers like Amp or OpenCode is a bounded change.
5. `cargo clippy --all-targets -W clippy::all` still reports follow-up cleanup, but the structural warning count dropped meaningfully after the refactor.

## Follow-Up

1. Apply the same typed-context cleanup to terminal persistence inserts and the remaining harness observer/session capture seams.
2. Continue decomposing large backend modules, especially `platform/git/status.rs`, using the terminal and harness module splits as the reference pattern.
3. Expand the shared DB helper layer into common row-loading/query helpers so workspace query/shared/service modules can drop more repeated rusqlite boilerplate.
