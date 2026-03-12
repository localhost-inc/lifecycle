# Root Workspace Git Watchers

Date: 2026-03-12

## Summary

Root workspaces cannot treat `workspace.source_ref` as durable truth. The repo branch can change outside Lifecycle, so branch-first root workspace UI needs a backend reconciliation path instead of frontend polling.

## Decision

We added a backend Git metadata watcher for root workspaces:

- watch the repo's resolved Git directory, not the whole project tree
- persist root workspace `source_ref` and `git_sha` when Git head metadata changes
- emit the existing `git.head_changed`, `git.log_changed`, and `git.status_changed` events
- update workspace list/detail query reducers from `git.head_changed` so normal workspace records stay current in the UI

## Why

- Root workspace labels should follow the repo's actual active branch, even when the branch changes outside Lifecycle.
- Watching Git metadata is cheaper and less ambiguous than watching the full project tree.
- Persisting the snapshot in the workspace row keeps initial loads, sidebar state, and selected workspace title consistent without a separate polling path.

## Implementation Notes

- Watchers are started for existing root workspaces at app startup and ensured again when root workspaces are created or reopened.
- Watchers are stopped before root workspaces or whole projects are removed.
- Detached HEAD is normalized to `HEAD` for lifecycle events and root workspace display.
- The title bar no longer uses a selected-root polling query; it relies on the updated workspace record path.

## Milestone Impact

- M3: root workspaces now stay branch-accurate without a special title-bar poll loop, which keeps the launcher/workspace model aligned with the shared workspace event system.

## Follow-Up

- Decide whether upstream-only Git metadata changes (for example `git fetch`) should also persist into workspace records, or remain handled by the existing Git status polling surfaces.
- Consider consolidating root workspace rename semantics further if we later want an explicit user alias separate from the live branch label.
