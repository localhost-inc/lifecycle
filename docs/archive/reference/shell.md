# App Shell v2 — Repository Shell, Workspace Canvas

> Historical note: this archived workspace-canvas spec uses an older pane-based model. The current target vocabulary is `canvas > group > surface`; see [docs/reference/vocabulary.md](/Users/kyle/dev/lifecycle/docs/reference/vocabulary.md).

This document defines the desktop shell model as Lifecycle composes a repository-first shell that can later grow into an organization-first shell.

Status note: the desktop shell is not the current execution focus. The CLI and TUI own the active shell/runtime delivery lane right now, and this document should be treated as maintenance guidance unless work explicitly targets the desktop app shell.

## Status

1. This is the **destination shell model**, not a statement of the current implementation.
2. The outer shell spine is already live in the desktop app: repository switcher strip, repository sidebar, page tabs, workspace tabs, and a workspace header now render under the repository shell route.
3. The remaining gap is the inner workspace canvas cutover; the center workspace area still follows the mixed-tab workspace-surface contract until that migration lands.

## Relationship to Other Contracts

1. `backend` and `runtime` remain authoritative for backend boundaries, runtime authority, Git authority, file authority, and terminal authority.
2. `workspace-surface` remains the current center-pane contract inside the workspace layout until `workspace-canvas` replaces it.
3. `workspace-canvas` owns the target split-only center workspace interior.
4. This document owns only the **outer shell model** and the high-level contract for what belongs at the repository level versus inside a workspace tab.

## Core Model

Lifecycle should be understood as these layered regions:

1. **Repository shell** — durable container for shared repository artifacts; later becomes compatible with organization-level grouping
2. **Repository layout** — owns the main region for the active repository; includes the top tab rail plus the active body
3. **Top-level page tabs** — the repository's open destinations (Overview, Inbox, Pull Request, Workspace)
4. **Workspace** — only exists inside a workspace tab; owns workspace identity, workspace actions, and attached workspace extensions
5. **Workspace canvas** — the center live execution and local-state surface; split-only, pane-based

The key idea: the outer shell is for **durable shared context**, the workspace is for **live execution and local work**.

## Decision Rules

1. If destroying a workspace should remove it, it is **workspace-scoped**.
2. If two workspaces in the same repository should see the same thing, it is **repository-scoped**.
3. If it depends on a live environment, worktree, session, preview, or local branch state, it is **workspace-scoped**.
4. If it is a durable shared artifact for the repository, it is **repository-scoped**.
5. A surface's visual size does **not** determine its scope.

## Shell Structure

```text
Repository shell
├─ Shell plane (`--background`)
│  └─ Repository switcher strip
└─ Repository layout
   ├─ Repository sidebar
   └─ Repository main
      ├─ Page tabs rail (`--surface`)
      │  ├─ Repository view tab
      │  ├─ Pull request tab
      │  └─ Workspace tab
      └─ Active content (`--surface`)
         ├─ Repository view
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

1. The **shell plane** uses `--background` and carries durable chrome: repository switcher strip
2. The **repository layout** owns the full main region below the shell strip.
3. The **repository sidebar** sits on the left edge of the repository layout.
4. The **repository main** sits to the right of the repository sidebar.
5. The **page tabs rail** uses `--surface` inside repository main.
6. The **active body** uses `--surface` and carries repository-context content.
7. A workspace tab does not create another shell layer. It replaces the active content inside repository main.
8. A workspace may add a workspace-scoped header rail below the page tabs, but that header belongs to the workspace, not the repository shell.
9. The rest of the workspace area contains the center canvas plus any workspace extension surfaces.

## Navigation Layers

### Repository Switcher Strip

The strip anchors the active shell context and switches repositories inside that context.

In the current local-first shell, the leading control may read as `Personal` even before shared organizations ship.

Repositories without an `organization_id` should still resolve into that implicit `Personal` shell context so local-first mode and signed-in personal mode converge on the same hierarchy.

It is not a tab strip and it is not a workspace launcher. It changes the active shell context.

### Repository Sidebar

The sidebar is repository-scoped and should contain:

1. repository-level views and actions
2. the workspace list for the active repository

Clicking a repository-level item opens or focuses a **top-level page tab**.
Clicking a workspace opens or focuses a **workspace tab**.

### Page Tabs

Page tabs are the only top-level tab strip in the repository layout.

They represent durable open destinations for the active repository:

1. **Repository view tabs** such as Overview, Inbox, Memory, Plans, or Activity
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

## Scope Ownership

### Repository-Scoped

1. Overview
2. Inbox
3. Memory
4. Plans
5. Pull request list
6. Pull request detail
7. Repository activity
8. Shared repo history and other durable shared artifacts

### Workspace-Scoped

1. environment state
2. sessions / terminals
3. previews and services
4. workspace file surfaces
5. local changes diff
6. workspace-local commit detail
7. split pane layout

## Shared Surface Rule

The same renderer may appear from more than one access point. That does **not** mean the same shell layer owns it.

The rule is:

1. shared renderer is allowed
2. access point determines shell ownership
3. shell ownership determines where the surface opens

Example: shared patch viewer

- Repository entry points (pull request detail, repo-level commit detail) → opens as a **repository page tab**
- Workspace entry points (local changes diff, workspace-local commit detail) → opens inside the **workspace canvas**

## Workspace Canvas Rules

1. Each pane shows one thing at a time.
2. Opening a surface replaces the active pane by default unless the user explicitly splits.
3. New splits may start empty and act as launch targets.
4. Empty panes are first-class workspace states, not fake tabs.
5. Pane headers stay visible as compact local control strips.
6. Whole-pane drag may rearrange layout and change grouping.
7. The canvas has no pane-local tab stacks.

## Route and Restore Contract

The canonical shell route should identify the repository context:

```text
/repositories/:repositoryId
/settings
```

Local restore rules:

1. page tab sets may restore per repository
2. workspace canvas layout may restore per workspace
3. restore should never override provider/runtime authority

## Naming

Use these terms consistently:

1. **Repository switcher strip**: shell-plane strip for repository or future organization switching
2. **Shell plane**: the outer `--background` layer that holds only the switcher strip
3. **Repository layout**: the full raised repository container for the active repository
4. **Page tabs**: top-level repository tabs rendered in the page tabs rail inside repository main
5. **Repository sidebar**: left repository-scoped navigation panel inside the repository layout
6. **Repository view tab**: a page tab for durable repository/org surfaces
7. **Pull request tab**: a page tab for pull request detail and review surfaces
8. **Workspace tab**: a page tab whose active content is a workspace
9. **Workspace**: the workspace-scoped area inside a workspace tab
10. **Workspace header**: the workspace-scoped header rail below the page tabs
11. **Workspace canvas**: the split-only center pane surface inside a workspace
12. **Pane header**: compact strip at the top of a workspace pane
13. **Workspace extension strip**: optional workspace-scoped right-edge strip for Files, Git, Environment, and future workspace extensions
14. **Workspace extension panel**: optional workspace-scoped panel opened from the extension strip
15. **App shell**: the full outer frame
