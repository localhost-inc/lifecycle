# Pull Request Surface Documents

## Learning

1. Pull requests fit the existing workspace document-tab model cleanly:
   - the git panel raises an open-document request
   - the workspace surface reducer owns tab creation, reuse, ordering, and persistence
   - the center panel renders the PR as a client-owned document surface instead of forcing an external browser handoff
2. Persisting a last-known PR snapshot is useful because live provider detail can still disappear after merge/close or provider errors, even when the workspace can now fetch PR detail by number for arbitrary open tabs.
3. Arbitrary PR tabs need their own provider detail query instead of relying on current-branch state alone. The UI should prefer fetch-by-number detail, then current-branch detail, then the last-known snapshot.

## Why It Matters

1. This keeps PR UX aligned with the workspace-surface contract in [docs/reference/workspace-surface.md](../reference/workspace-surface.md) instead of creating a git-panel-specific navigation path.
2. The surface stays resilient when live PR detail is temporarily unavailable or when a PR has transitioned out of the open-list query.
3. Check data belongs to the PR detail contract, not the tab snapshot. Without a fetch-by-number path, non-current PR tabs will drift toward stale or incomplete check state.

## Milestone Impact

1. M6 PR flow work can stay centered in the existing workspace surface instead of introducing a separate navigation model for PR review/merge entry points.

## Follow-up

1. Consider collapsing PR list/detail polling into a shared cache so the PR surface does not need to poll both repository list and per-PR detail endpoints independently.
