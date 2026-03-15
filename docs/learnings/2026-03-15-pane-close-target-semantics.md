# Pane Close Target Semantics

Date: 2026-03-15
Milestone: M4

## What Changed

1. Pane close now closes the tabs owned by the targeted pane instead of merging them into the surviving sibling pane.
2. Empty-pane collapse remains a pure layout operation, but populated-pane close now routes through the existing tab-close flows first.
3. Runtime tabs still follow runtime-tab semantics when a pane closes: they hide/detach rather than being destroyed in reducer state.

## Why It Matters

1. Merging the clicked pane's tabs into the sibling made stacked layouts read as "the wrong pane closed" because the visible content stayed on screen.
2. Pane-header close affordances need to match what the user targeted, especially in simple top/bottom and left/right two-pane layouts.
3. Reusing the existing tab-close flows preserves file-confirm prompts and runtime detach behavior instead of creating a second destructive path.

## Impact

1. Pane close now behaves like a destructive action on the targeted pane's contents rather than a state-preserving layout merge.
2. Reducer-level `close-pane` is now reserved for collapsing panes that are already empty.
3. The workspace surface contract now describes pane close as a tab-closing operation followed by empty-pane collapse.

## Follow-Up Actions

1. Add a dedicated "merge pane into sibling" affordance only if preserving pane tabs remains a product need.
2. Consider a bulk confirmation UX when a pane owns multiple dirty document tabs.
