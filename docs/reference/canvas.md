# Workspace Canvas

The workspace canvas is the canonical center-area document for desktop-class Lifecycle clients.

## Core model

The canonical hierarchy is:

1. `canvas`
2. `group`
3. `surface`

Definitions:

1. The `canvas` owns layout, focus, and view mode.
2. A `group` owns an ordered set of surfaces plus one active surface.
3. A `surface` is the leaf content instance rendered by a client.

`tab` is UI chrome for switching surfaces inside a group. It is not a first-class persistence object.

`pane` is a presentation term for a tiled group on screen. It is not part of the canonical data model.

## Layout

The canvas owns layout. Groups do not own layout direction.

Two projections are supported conceptually:

1. `tiled` — groups are arranged by a split tree.
2. `spatial` — groups are arranged by freeform positions on an infinite canvas.

The same groups and surfaces should be renderable in either mode.

## Runtime boundary

The bridge informs runtime facts. It does not own canvas structure.

For terminal surfaces:

1. workspace shell persistence maps to one tmux session per workspace
2. one terminal surface maps to one tmux window in that session
3. native clients render that terminal surface through a native terminal host such as Ghostty
4. if multiple terminal surfaces are visible at once, each visible native host should attach through its own per-surface session context so focus and input stay isolated
5. if only one terminal surface is visible, clients may attach through the workspace session directly and select the bound window first

The canvas still owns:

1. which groups exist
2. where groups are placed
3. which surfaces belong to which groups
4. the order of surfaces inside a group
5. which surface is active inside each group

Dragging a terminal surface between groups is a canvas operation. It should not require changing tmux window identity.

## Client rules

Clients should treat tmux window identity as a terminal surface binding, not as the source of truth for tabs or groups.

Recommended shape:

1. create terminal tab: create a tmux window, then create a surface bound to that window
2. split group: create a new group in canvas state, then place a chosen or newly created surface into it
3. reorder tabs: reorder surfaces inside the group; do not reorder tmux windows just to satisfy UI order
4. close terminal tab: remove the surface from canvas state and close the bound tmux window

## Surface identity

Surface ids are client-owned and stable within the canvas document.

Terminal surface bindings should reference stable tmux window ids, not tmux window indexes. Window indexes are presentation details and may change over time.
