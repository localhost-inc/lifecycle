# Vocabulary

This document defines the canonical product and architecture language for Lifecycle.

Use these terms consistently in docs, code, tests, and reviews.

## Purpose

1. Keep naming stable while the shell and workspace model evolve.
2. Reduce drift between docs, implementation, and design discussion.
3. Make scope and ownership easier to reason about.

## Rules

1. Prefer the canonical term even if an older local name still exists in code.
2. Do not invent near-synonyms for core shell, project, or workspace concepts.
3. If a new durable concept is introduced, add it here in the same change.
4. If a current implementation name conflicts with the target model, call that out explicitly instead of overloading the term.

## Shell

### App shell

The full desktop frame.

Includes:

1. shell plane
2. project canvas
3. app-level routes such as settings

### Shell plane

The outer `--panel` chrome layer.

Contains:

1. project switcher strip

Avoid:

1. top chrome
2. title bar
3. header bar

Use `shell plane` unless the distinction truly does not matter.

### Project switcher strip

The shell-plane strip for switching projects and, later, organizations.

The current shell renders it horizontally to the right of macOS window controls when present.

It changes the active shell context.

It is not:

1. a tab strip
2. a project sidebar
3. a workspace launcher

### Page tabs

The top-level tabs in the page-area tab rail.

These are the durable open destinations for the active project.

Avoid:

1. top tabs
2. content tabs
3. outer tabs

Use `page tabs`.

### Active tab

The currently selected top-level content tab.

## Project

### Project canvas

The single raised `--background` surface for the active project.

Contains:

1. project sidebar
2. page area
3. project footer

Avoid:

1. project surface
2. page frame
3. content panel

Use `project canvas` for the raised container so `surface` can keep meaning an individual content unit.

### Page area

The right-hand content column inside the project canvas.

Contains:

1. page tabs rail
2. active tab body

### Project sidebar

The left project-scoped navigation panel inside the project canvas.

Contains:

1. project view links
2. workspace list
3. project-scoped actions

It is project navigation, not shell chrome.

### Project page

A project-scoped content view rendered in the active tab body.

Examples:

1. Overview
2. Pull Requests
3. Activity
4. Memory
5. Plans

### Project view tab

A page tab whose body is a project page.

Examples:

1. Overview
2. Pull Requests
3. Activity

### Pull request tab

A page tab whose body is pull request detail or review content.

This is project-scoped, even when the renderer is shared with workspace-level diff views.

## Workspace

### Workspace tab

A page tab whose body is a workspace page.

This is the project-level entry point into a specific workspace.

### Workspace page

The full workspace-scoped body inside a workspace tab.

Contains:

1. workspace page header
2. workspace workbench

### Workspace page header

The compact workspace-scoped rail directly below the page tabs.

It provides:

1. workspace identity
2. workspace-level actions such as fork and open-in
3. workspace-panel visibility controls

### Workspace workbench

The pane-based work area below the workspace page header.

This is the target model for the workspace interior.

Contains:

1. panes
2. pane headers
3. pane content
4. optional workspace panel

Avoid:

1. workspace surface, when referring to the target split-only model

Use `workspace surface` only when referring to the legacy/current mixed-tab implementation or the specific `workspace-surface.md` contract.

### Workspace panel

The optional workspace-scoped right-side panel inside the workspace workbench.

Use this for the workspace-local side panel, not for the project sidebar.

## Panes

### Pane

One split region inside the workspace workbench.

A pane owns:

1. one pane header
2. one active pane content surface

### Pane header

The compact strip at the top of a pane.

It provides:

1. local identity
2. local actions
3. split and close controls

It is not a tab strip.

### Pane content

The active surface shown inside a pane.

### Empty pane

A pane with no active surface yet.

This is a first-class state, not a fake tab.

### Split

Creating a sibling pane from an existing pane.

Use `split`, not `open beside`, as the canonical noun for the layout action.

### Pane rearrange

Dragging a whole pane to change layout or grouping.

Use this term for split-only layout movement.

Avoid:

1. tab move
2. tab drag

unless the thing actually is a tab move in a real tab strip.

## Surfaces

### Surface

A rendered content unit, regardless of scope.

Examples:

1. pull request surface
2. local changes surface
3. terminal surface
4. file surface

### Shared renderer

A renderer that can appear from more than one access point.

The renderer may be shared, while shell ownership still differs by access point.

Example:

1. the patch viewer renderer can open from project scope or workspace scope

## Scope

### Project-scoped

Shared, durable project or repository context.

Examples:

1. project pages
2. pull request tabs
3. project activity

### Workspace-scoped

Live execution or local worktree context tied to one workspace.

Examples:

1. terminals
2. services and previews
3. local changes
4. workspace workbench layout

## Current vs Target Terms

### Workspace surface

Current meaning:

1. the existing mixed-tab workspace implementation
2. the current contract in `docs/reference/workspace-surface.md`

Target meaning:

1. do not use this term for the split-only future model

Use `workspace workbench` for the target model.

### Project surface

Avoid this term for now because it is ambiguous between:

1. the raised project container
2. a specific project-scoped content unit

Use:

1. `project canvas` for the raised container
2. `project page` or `surface` for the content unit

## Quick Reference

```text
app shell
├─ shell plane
│  └─ project switcher strip
└─ project canvas
   ├─ project sidebar
   └─ page area
      ├─ page tabs
      └─ active tab body
         ├─ project page
         ├─ pull request tab
         └─ workspace tab
            └─ workspace workbench
               ├─ pane
               │  ├─ pane header
               │  └─ pane content
               └─ workspace panel
```
