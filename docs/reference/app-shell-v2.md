# App Shell v2 — Project Shell, Workspace Canvas

This document defines the **target desktop shell model** as Lifecycle completes the move from a workspace-first app toward a project-first shell that can later grow into an organization-first shell.

The goal is to make the outer app structure stable before the implementation details change underneath it.

This document is intentionally about:

1. shell layers
2. navigation ownership
3. project-vs-workspace scope
4. route and restore semantics
5. guardrails for future shell and workspace work

It is intentionally **not** a file-by-file migration plan.

## Status

1. This is the **destination shell model**, not a statement of the current implementation.
2. The outer shell spine is already live in the desktop app: project switcher strip, project sidebar, page tabs, workspace tabs, and a workspace header now render under the project shell route.
3. The remaining gap is the inner workspace canvas cutover; the center workspace area still follows the mixed-tab [workspace-surface.md](./workspace-surface.md) contract until that migration lands.
4. Implementation sequencing belongs in execution docs such as [execution/project-shell-cutover.md](../execution/project-shell-cutover.md), not here.

## Relationship to Other Contracts

1. [workspace-provider.md](./workspace-provider.md) remains authoritative for provider boundaries, runtime authority, Git authority, file authority, and terminal authority.
2. [workspace-surface.md](./workspace-surface.md) remains the current center-pane contract inside the workspace layout until [workspace-canvas.md](./workspace-canvas.md) replaces it.
3. [workspace-canvas.md](./workspace-canvas.md) owns the target split-only center workspace interior.
4. This document owns only the **outer shell model** and the high-level contract for what belongs at the project level versus inside a workspace tab.
5. Detailed pane-state, drag-target, or restore-shape mechanics should live in the workspace canvas contract, not expand ad hoc inside this document.

## Core Model

Lifecycle should be understood as these layered regions:

1. **Project shell**
   - durable container for shared repo/project artifacts
   - later becomes compatible with organization-level grouping
2. **Project layout**
   - owns the project main region for the active project
   - includes the top tab rail plus the active body
3. **Top-level page tabs**
   - the project's open destinations
   - examples: Overview, Inbox, Pull Request, Workspace
4. **Workspace**
   - only exists inside a workspace tab
   - owns workspace identity, workspace actions, and attached workspace extensions
5. **Workspace canvas**
   - the center live execution and local-state surface
   - split-only, pane-based

The key idea is simple:

- the outer shell is for **durable shared context**
- the workspace is for **live execution and local work**

## Decision Rules

Use these rules when deciding where something belongs.

1. If destroying a workspace should remove it, it is **workspace-scoped**.
2. If two workspaces in the same project should see the same thing, it is **project-scoped**.
3. If it depends on a live environment, worktree, session, preview, or local branch state, it is **workspace-scoped**.
4. If it is a durable shared artifact for the repo/project, it is **project-scoped**.
5. A surface's visual size does **not** determine its scope.

## Shell Structure

```text
Project shell
├─ Shell plane (`--panel`)
│  └─ Project switcher strip
└─ Project layout
   ├─ Project sidebar
   └─ Project main
      ├─ Page tabs rail (`--panel`)
      │  ├─ Project view tab
      │  ├─ Pull request tab
      │  └─ Workspace tab
      └─ Active content (`--background`)
         ├─ Project view
         │  ├─ Overview
         │  ├─ Inbox
         │  ├─ Memory
         │  ├─ Plans
         │  ├─ Pull Requests
         │  └─ Activity
         └─ Workspace tab
            └─ Workspace
               ├─ Workspace header
               ├─ Workspace canvas
               │  ├─ Pane
               │  ├─ Pane
               │  └─ Pane
               ├─ Workspace extension panel
               └─ Workspace extension strip
```

## Visual Layering

The visual hierarchy should be explicit:

1. The **shell plane** uses `--panel` and carries durable chrome:
   - project switcher strip
2. The **project layout** owns the full project main region below the shell strip.
3. The **project sidebar** sits on the left edge of the project layout.
4. The **project main** sits to the right of the project sidebar.
5. The **page tabs rail** uses `--panel` inside project main.
6. The **active body** uses `--background` and carries project-context content:
   - active page or workspace content
7. A workspace tab does not create another shell layer. It replaces the active content inside project main.
8. A workspace may add a workspace-scoped header rail below the page tabs, but that header belongs to the workspace, not the project shell.
9. The rest of the workspace area contains the center canvas plus any workspace extension surfaces.

## Navigation Layers

### Project Switcher Strip

The strip switches the active project, and later the active organization/project context.

It is not a tab strip and it is not a workspace launcher. It changes the active shell context.

The canonical placement is a horizontal strip in the shell plane, to the right of macOS window controls when present.

### Project Sidebar

