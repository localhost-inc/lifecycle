# Workspace Surface Module Boundaries

## Context

The workspace surface had already been split into a controller hook and a render shell, but too much responsibility was still hiding inside one `workspace-surface-logic.ts` file. That file mixed:

1. reducer state transitions
2. runtime/document tab modeling
3. tab drag/reorder helpers
4. keyboard/native shortcut interpretation
5. DOM id generation
6. random browser/platform helpers

That structure kept the view/controller split technically present while leaving the actual ownership boundary muddy.

## Learning

Once a surface has a real controller boundary, the next smell is usually not the React component anymore. It is the "utility" file that still centralizes unrelated concerns.

For the workspace surface, the useful split was by ownership:

1. `workspace-surface-reducer.ts`
   Owns pane/tab/document state transitions and initial state restore.
2. `workspace-surface-tabs.ts`
   Owns runtime-tab/document-tab helper logic, ordering, and drag math.
3. `workspace-surface-shortcuts.ts`
   Owns keyboard/native shortcut interpretation plus browser focus/platform helpers.
4. `workspace-surface-ids.ts`
   Owns stable UI and pane/split id helpers.
5. `workspace-surface-requests.ts`
   Owns the typed open-document request contract shared with context/state entrypoints.

That split matters because each caller can now depend on the narrow contract it actually needs instead of importing "surface logic" as a conceptual junk drawer.

## Milestone Impact

1. M4 Phase 6 now has a more defensible module boundary after the controller/view split instead of leaving reducer, tab, and shortcut ownership bundled together.
2. The tab/document store is moving toward a coherent keyed model without preserving old pre-`rootPane` fallback semantics.

## Follow-Up

1. Continue normalizing pane-local ordering and per-tab view state so the controller owns one explicit tab-store model instead of coordinating several parallel maps and key lists.
2. Keep future workspace-surface additions out of generic `*-logic.ts` files; add them to the reducer, tabs, shortcuts, or feature-owned modules directly.
