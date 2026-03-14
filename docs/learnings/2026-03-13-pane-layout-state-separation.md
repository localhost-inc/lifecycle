# 2026-03-13 - Pane layout should not own tab membership

## Context

While continuing M4 Phase 6 workspace-surface cleanup, the remaining instability was that `WorkspacePaneLeaf` still carried `activeTabKey` and `tabOrderKeys`. That forced every tab mutation to rewrite the pane layout tree even when the split structure itself had not changed.

## Learning

Pane layout and pane tab state need different ownership.

1. `rootPane` should only describe split topology and leaf IDs.
2. Per-pane tab membership and active selection should live in a keyed store (`paneTabStateById`) alongside the other tab/document metadata stores.
3. Reducers that move, hide, close, or reopen tabs should update pane state only; only split/close/resize actions should rewrite the pane tree.

This makes the surface state model materially easier to reason about:

1. Layout mutations are isolated from tab/document mutations.
2. Persistence can serialize pane topology and pane tab state independently.
3. Runtime helpers can derive waiting/visibility state from one authoritative pane-state map instead of reading leaf-specific layout fields.

## Milestone Impact

1. M4 Phase 6 is now further along: `WorkspacePaneLeaf` is layout-only and `paneTabStateById` is the authoritative owner of pane-local tab state.
2. This reduces the remaining surface cleanup to controller/view ergonomics rather than another ownership migration.

## Follow-Up

1. Continue replacing raw `tabOrderKeys` threading at the controller/view boundary with dedicated pane-state selectors.
2. Keep future pane metadata additions in `paneTabStateById`; do not reintroduce tab-selection or tab-order fields on layout nodes.