The sidebar is project-scoped and should contain:

1. project-level views and actions
2. the workspace list for the active project

Clicking a project-level item opens or focuses a **top-level page tab**.

Clicking a workspace opens or focuses a **workspace tab**.

### Page Tabs

Page tabs are the only top-level tab strip in the project layout.

They represent durable open destinations for the active project, for example:

1. **Project view tabs** such as Overview, Inbox, Memory, Plans, or Activity
2. **Pull request tabs** for PR detail and review
3. **Workspace tabs** such as `Workspace: setup`

These are not editor buffers and not pane-local working sets.

### Workspace And Canvas

A workspace is one kind of page tab.

Inside that tab, the workspace contains:

1. a workspace header for workspace identity and actions
2. a center canvas for pane-based work

The canvas is a **split-only** center area with:

1. recursive row/column split tree
2. one surface per pane
3. compact pane header strip for local identity and actions
4. no pane-local tab groups
5. explicit split, resize, close, and whole-pane rearrangement

Workspace extension panels and the workspace extension strip live alongside the canvas inside the workspace.

The workspace canvas is optimized for a few simultaneous surfaces, not for deep inner tab management.

## Scope Ownership

### Project-Scoped

These belong at the project shell level:

1. Overview
2. Inbox
3. Memory
4. Plans
5. Pull request list
6. Pull request detail
7. Project activity
8. Shared repo history and other durable shared artifacts

### Workspace-Scoped

These belong inside a workspace tab:

1. environment state
2. sessions / terminals
3. previews and services
4. workspace file surfaces
5. local changes diff
6. workspace-local commit detail
7. split pane layout

## Shared Surface Rule

The same renderer may appear from more than one access point.

That does **not** mean the same shell layer owns it.

The rule is:

1. shared renderer is allowed
2. access point determines shell ownership
3. shell ownership determines where the surface opens

Example: shared patch viewer

1. Project entry points:
   - pull request detail
   - pull request diff
   - repo-level commit detail
   - opens as a **project page tab**
2. Workspace entry points:
   - local changes diff
   - staged vs working diff
   - workspace-local commit detail
   - opens inside the **workspace canvas**

This keeps the UX consistent without forcing all diffs into the same navigation layer.

## Workspace Canvas Rules

The canvas exists only inside a workspace tab.

It should follow these rules:

1. Each pane shows one thing at a time.
2. Opening a surface replaces the active pane by default unless the user explicitly splits.
3. New splits may start empty and act as launch targets.
4. Empty panes are first-class workspace states, not fake tabs.
5. Pane headers stay visible as compact local control strips.
6. Whole-pane drag may rearrange layout and change grouping.
7. The canvas has no pane-local tab stacks.

This document does **not** define the detailed pane-state data model. That belongs in a dedicated canvas contract.

## Route and Restore Contract

The canonical shell route should identify the project context:

```text
/projects/:projectId
/settings
```

The route does not need to encode the full open-tab state, but identifier-only search state may mirror focus when needed for deterministic deep links and restore.

Examples:

1. focused workspace id
2. focused pull request number
3. focused project-level view id

Local restore rules:

1. project tab sets may restore per project
2. workspace canvas layout may restore per workspace
3. restore should never override provider/runtime authority

## Guardrails

This document should stay stable even if the implementation changes.

Do **not** use this document for:

1. component filenames
2. localStorage key names
3. file-by-file migration tables
4. low-level pane reducer shapes
5. detailed drag/drop implementation mechanics

If those need to change, put them in:

1. milestone docs for sequencing and delivery
2. dedicated workspace canvas docs for inner-surface mechanics
3. code and tests for exact implementation behavior

## Naming

Use these terms consistently:

1. **Project switcher strip**: shell-plane strip for project or future organization switching
2. **Shell plane**: the outer `--panel` layer that holds only the switcher strip
3. **Project layout**: the full raised project container for the active project
4. **Page tabs**: top-level project tabs rendered in the page tabs rail inside project main
5. **Project sidebar**: left project-scoped navigation panel inside the project layout
6. **Project view tab**: a page tab for durable project/org surfaces such as Overview, Inbox, Memory, Plans, or Activity
7. **Pull request tab**: a page tab for pull request detail and review surfaces
8. **Workspace tab**: a page tab whose active content is a workspace
9. **Workspace**: the workspace-scoped area inside a workspace tab
10. **Workspace header**: the workspace-scoped header rail below the page tabs
11. **Workspace canvas**: the split-only center pane surface inside a workspace
12. **Pane header**: compact strip at the top of a workspace pane
13. **Workspace extension strip**: optional workspace-scoped right-edge strip for Git, Environment, and future workspace extensions
14. **Workspace extension panel**: optional workspace-scoped panel opened from the extension strip
15. **App shell**: the full outer frame
