# Workspace Extension Strip Ownership - 2026-03-14

## Context

The current workspace right rail permanently consumes horizontal space for Git and Environment even though both surfaces are status/control views rather than always-visible working surfaces.

The code also splits ownership awkwardly:

1. `ProjectRoute` owns width, collapse state, resize behavior, and the right-rail DOM host.
2. `WorkspaceLayout` owns the actual Git and Environment content and portals it into that host.

## Learning

The durable contract is:

1. Git and Environment are first-party workspace extensions, not special shell chrome.
2. The workspace uses a thin right-edge extension strip plus one active extension panel beside the center canvas.
3. The extension host should live with workspace-scoped UI, not in route-owned portal infrastructure.
4. Header actions should not carry a generic hide/show-right-sidebar control once the strip becomes the durable affordance.
5. Extension-local state must be explicit before the cutover ships; otherwise switching panels will silently reset internal tabs.

## Milestone Impact

1. M4 environment lifecycle controls move into the Environment workspace extension without permanently reserving a wide rail.
2. M5 and M6 can add richer Git, logs, PR, and org-specific surfaces through the same extension entry model instead of reopening workspace layout again.
3. Canvas cutover stays cleaner because workspace-local extensions become a stable concept separate from panes and project-scoped tabs.

## Follow-Up Actions

1. Add a tactical execution doc for the extension-strip migration before touching layout code.
2. Update target-state docs to replace `workspace panel` / `workspace sidebar` wording with extension-strip terminology.
3. Preserve native terminal resize coordination when moving the resize handle from the route-owned rail to the workspace-owned extension panel.
