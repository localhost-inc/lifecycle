# Shell / Canvas Doc Split - 2026-03-14

## Context

The app-shell discussion started drifting because one draft was trying to do three jobs at once:

1. define the outer shell model
2. define the inner workspace model
3. sequence the implementation cutover

That made the document unstable and likely to churn every time implementation detail changed.

## Learning

Lifecycle needs three separate documents for this transition:

1. `reference/app-shell-v2.md`
   - outer shell model
   - project-vs-workspace scope
   - route and restore semantics at the shell level
2. `reference/workspace-canvas.md`
   - target inner workspace model
   - split-only pane rules
   - workspace-local surface behavior
3. `execution/project-shell-cutover.md`
   - tactical sequence
   - phase boundaries
   - implementation checkpoints

## Why It Matters

1. The shell contract can stay stable even while the canvas implementation evolves.
2. The canvas contract can change at the pane-behavior level without forcing shell IA rewrites.
3. The execution doc can stay tactical without polluting reference docs with file-by-file migration churn.

## Milestone Impact

1. This is a cross-milestone architecture move rather than a single-milestone detail.
2. It reduces drift risk as project/org shell work and workspace runtime/canvas work proceed on different clocks.

## Follow-Up Actions

1. Keep new shell decisions out of `workspace-surface.md` unless they describe the current implementation.
2. Keep file-level rollout detail in execution docs, not reference docs.
3. When the canvas cutover is complete, retire or demote the older `workspace-surface.md` contract explicitly.
