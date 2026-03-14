# Project Shell Surface Layering

Date: 2026-03-14

## Context

The first pass of the project shell still rendered the project sidebar in the outer app shell while the top-level tabs lived in the project route. That made the visual contract impossible to express cleanly: the sidebar looked like shell chrome even though it is project-scoped navigation.

## Decision

The shell is now layered explicitly:

1. The shell plane uses `--panel` and owns:
   - the project switcher strip
2. The active project canvas owns:
   - the project sidebar
   - the right-hand page area
3. The page tabs rail lives inside that right-hand page area, not on the shell plane.

This means the project sidebar must render inside `ProjectRoute`, not in the outer `AppShellLayout`.

## Why It Matters

1. It makes the project shell read as one coherent surface instead of separate chrome fragments.
2. It keeps project-level page tabs visually distinct from workspace-internal controls.
3. It aligns the render tree with the IA contract in `reference/app-shell-v2.md`.
4. It removes a source of future drift where shell state and project state would otherwise keep mixing.

## Milestone Impact

1. Phase 1 of `execution/project-shell-cutover.md` is materially sharper now because the visual hierarchy matches the intended shell model.
2. This does not change the Phase 4 workbench cutover scope; it only makes the outer shell authority cleaner before that work continues.

## Follow-Up

1. Keep the project route authoritative for raised-surface layout decisions.
2. Do not reintroduce project-scoped sidebar rendering in the outer shell.
3. Preserve the separation between project-level tabs and workspace-internal pane mechanics during the workbench cutover.
