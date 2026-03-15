# Canvas, Pane, And Surface Should Be Separate Ownership Layers

Date: 2026-03-14
Milestone: M4

## Context

The product vocabulary had already stabilized around `workspace`, `workspace canvas`, `pane`, and `surface`, but the code was still anchored to the older `workspace-surface-*` module family. That made the center area read like one large "surface" concept even though the docs were trying to separate:

1. the canvas host
2. pane layout and pane-local chrome
3. rendered surfaces inside panes

## Learning

The code boundary is easier to reason about when the module prefixes match the ownership layer:

1. `workspace-canvas-*`
   Own the center host, restore state, reducer/controller orchestration, and canvas-level contracts.
2. `workspace-pane-*`
   Own split topology, pane-local headers, pane-local tab UI in the legacy mixed model, and pane drag/drop geometry.
3. `surface-*`
   Own content-unit concerns such as icons, launch affordances, and feature-owned renderers.

That split matters because it keeps `surface` attached to what a pane shows, instead of letting it expand back into a synonym for the entire center workspace area.

## Milestone Impact

1. M4 Phase 6 now has code module names that line up with the current vocabulary instead of teaching two competing mental models.
2. The remaining canvas cutover can now focus on deleting pane-local tab groups rather than first untangling host-vs-pane-vs-surface naming drift.

## Follow-Up Actions

1. Continue shrinking the legacy mixed-tab canvas so pane headers stop being tab strips and the code can drop the remaining tab-centric compatibility helpers.
2. Keep new feature renderers attached through surface-oriented modules instead of growing canvas or pane modules with renderer-specific behavior.
