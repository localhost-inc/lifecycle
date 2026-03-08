# Native Terminal Shell Resize Guard - 2026-03-08

## Context

The desktop shell now supports draggable outer rails while macOS can embed a native Ghostty surface above the webview for workspace terminals.

That means shell sidebar drags are not purely DOM-local. A rail resize updates the React layout and the native terminal host geometry at the same time.

## Learning

1. Outer shell resize is a distinct interaction state that native terminal hosting needs to observe explicitly.
2. During shell rail drags, the native surface freeze needs to start synchronously on `pointerdown`; a React-timed hide after layout has already changed is too late to block the first native resize.
3. During shell rail drags, the safest contract is to hide the native terminal surface temporarily and let it resync only after the drag settles.
4. Sidebar resize handles should mark themselves as non-draggable window regions and stop pointer-down propagation so shell resizing does not leak into other drag handlers.

## Milestone Impact

1. M3 native terminal hosting remains usable while shell rail resizing is enabled.
2. M5 and M6 can keep extending sidebar-driven workspace controls without reopening the native-host interaction boundary.

## Follow-Up Actions

1. If another native-host gesture conflict appears, route it through the same synchronous shell interaction signal instead of adding one-off terminal guards.
2. If resize flicker becomes noticeable, investigate a lighter-weight native input suppression path than full hide/resync.
