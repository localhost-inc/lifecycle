# Explicit Pane Drop Zones

Date: 2026-03-13
Milestone: M4 Phase 6

## What Changed

1. Workspace pane drag/drop now resolves body drops through explicit edge zones instead of inferring split direction from distance to pane center.
2. Same-pane body drags only create a split when the pointer is inside a defined edge band; dropping in the pane body center now produces no split intent.
3. Cross-pane body drags keep the pane body center reserved for insert/move semantics, while edge bands remain split targets.

## Why It Matters

1. The previous center-distance heuristic was easy to trigger accidentally. A user could drop in the lower half of a pane and create a split even when the UI did not communicate a clear edge target.
2. Explicit edge zones are closer to mature editor-group behavior: the drop affordance and the committed result come from the same named regions instead of a fuzzy geometric inference.
3. This makes drag behavior testable in scenario terms like "same-pane center does nothing" and "other-pane center inserts", which is more durable than testing a center-distance formula.

## Impact

1. Pane drag/drop behavior is more deterministic for nested pane layouts because the resolver no longer flips between row and column splits based on which center axis happens to be farther away.
2. The renderer and tests now share a clearer contract for when a split preview should appear at all.

## Follow-Up Actions

1. Add higher-level interaction coverage for repeated split/move sequences so drag zone behavior is validated against real pane topologies, not only isolated geometry helpers.
2. Consider lifting pane drop zones into first-class overlay state so the visual affordance can render the target regions directly instead of only rendering the resolved preview result.
