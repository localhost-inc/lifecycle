# Workspace Surface and Git Provider Contract - 2026-03-07

## Context

The version-control panel adds live git state and diff tabs to local workspaces, but it also forces two cross-cutting design decisions:

1. git operations need the same provider-scoped authority boundary as lifecycle and terminal operations
2. the center panel can no longer be modeled as terminal-only tab state

## Learning

The durable contract is:

1. Git operations are keyed by `workspace_id`, not `worktree_path`, at the public frontend/runtime boundary.
2. Provider implementations resolve the execution context:
   - local mode uses the host worktree
   - cloud mode later uses sandbox/control-plane git data
3. The workspace center panel needs two tab classes:
   - runtime-backed tabs for provider-owned resources like terminals
   - document tabs for diff/file/editor surfaces owned by desktop UI state
4. Runtime-backed tabs cannot be treated like ordinary React pages because inactive terminals may still need an attached stream or synchronized native host surface.
5. Document tabs should use stable derived keys that match the product model: one workspace-scoped `Changes` tab for current edits and commit-scoped tabs for History review.
6. Keeping these contracts explicit now avoids a second refactor when cloud git and file editors arrive.

## Milestone Impact

1. M3: terminal tabs become the first runtime-backed workspace-surface tabs instead of the only tab model.
2. M6: local git observability/control can reuse the same provider-scoped git types for CLI output contracts.
3. M7: cloud git support can implement the same status/diff/log/commit/push contract without changing the desktop UI API.
4. Backlog agent workspace: future agent sessions can plug into the runtime-tab path while diff/file artifacts stay document tabs.

## Follow-Up Actions

1. Keep git APIs workspace-scoped in desktop and runtime packages; do not leak raw filesystem-path authority back into React.
2. Preserve terminal mount semantics when introducing new tab types.
3. Reuse the document-tab path for file editors instead of creating another center-panel abstraction.
4. Add cloud provider implementations later without changing the shared git payload shapes.
5. Keep the right-side version-control pane navigational; commit composition should live in a terminal or future dedicated flow.
