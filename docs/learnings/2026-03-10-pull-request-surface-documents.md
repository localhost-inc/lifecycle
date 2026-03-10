# Pull Request Surface Documents

## Learning

1. Pull requests fit the existing workspace document-tab model cleanly:
   - the git panel raises an open-document request
   - the workspace surface reducer owns tab creation, reuse, ordering, and persistence
   - the center panel renders the PR as a client-owned document surface instead of forcing an external browser handoff
2. Persisting a last-known PR snapshot is useful because the current provider contracts expose full detail for the current branch PR and mutation results, but repository-wide PR list data can be shallower or disappear after merge/close.

## Why It Matters

1. This keeps PR UX aligned with the workspace-surface contract in [docs/reference/workspace-surface.md](../reference/workspace-surface.md) instead of creating a git-panel-specific navigation path.
2. The surface stays resilient when live PR detail is temporarily unavailable or when a PR has transitioned out of the open-list query.

## Milestone Impact

1. M6 PR flow work can stay centered in the existing workspace surface instead of introducing a separate navigation model for PR review/merge entry points.

## Follow-up

1. Add a provider-backed fetch-by-number PR detail query when non-current PR tabs need richer review/check data than the repository list contract provides today.
