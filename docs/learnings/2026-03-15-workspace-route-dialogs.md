# Workspace Route Dialogs

Date: 2026-03-15
Milestone: M4

## Context

The local Changes review flow no longer fit the workspace pane-tab model. It is a workspace-local route entry point with modal intent: users want the full diff renderer inside the workspace canvas, but they do not want a narrow pane tab created just to host that content.

## Learning

Workspace-local routes can own dialog presentation without turning the entire workspace canvas into router-owned state.

The right boundary is:

1. route/search state chooses whether a workspace dialog is open and which dialog kind it is
2. the workspace canvas hosts the dialog chrome inside the canvas area
3. dialog payload in the URL stays identifier-level and kind-specific
4. feature renderers stay reusable and are composed by the dialog host rather than copied into route-specific code paths

That gives us a generic pattern for “route presented as dialog” instead of inventing one-off tab exceptions for every singleton workspace flow.

## Milestone Impact

1. M4 local Git review now fits the workspace canvas model better because Changes can be route-driven without pretending to be a durable pane tab.
2. Future workspace-local modal flows can extend the same route-dialog host instead of adding more special-case pane behavior.

## Follow-Up Actions

1. Add more dialog kinds to the workspace route presentation state only when they have true modal behavior and minimal route payloads.
2. Keep project-scoped artifacts routed at the project shell level even if they also reuse renderers that appear inside workspace dialogs.
3. Continue shrinking pane-local tab exceptions as the split-only canvas model lands.
