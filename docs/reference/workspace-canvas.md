# Workspace Canvas Contract

This document defines the **target inner workspace model** for Lifecycle once a workspace becomes one kind of top-level page tab.

It is the successor direction for the current mixed-tab [workspace-surface.md](./workspace-surface.md) contract.

## Status

1. This is the **target canvas contract**, not a statement of the current implementation.
2. The current desktop already hosts workspaces inside the project shell with a workspace header and workspace extension surfaces.
3. The center workspace area still follows the mixed runtime/document tab model in [workspace-surface.md](./workspace-surface.md) until pane-local tab groups are removed.
4. This document exists so the outer shell can evolve without forcing `app-shell-v2.md` to carry pane-state and interaction details.

## Relationship to Other Contracts

1. [app-shell-v2.md](./app-shell-v2.md) owns the outer shell and project-vs-workspace navigation model.
2. [workspace-provider.md](./workspace-provider.md) remains authoritative for runtime, Git, file, terminal, and provider boundaries.
3. [workspace-files.md](./workspace-files.md) remains authoritative for file-surface behavior inside the canvas.
4. [execution/project-shell-cutover.md](../execution/project-shell-cutover.md) owns cutover sequencing.
5. This document owns only the **center canvas area** inside the workspace tab interior.

## Core Model

The workspace canvas is the **split-only center pane surface** inside a workspace.

It is optimized for live execution and local work, not for durable project navigation.

The key rules are:

1. one workspace tab
2. one split tree
3. one surface per pane
4. no pane-local tab groups

## Workspace Relationship

A workspace contains:

1. workspace header
2. workspace canvas
3. optional workspace extension panel
4. optional workspace extension strip

## Canvas Boundary

The canvas exists only inside a workspace.

It owns:

1. split layout
2. active pane
3. pane headers and pane-local actions
4. workspace-local surface placement
5. canvas restore state

It does **not** own:

1. project-level navigation
2. top-level page-tab state
3. project-scoped pull request browsing
4. project-scoped inbox, memory, plans, or activity
5. workspace header identity or workspace-global actions
6. workspace extension strip or extension-panel state

## Implementation Boundary

When the code refers to the target model, module ownership should mirror the product taxonomy:

1. `workspace-layout.tsx` owns workspace-vs-extension shell composition.
2. `workspace-canvas.tsx`, `workspace-canvas-controller.tsx`, `workspace-canvas-reducer.ts`, and `workspace-canvas-state.ts` own center-host state, restore, and orchestration.
3. `workspace-pane-layout.ts` owns split topology operations.
4. `workspace-pane-tree.tsx`, `workspace-pane-content.tsx`, `workspace-pane-tab-bar.tsx`, and `workspace-pane-drop-zones.tsx` own pane-local presentation and interaction.
5. Feature-owned surfaces such as terminal, file, diff, and preview renderers own surface-specific behavior.

## Pane Model

The canvas is a recursive row/column split tree.

It sits below a workspace header that owns workspace identity and workspace-scoped actions.

Each leaf pane contains:

1. a compact pane header strip
2. exactly one active surface

Each pane header should provide:

1. local identity for the current surface
2. replace / open action
3. split actions
4. close / clear action

The header is not a tab strip.

## Surface Kinds

The canvas may host workspace-scoped surfaces such as:

1. terminal session
2. file surface
3. local changes review
4. workspace-local commit detail
5. service preview
6. empty pane

Project-scoped artifacts such as pull request detail should normally open as **page tabs**, even when they reuse a renderer that is also used inside the workspace.

## Open and Replace Rules

The default rule is:

1. open into the active pane
2. replace the current pane surface unless the user explicitly splits

This keeps the canvas simple and prevents it from becoming a second tab manager.

Additional rules:

1. explicit split creates a sibling pane and places the new surface there
2. a new workspace may start with one empty pane
3. reopening a singleton workspace surface such as local changes should focus its existing pane instead of cloning it by default
4. future explicit duplicate actions may allow multiple instances where it is useful, but duplication is not the default contract

## Empty Pane Rules

Empty panes are first-class canvas states.

They may appear because of:

1. initial workspace open
2. explicit split creation
3. explicit close / clear of pane content
4. whole-pane rearrangement that vacates the source position

Empty panes should:

1. show quick launch actions
2. be valid drop targets for pane rearrangement
3. not masquerade as fake tabs

## Rearrangement and Resize Rules

The canvas must support:

1. drag to resize split ratios
2. whole-pane rearrangement by drag
3. row/column regrouping when the drop target implies a new split shape

The canvas must **not** depend on pane-local tab transfer semantics.

The unit of rearrangement is the pane node and its current surface, not an inner tab.

## Restore Rules

Canvas restore is per workspace.

Restore should persist:

1. split topology
2. split ratios
3. pane contents by identifier-only snapshot
4. active pane

Restore must **not** override provider/runtime authority.

Wider workspace restore may also persist extension state, but that is outside the canvas contract.

Examples:

1. a restored terminal pane may reopen its `terminal_id`, but provider/runtime truth remains authoritative
2. a restored file surface may reopen `file:<path>`, but file content still flows through the provider boundary

## Access-Point Rule

The same renderer may appear from more than one shell layer.

The canvas rule is:

1. if the user entered from a workspace-local access point, open inside the canvas
2. if the user entered from a project-level access point, open as a page tab

Example:

1. local changes -> workspace canvas
2. PR diff -> page tab
3. repo-level history commit detail -> page tab
4. workspace-local commit detail -> workspace canvas

## Route Dialogs

Some workspace-local routes may present as dialogs over the canvas instead of becoming pane surfaces.

Rules:

1. The route/search state is authoritative for whether the dialog is open.
2. The canvas owns the dialog host chrome and placement inside the workspace tab.
3. Dialog routes should carry only minimal identifier-level inputs in the URL, not renderer snapshots.
4. Dialog routes should reuse existing surface renderers instead of creating placeholder pane tabs just to show modal content.
5. Local changes review is the first canvas dialog route and should guide future workspace-local dialog routes.

## Non-Goals

This document does **not** define:

1. project switcher strip behavior
2. project sidebar structure
3. top-level page-tab persistence format
4. exact reducer/state implementation shapes
5. detailed drag-hit geometry algorithms

Those belong in:

1. [app-shell-v2.md](./app-shell-v2.md) for shell structure
2. execution docs for sequencing
3. code and tests for exact implementation behavior
