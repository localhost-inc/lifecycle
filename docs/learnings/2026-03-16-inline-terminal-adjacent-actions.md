# Inline Terminal-Adjacent Actions

Date: 2026-03-16
Milestone: M4

## Context

Lifecycle explored screenshot-based native terminal freezes so shared popovers could appear above terminal `NSView`s. Even when the capture path technically worked, it introduced stale-frame risk, visible handoff flicker, and more global overlay complexity than the affected workflows justified.

## Learning

1. Terminal-adjacent controls should prefer inline or header-owned layouts instead of trying to float above native terminal surfaces.
2. Screenshot swaps are not a good default desktop primitive. They add timing-sensitive visual jank and create another surface lifecycle to maintain.
3. The stable split is:
   - inline/header actions for lightweight terminal controls
   - route-level dialogs with native-terminal suppression for modal workspace flows
   - no shared screenshot or hosted-overlay compatibility layer

## Milestone Impact

1. M4 surface launch actions stay reliable because they expand inside pane chrome instead of depending on above-terminal popovers.
2. M4 Changes review keeps the deliberate route-dialog suppression path for modal takeover flows.
3. M5 terminal-adjacent UX should start from owned layout changes in pane chrome before introducing new native layering infrastructure.

## Follow-Up Actions

1. Audit remaining workspace controls that still rely on popovers near native terminals and move them into pane or rail chrome when practical.
2. Keep native-terminal suppression scoped to modal flows; do not reuse it for lightweight inline actions.
3. Revisit native overlay infrastructure only if a specific shipping workflow cannot be expressed inline or as a route-owned dialog.
