# Right Sidebar Panel Ownership - 2026-03-07

## Context

The right workspace rail is no longer a single mixed sidebar. It now needs to support separate product surfaces:

1. version control with its own tab set (`Changes`, `History`)
2. environment/runtime observability with its own tab set (`Services` now, `Logs` next)

Keeping both areas in one component forces unrelated state, scroll behavior, and header controls into the same file.

## Learning

The durable sidebar contract is:

1. `WorkspaceSidebar` owns rail layout only.
2. Each major rail area is a panel component with its own internal tab state and scroll container.
3. Version control should be modeled as `WorkspaceSidebar -> VersionControlPanel -> ChangesTab | HistoryTab`.
4. Environment should be modeled as `WorkspaceSidebar -> EnvironmentPanel -> ServicesTab | LogsTab`.
5. Scrollbars belong to the panel container, not an inset child card, so the rail edge behaves like a true sidebar edge.

## Milestone Impact

1. M4: services remain visible in a dedicated lower panel without coupling to git UI state.
2. M5: local observability and git controls can evolve independently inside separate panel boundaries.
3. M6: cloud-specific controls and logs can slot into the same panel contract without another right-rail rewrite.

## Follow-Up Actions

1. Add `LogsTab` inside `EnvironmentPanel` instead of creating a new sibling sidebar section.
2. Keep right-rail panel headers lightweight; avoid reintroducing static metadata blocks above the primary controls.
3. Preserve panel-local scrolling when adding longer histories or log streams.
