# 2026-03-13 - Pane drop targeting needs its own module boundary

## Context

After tightening pane drag/drop behavior in M4 Phase 6, `workspace-surface-pane-tree.tsx` was still carrying too much of the interaction contract. The render tree owned:

1. pane drop geometry collection
2. tab-strip vs body drop resolution
3. body edge-zone math
4. drag overlay rendering

That made the pane tree both the layout renderer and the hidden authority for drag semantics.

## Learning

Pane drop targeting is a first-class interaction model and should live outside the pane tree render component.

1. Geometry types, drop-intent resolution, and drop-overlay rendering belong together because they share one contract.
2. The pane tree should measure elements and wire handlers, but it should not also define the drop model.
3. The tests for pane drop behavior should import that module directly instead of reaching through `workspace-surface-pane-tree.tsx`.

This keeps the render tree focused on layout wiring while making drag semantics easier to inspect, test, and evolve without accidental layout churn.

## Milestone Impact

1. M4 Phase 6 now has a cleaner boundary between pane rendering and pane drag semantics.
2. The workspace surface is easier to keep precise because the visible overlay and the resolver now live in one dedicated module instead of being spread through the pane tree.

## Follow-Up

1. Keep future drag-target changes inside the drop-zones module unless they are truly layout concerns.
2. Consider extracting pane drag session lifecycle into a dedicated hook if the state/measurement coordination grows beyond the current size.
