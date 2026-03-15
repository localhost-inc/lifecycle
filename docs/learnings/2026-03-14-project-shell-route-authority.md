# Project Shell Route Authority

Date: 2026-03-14

## Context

The project shell cutover introduced a new relationship between project-level tab state and route/search-param focus. The first implementation allowed `ProjectRoute` to both:

1. read route focus from search params, and
2. rewrite search params from whatever tab state happened to be active during the current render

That produced real UI thrash when selecting a workspace from the left sidebar because the route update and stale tab-state sync could race each other.

## Learning

The route must remain authoritative whenever it already points at a valid target.

The correct pattern for the project shell is:

1. URL/search params describe the requested project-level focus.
2. route-driven effects reconcile local tab state to that requested focus.
3. local state only repairs the URL when route focus is missing or invalid.
4. direct user actions that intentionally change tab focus should update both local state and route focus together.

This is stricter than “keep state and URL in sync” and avoids the common race where stale local state overwrites a newer navigation request.

## Follow-on Design Result

Project-scoped pull request list/detail and activity surfaces now live in top-level project tabs, and workspace-local PR navigation was removed from the workspace Git rail. Shared renderers such as the pull-request patch viewer can stay shared, but their access point determines ownership.

## Impact

- Shell cutover work should treat route focus as the source of truth for top-level tab selection.
- Workspace-local UI should not keep separate project-artifact navigation paths once project-level tabs exist.
- Future project/org surfaces should open through the project tab model first, not by smuggling state through workspace-local route params.

## Follow-up Actions

1. Complete the split-only workspace-canvas cutover so pane-local tab groups disappear inside workspace tabs.
2. Delete remaining workspace-local pull-request document support from the inner workspace model once the split-only canvas lands.
3. Introduce a true project-scoped provider/query model so project PR and activity tabs do not need a canonical repo workspace as backing context.
