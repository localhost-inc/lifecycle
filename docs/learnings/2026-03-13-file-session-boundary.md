# Workspace Surface Should Compose File State, Not Own It

Date: 2026-03-13
Milestone: M4

## Context

`WorkspaceSurface` was still directly owning file-editor session state: dirty drafts, conflict tracking, stale-session pruning, and tab-close confirmation copy.

That made the workspace host responsible for file behavior that already conceptually belongs to `features/files`.

## Learning

Moving feature-owned state into the feature boundary is useful even before the final controller/view split is complete.

For the file surface, the meaningful boundary is:

1. `features/workspaces`
   - pane tree
   - tab order and selection
   - runtime-tab visibility/orchestration
2. `features/files`
   - draft session state
   - disk-conflict tracking
   - file-close confirmation semantics

The host surface can still compose those concerns, but it should not be the implementation owner of the file-session rules.

## Milestone Impact

1. M4 Phase 6 can advance incrementally without waiting for the entire surface controller refactor.
2. The eventual controller split should move more behavior by ownership domain, not by arbitrary file size.

## Follow-Up Actions

1. Extract a dedicated workspace-surface controller module so `WorkspaceSurface` becomes mostly declarative.
2. Keep new file-editing lifecycle behavior inside `features/files`; do not reintroduce it into `features/workspaces` for convenience.
3. Normalize runtime-tab/document-tab identity and pane-local view state as the next Phase 6 slice.
