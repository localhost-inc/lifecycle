# 2026-03-13 - Pane drag feedback must share the resolver's geometry

## Context

While tightening M4 Phase 6 pane interactions, drag behavior still felt imprecise even after the reducer and pane-state ownership cleanup. The remaining mismatch was in the interaction contract itself: the resolver treated the entire pane shell as body drop space unless the pointer was directly over the tab strip, while the UI only rendered a resolved preview inside the pane body.

That left two problems:

1. Header controls on the right side of a pane could accidentally behave like body split targets.
2. Users only saw the final resolved preview, not the actual drop regions the resolver was evaluating.

## Learning

Measured pane geometry needs an explicit header/body split, and the drag overlay needs to render from that same geometry.

1. Pane body drop targeting should resolve against the real body element, not the full pane container.
2. Tab-strip insertion/reorder affordances should stay scoped to the measured tab bar.
3. Header controls outside the tab strip should be non-droppable.
4. Body drop feedback should render from the same measured body geometry and edge-zone constants the resolver uses.

This keeps the visible affordance and the committed result on one contract instead of maintaining separate "preview" and "decision" interpretations.

## Milestone Impact

1. M4 Phase 6 pane drag/drop is now more explicit: body drops, tab-strip drops, and header-control regions no longer blur together.
2. The workspace surface is closer to editor-group quality because hover feedback now communicates actual landing zones rather than only the post-resolution outcome.

## Follow-Up

1. Add higher-level drag scenario coverage for repeated nested split/move/close flows so the overlay contract is validated against real pane trees, not only isolated geometry.
2. Keep any future drag affordance changes on the same measured-geometry contract; do not reintroduce shell-wide fallbacks or header/body ambiguity.
