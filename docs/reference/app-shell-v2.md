# App Shell v2 — Project Shell, Workspace Workbench

This document defines the **target desktop shell model** as Lifecycle moves from a workspace-first app toward a project-first shell that can later grow into an organization-first shell.

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
2. The current desktop still follows the existing workspace-first route and workspace-surface contracts until migration lands.
3. Implementation sequencing belongs in execution docs such as [execution/project-shell-cutover.md](../execution/project-shell-cutover.md), not here.

## Relationship to Other Contracts

1. [workspace-provider.md](./workspace-provider.md) remains authoritative for provider boundaries, runtime authority, Git authority, file authority, and terminal authority.
2. [workspace-surface.md](./workspace-surface.md) remains the current workspace-surface contract until [workspace-workbench.md](./workspace-workbench.md) replaces it.
3. [workspace-workbench.md](./workspace-workbench.md) owns the target split-only workspace interior.
4. This document owns only the **outer shell model** and the high-level contract for what belongs at the project level versus inside a workspace tab.
5. Detailed pane-state, drag-target, or restore-shape mechanics should live in the workspace workbench contract, not expand ad hoc inside this document.

## Core Model

Lifecycle should be understood as three layers:

1. **Project shell**
   - durable container for shared repo/project artifacts
   - later becomes compatible with organization-level grouping
2. **Project canvas**
   - owns the page area for the active project
   - includes the top tab rail plus the active body
3. **Top-level page tabs**
   - the project's open destinations
   - examples: Overview, Inbox, Pull Request, Workspace
4. **Workspace page**
   - only exists inside a workspace tab
   - owns workspace identity and workspace-level actions
5. **Workspace workbench**
   - exists below the workspace page header
   - live execution and local-state surface
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
└─ Project canvas
   ├─ Project sidebar
   └─ Page area
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
            └─ Workspace page
               ├─ Workspace page header
               └─ Workspace workbench
                  ├─ Pane
                  ├─ Pane
                  └─ Pane
```

## Visual Layering

The visual hierarchy should be explicit:

1. The **shell plane** uses `--panel` and carries durable chrome:
   - project switcher strip
2. The **project canvas** owns the full page area below the shell strip.
3. The **project sidebar** sits on the left edge of the project canvas.
4. The **page area** sits to the right of the project sidebar.
5. The **page tabs rail** uses `--panel` inside the page area.
6. The **active body** uses `--background` and carries project-context content:
   - active page or workspace content
7. A workspace tab does not create another shell layer. It replaces the active content inside the page area.
8. A workspace page may add a workspace-scoped header rail below the page tabs, but that header belongs to the workspace page, not the project shell.

## Navigation Layers

### Project Switcher Strip

The strip switches the active project, and later the active organization/project context.

It is not a tab strip and it is not a workspace launcher. It changes the active shell context.

The canonical placement is a horizontal strip in the shell plane, to the right of macOS window controls when present.

### Project Sidebar

The sidebar is project-scoped and should contain:

1. project-level views and actions
2. the workspace list for the active project

Clicking a project-level item opens or focuses a **top-level content tab**.

Clicking a workspace opens or focuses a **workspace tab**.

### Page Tabs

Page tabs are the only top-level tab strip in the project canvas.

They represent durable open destinations for the active project, for example:

1. **Project view tabs** such as Overview, Inbox, Memory, Plans, or Activity
2. **Pull request tabs** for PR detail and review
3. **Workspace tabs** such as `Workspace: setup`

These are not editor buffers and not pane-local working sets.

### Workspace Workbench

A workspace is one kind of page tab.

Inside that tab, the workspace becomes a **split-only workbench**:

1. a workspace page header for workspace identity and actions
2. recursive row/column split tree below that header
3. one surface per pane
4. compact pane header strip for local identity and actions
5. no pane-local tab groups
6. explicit split, resize, close, and whole-pane rearrangement

The workspace workbench is optimized for a few simultaneous surfaces, not for deep inner tab management.

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
   - opens inside the **workspace workbench**

This keeps the UX consistent without forcing all diffs into the same navigation layer.

## Workspace Workbench Rules

The workbench exists only inside a workspace tab.

It should follow these rules:

1. Each pane shows one thing at a time.
2. Opening a surface replaces the active pane by default unless the user explicitly splits.
3. New splits may start empty and act as launch targets.
4. Empty panes are first-class workspace states, not fake tabs.
5. Pane headers stay visible as compact local control strips.
6. Whole-pane drag may rearrange layout and change grouping.
7. The workbench has no pane-local tab stacks.

This document does **not** define the detailed pane-state data model. That belongs in a dedicated workbench contract.

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
2. workspace workbench layout may restore per workspace
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
2. dedicated workspace workbench docs for inner-surface mechanics
3. code and tests for exact implementation behavior

## Naming

Use these terms consistently:

1. **Project switcher strip**: shell-plane strip for project or future organization switching
2. **Shell plane**: the outer `--panel` layer that holds only the switcher strip
3. **Project canvas**: the full page area for the active project
4. **Page tabs**: top-level project tabs rendered in the canvas top rail
5. **Project sidebar**: left project-scoped navigation panel inside the active body
6. **Project view tab**: a page tab for durable project/org surfaces such as Overview, Inbox, Memory, Plans, or Activity
7. **Pull request tab**: a page tab for pull request detail and review surfaces
8. **Workspace tab**: a page tab whose active content is a workspace workbench
9. **Workspace workbench**: the split-only pane surface inside a workspace tab
10. **Pane header**: compact strip at the top of a workspace pane
11. **Workspace panel**: optional workspace-scoped right-side panel
12. **App shell**: the full outer frame
