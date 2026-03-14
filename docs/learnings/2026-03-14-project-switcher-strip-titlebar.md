# Project Switcher Strip Belongs in the Titlebar

Date: 2026-03-14

## Context

The first project-shell cutover used a vertical left project rail while macOS window controls still occupied the top-left corner of the window.

That created an awkward collision:

1. the shell plane wanted to start at the top-left edge
2. macOS reserved that corner for traffic lights
3. the project canvas then inherited a broken top-left boundary

## Decision

The shell plane now hosts a horizontal **project switcher strip** to the right of the window controls.

The project canvas starts below that strip and renders as an inset raised card on top of the shell plane.

This keeps the shell contract simple:

1. shell plane
   - project switcher strip
2. project canvas
   - project sidebar
   - page area
   - project footer

## Why It Matters

1. The shell stops fighting macOS titlebar constraints.
2. The project canvas gets a clean rectangular boundary again.
3. Project switching stays shell-scoped without competing with the project sidebar.
4. The shell plane and the project canvas now read as two intentional layers instead of a clipped single surface.

## Milestone Impact

1. Phase 1 of `execution/project-shell-cutover.md` now uses a top shell switcher instead of a left rail.
2. This sharpens the project-shell model without changing workspace ownership or the Phase 4 workbench cutover.

## Follow-Up

1. Keep project and organization switching in the shell strip only; do not move project page navigation into that area.
2. Preserve the inset-card treatment for the project canvas so the shell plane remains legible as its own layer.
3. Revisit organization overflow behavior once M6 org surfaces are active and the strip has to handle more contexts.
