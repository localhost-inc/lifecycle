# Workspace Workbench Contract

This document defines the **target inner workspace model** for Lifecycle once a workspace becomes one kind of top-level project content tab.

It is the successor direction for the current mixed-tab [workspace-surface.md](./workspace-surface.md) contract.

## Status

1. This is the **target workbench contract**, not a statement of the current implementation.
2. The current desktop still follows the mixed runtime/document tab model in [workspace-surface.md](./workspace-surface.md).
3. This document exists so the outer shell can evolve without forcing `app-shell-v2.md` to carry pane-state and interaction details.

## Relationship to Other Contracts

1. [app-shell-v2.md](./app-shell-v2.md) owns the outer shell and project-vs-workspace navigation model.
2. [workspace-provider.md](./workspace-provider.md) remains authoritative for runtime, Git, file, terminal, and provider boundaries.
3. [workspace-files.md](./workspace-files.md) remains authoritative for file-surface behavior inside the workbench.
4. [execution/project-shell-cutover.md](../execution/project-shell-cutover.md) owns cutover sequencing.
5. This document owns only the **workspace tab interior**.

## Core Model

The workspace workbench is a **split-only pane surface** inside a workspace tab.

It is optimized for live execution and local work, not for durable project navigation.

The key rules are:

1. one workspace tab
2. one split tree
3. one surface per pane
4. no pane-local tab groups

## Workbench Boundary

The workbench exists only inside a workspace tab.

It owns:

1. split layout
2. active pane
3. pane headers and pane-local actions
4. workspace-local surface placement
5. workbench restore state

It does **not** own:

1. project-level navigation
2. top-level content-tab state
3. project-scoped pull request browsing
4. project-scoped inbox, memory, plans, or activity
5. workspace page header identity or workspace-page global actions

## Pane Model

The workbench is a recursive row/column split tree.

It sits below a workspace page header that owns workspace identity and workspace-scoped page actions.

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

The workbench may host workspace-scoped surfaces such as:

1. terminal session
2. file surface
3. local changes diff
4. workspace-local commit detail
5. service preview
6. empty pane

Project-scoped artifacts such as pull request detail should normally open as **project content tabs**, even when they reuse a renderer that is also used inside the workspace.

## Open and Replace Rules

The default rule is:

1. open into the active pane
2. replace the current pane surface unless the user explicitly splits

This keeps the workbench simple and prevents it from becoming a second tab manager.

Additional rules:

1. explicit split creates a sibling pane and places the new surface there
2. a new workspace may start with one empty pane
3. reopening a singleton workspace surface such as local changes should focus its existing pane instead of cloning it by default
4. future explicit duplicate actions may allow multiple instances where it is useful, but duplication is not the default contract

## Empty Pane Rules

Empty panes are first-class workbench states.

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

The workbench must support:

1. drag to resize split ratios
2. whole-pane rearrangement by drag
3. row/column regrouping when the drop target implies a new split shape

The workbench must **not** depend on pane-local tab transfer semantics.

The unit of rearrangement is the pane node and its current surface, not an inner tab.

## Restore Rules

Workbench restore is per workspace.

Restore should persist:

1. split topology
2. split ratios
3. pane contents by identifier-only snapshot
4. active pane
5. workspace-local panel state when useful

Restore must **not** override provider/runtime authority.

Examples:

1. a restored terminal pane may reopen its `terminal_id`, but provider/runtime truth remains authoritative
2. a restored file surface may reopen `file:<path>`, but file content still flows through the provider boundary

## Access-Point Rule

The same renderer may appear from more than one shell layer.

The workbench rule is:

1. if the user entered from a workspace-local access point, open inside the workbench
2. if the user entered from a project-level access point, open as a project content tab

Example:

1. local changes -> workspace workbench
2. PR diff -> project content tab
3. repo-level history commit detail -> project content tab
4. workspace-local commit detail -> workspace workbench

## Non-Goals

This document does **not** define:

1. project switcher strip behavior
2. project sidebar structure
3. top-level content-tab persistence format
4. exact reducer/state implementation shapes
5. detailed drag-hit geometry algorithms

Those belong in:

1. [app-shell-v2.md](./app-shell-v2.md) for shell structure
2. execution docs for sequencing
3. code and tests for exact implementation behavior
