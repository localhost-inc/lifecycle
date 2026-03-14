# Workspace Surface Tab State Unification

## Context

The workspace surface had already split document tabs into `documentsByKey`, but tab-owned metadata still lived in two separate places:

1. `hiddenRuntimeTabKeys`
2. `viewStateByTabKey`

That left the controller and reducer coordinating parallel maps for what is really one concern: extra state attached to a tab key.

## Learning

Once tab identity is keyed, tab metadata should be keyed the same way.

For the workspace surface, the cleaner shape is:

1. pane leaves own tab order and active selection
2. `documentsByKey` owns document payloads
3. `tabStateByKey` owns optional tab metadata such as hidden runtime visibility and per-tab view state

This matters because tab lifecycle transitions now have one place to update when a tab is hidden, reopened, closed, or gains remembered UI state. It also removes the need to keep hidden runtime keys and view-state maps manually in sync during reducer transitions.

## Milestone Impact

1. M4 Phase 6 now has a clearer internal tab-store shape: tab-owned metadata is unified under `tabStateByKey`.
2. Persistence is more forward-only. The desktop no longer preserves older `hiddenRuntimeTabKeys` or `viewStateByTabKey` snapshot shapes now that `tabStateByKey` is authoritative.

## Follow-Up

1. Continue the same normalization pattern for pane-local ordering so pane membership and placement become as explicit as document and tab metadata.
2. Avoid adding new tab metadata as sibling top-level maps on `WorkspaceSurfaceState`; extend `tabStateByKey` instead unless a field truly belongs to panes or documents.
