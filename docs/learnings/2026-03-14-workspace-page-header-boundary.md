# Learning: Workspace Page Header Boundary

Date: 2026-03-14

## Context

As the desktop shell moved to project-scoped page tabs, the active workspace still leaked workspace-level actions into the top page-tab rail. That made the project tab strip do two jobs at once:

1. project-level page navigation
2. workspace-level page actions

The result was the wrong ownership boundary and visually confusing layout.

## Decision

Workspace identity and workspace-level actions now live in a dedicated **workspace page header** directly below the project page tabs.

The project page-tab rail is now responsible only for:

1. switching top-level project pages
2. showing open project tabs
3. app/page history affordances

The workspace page header is responsible for:

1. workspace identity
2. workspace-scoped actions such as fork and open-in
3. workspace-panel visibility controls

The workspace workbench remains below that header and continues to own pane layout and pane-local actions.

## Why It Matters

This keeps the shell layered correctly:

1. shell plane
2. project canvas
3. page tabs rail
4. workspace page header
5. workspace workbench

That makes it easier to reason about ownership and prevents project navigation chrome from silently becoming workspace chrome again.

## Milestone Impact

This advances the project-shell cutover by making the workspace tab host structurally correct before the split-only workbench cutover is complete.

## Follow-Up

1. Rename `TitleBarActions` to a workspace-page-scoped name so code matches the new boundary.
2. Continue Phase 4 by replacing the mixed inner workspace surface with the target split-only workbench.
