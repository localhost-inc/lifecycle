# Vocabulary

This document defines the canonical product and architecture language for Lifecycle.

Use these terms consistently in docs, code, tests, and reviews.

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
2. project layout
3. app-level routes such as settings

### Shell plane

The outer `--background` chrome layer.

Contains:

1. project switcher strip

Avoid: top chrome, title bar, header bar

Use `shell plane` unless the distinction truly does not matter.

### Shell context

The active personal or shared organization scope that owns the visible project set in the shell.

Examples: `Personal`, `Acme Health`

Local-first note:

1. projects without an `organization_id` still resolve into the implicit `Personal` shell context
2. sign-in can later persist that `Personal` context without changing the shell hierarchy

### Project switcher strip

The shell-plane strip for the active personal/shared context plus project switching within that context.

The current shell renders it horizontally to the right of macOS window controls when present.

It changes the active shell context.

The expected read is:

1. leading personal/shared context control, for example `Personal`
2. project switching within that context

It is not: a tab strip, a project sidebar, a workspace launcher

### Page tabs

The top-level tabs in the page tabs rail inside project main.

These are the durable open destinations for the active project.

Avoid: top tabs, content tabs, outer tabs

### Page tabs rail

The rail inside project main that renders page tabs.

It belongs to the project layout, not the shell plane, even when it uses surface styling.

### Active tab

The currently selected top-level page tab.

## Project

### Project layout

The single raised `--surface` surface for the active project.

Contains: project sidebar, project main, project footer

Avoid: project surface, page frame, content panel

Use `project layout` for the raised container so `surface` can keep meaning an individual content unit.

### Project main

The right-hand main column inside the project layout.

Contains: page tabs rail, active tab body

### Project sidebar

The left project-scoped navigation panel inside the project layout.

Contains: project view links, workspace list, project-scoped actions

It is project navigation, not shell chrome.

### Project page

A project-scoped content view rendered in the active tab body.

Examples: Overview, Pull Requests, Activity, Memory, Plans

### Project view tab

A page tab whose body is a project page.

Examples: Overview, Pull Requests, Activity

### Pull request tab

A page tab whose body is pull request detail or review content.

This is project-scoped, even when the renderer is shared with workspace-level diff views.

## Workspace

### Workspace tab

A page tab that opens or focuses a workspace.

This is the project-level entry point into a specific workspace.

### Workspace

The full workspace-scoped area inside a workspace tab.

Contains: workspace header, workspace canvas, optional workspace extension panel, optional workspace extension strip

Workspace records carry both a human `name` and a canonical `slug`. Use the name for display and the slug for stable path-like identity.

### Workspace header

The compact workspace-scoped rail directly below the page tabs.

Provides: workspace identity, workspace-level actions such as fork and open-in

The workspace extension strip, not the workspace header, is the durable affordance for workspace extensions.

### Workspace canvas

The group-based center work area inside the workspace.

This is the target model for the center workspace interior.

Contains: groups, rendered surfaces, canvas layout state

Avoid: workspace surface (when referring to the target split-only model)

Use `workspace surface` only when referring to the legacy/current mixed-tab implementation or the specific `workspace-surface.md` contract.

Use `workspace` for the full workspace-scoped area.

Use `workspace canvas` for the center work area.

A group owns an ordered set of surfaces plus one active surface. The canvas decides how groups are arranged in tiled or spatial modes. For terminal surfaces, the bridge/runtime informs the binding: surfaces bind to terminal ids owned by the workspace runtime. tmux-backed hosts may still map those ids to tmux sessions/windows internally, but that is not the public contract.

Implementation note:

1. use `canvas`-prefixed module names for center-host state, restore, and orchestration
2. use `group`-prefixed module names for surface ownership and active-surface switching
3. use `surface` for rendered content units and feature-owned renderers only
4. keep tiled split trees and spatial placement data on canvas layout state, not on groups

### Workspace extensions

Optional workspace-scoped side tools attached to a workspace.

Includes: workspace extension panel, workspace extension strip

### Workspace extension strip

The optional workspace-scoped right-edge strip attached to the workspace, beside the workspace canvas.

It hosts entry points for workspace extensions such as Files, Git, and Environment.

It is not: the project sidebar, app shell chrome

### Workspace extension panel

The optional workspace-scoped panel attached to the workspace, opened from the workspace extension strip.

Only one workspace extension panel is active at a time.

### Workspace page

Implementation term for the route/container that hosts a workspace inside a workspace tab.

Avoid when simple `workspace` is enough.

### Workspace panel

Legacy/current term for the old combined right-side rail.

Avoid this term in new target-state docs; use `workspace extension strip` or `workspace extension panel` instead.

## Runtime

### Lifecycle bridge

The authoritative runtime process that owns workspace/runtime reads and workspace-shell operations for Lifecycle clients.

The bridge runs on the workspace host. A client may reach that authority through a forwarded transport, but `bridge` always names the authority nearest the workspace, not an arbitrary local helper or UI-side proxy.

Use `bridge` for this authority boundary.

Avoid: local runtime, TUI runtime, server, proxy when the meaning is "the authoritative host process"

Operation naming rule:

1. use singular dotted method names across bridge and API surfaces
2. examples: `workspace.get`, `workspace.list`, `workspace.activity`, `workspace.shell`, `service.get`, `service.list`, `repo.list`
3. CLI commands and MCP tools may keep the filesystem command tree, but they should map onto the same underlying operations
4. keep plurality in arguments and results, not in the namespace name

Bridge-first rule:

1. clients ask the bridge to do runtime work
2. clients address work by workspace identity rather than resolving host placement themselves
3. the bridge layer resolves the authoritative bridge and only that bridge executes the runtime work
4. runtime changes stream back out of the bridge as lifecycle events, and agent session UIs may also subscribe to raw agent event streams on the same socket
5. clients update UI state from bridge responses and bridge events rather than inventing alternate authority paths

### Selected workspace

The workspace currently focused by a specific client.

This is client-owned UI state.

Examples:

1. the workspace currently shown in the TUI
2. the last workspace restored from local client state

Many workspaces may be running at once. A client selects one of them.

### Initial workspace hint

An optional startup hint that tells a client which workspace to select first.

Examples:

1. `LIFECYCLE_INITIAL_WORKSPACE_ID`
2. web local storage restoring a previously selected workspace

This is still client state, not server authority.

### Workspace shell

The bridge-resolved shell operation and metadata for a specific workspace.

Contains:

1. workspace scope
2. shell launch details

Use `workspace shell` when the client asks the bridge to open the shell for a selected workspace.

### Terminal runtime

The bridge-owned runtime boundary that manages terminals for one workspace.

It owns terminal discovery, creation, attach, detach, and close operations.

### Terminal

One interactive terminal inside a workspace runtime.

Use `terminal` for first-class interactive terminal records and CLI operations such as:

1. `lifecycle terminal list`
2. `lifecycle terminal open`
3. `lifecycle terminal attach`

### Terminal connection

An ephemeral client attachment to one terminal.

Connections are client-scoped and transport-specific. They are not the same thing as terminal identity.

### Terminal activity

The bridge-owned derived runtime state for one terminal.

Terminal activity is terminal-scoped first and may be aggregated into workspace activity.

It may be sourced from explicit hook events, shell integration, or weaker recent-output heuristics.

### Activity event

A terminal-scoped runtime signal emitted from inside a Lifecycle-managed terminal, usually through `lifecycle workspace activity emit`.

Activity events resolve by `LIFECYCLE_WORKSPACE_ID` and `LIFECYCLE_TERMINAL_ID`. `provider` may be attached as metadata, but it is not the authority key.

### Environment

The declarative execution graph defined in `lifecycle.json`.

It describes:

1. `workspace.prepare`
2. task nodes
3. service nodes
4. dependency edges
5. health checks

Use `environment` for the checked-in contract, not for the live CLI namespace.

### Stack

The live runnable graph inside a workspace.

This is the canonical CLI noun for whole-runtime operations.

Examples:

1. `lifecycle stack status`
2. `lifecycle stack run`
3. `lifecycle stack logs`

Use `stack` for operational runtime control.

Do not use `environment` as the CLI noun when the meaning is "the live thing currently running."

### Service

One named runtime node inside a workspace stack.

Services are derived from service nodes in the declared environment graph.

Use `service` for node-scoped runtime operations such as:

1. `lifecycle service info api`
2. `lifecycle service logs api`
3. `lifecycle service start api`

Service logs are one logical stream per service. Entries may still carry `stdout` or `stderr` metadata, but clients should present a unified log stream. Local log storage lives under `~/.lifecycle/logs/<repo_slug>/<workspace_slug>/` and may include an extra `<org_slug>/` segment when organization scope exists.

### Context

The aggregate CLI read across project, workspace, terminal, stack, service, and git facts.

This is the canonical CLI noun for one-shot orientation and machine-readable discovery.

Examples:

1. `lifecycle context`
2. `lifecycle context --json`

Use `context` when the caller needs a composed view of the current workspace state instead of a single project, workspace, stack, or service read.

## Collaboration

### Organization

The authenticated cloud tenancy boundary for shared projects, repositories, and cloud workspaces.

Examples: `Personal`, `Acme`

Use `organization` for cloud ownership and policy. Do not use it as a synonym for `project`.

Organization records carry both a human `name` and a canonical `slug`.

### Personal organization

The default organization activated for a user after cloud sign-in when they have not yet switched to a shared organization.

Use `Personal` as the user-facing label for this scope.

### Repository

The linked VCS identity for a project.

Repository records own provider linkage for clone, push, pull request create, and pull request merge. They do not define the runtime contract; that still lives in `lifecycle.json`.

Repository records carry both a human `name` and a canonical `slug`.

`install` is the unified Lifecycle setup path. It is bridge-backed so CLI, TUI, and desktop can share one install/status/apply flow for local preview proxy setup, repo-scoped harness integration, and managed AGENTS.md / CLAUDE.md guidance blocks.

`repo install` remains the lower-level repo-scoped setup path for Lifecycle-managed harness integration. The current shipped behavior installs merge-only repo-scoped MCP config plus repo-scoped hook integration for supported harnesses.

`proxy install` remains the lower-level machine-scoped setup path for local preview routing. It installs optional clean HTTP support for `*.lifecycle.localhost` on the current machine and is separate from repo-scoped harness integration.

### Remote collaboration

Access to a workspace from another person or device through previews, snapshots, attach flows, or other shared surfaces.

Remote collaboration widens access around a workspace but does not, by itself, move authority from local to cloud.

Do not use `remote collaboration` as shorthand for `workspace.host=remote`.

### Cloud workspace

An organization-visible workspace whose authoritative host and control plane are cloud-side.

Use `cloud workspace` when the workspace itself runs under cloud authority, not when a local workspace merely exposes a remote collaboration surface.

## Agent

### Agent session

The first-party Lifecycle interaction thread for an agent within a workspace.

It is the canonical record for center-panel agent history.

It is not: a terminal id, a provider thread id, or a provider session id

Provider-owned identifiers may be attached as metadata, but `agent session` is the product object.

## Groups

### Group

A canvas-local container that owns an ordered set of surfaces and one active surface.

In tiled mode, a group renders as a standard tabset inside a tile.

In spatial mode, the same group may render as a floating window or card.

### Tab

The visual affordance for switching surfaces inside a group.

It is not a first-class canvas domain object.

Use `tab` for chrome and interaction, `surface` for the content being rendered, and `group` for the container that owns them.

### Active surface

The currently selected surface shown inside a group.

### Preview surface

An embedded workspace-canvas surface that renders a URL inside the app.

Service previews open in a preview surface by default.

Use `preview` for the canvas document kind and `preview surface` for the rendered group content.

### Empty group

A group with no active surface yet.

This is a first-class canvas state, not a fake tab.

### Split

Creating a sibling group from an existing group.

Use `split`, not `open beside`, as the canonical noun for the layout action.

### Group rearrange

Moving a whole group to change tiled or spatial layout.

Use this term for whole-group layout movement.

Avoid: tab move, tab drag (unless the thing actually is a tab move in a real tab strip)

## Surfaces

### Surface

A rendered content unit, regardless of scope.

Examples: pull request surface, local changes surface, terminal surface, file surface

### Shared renderer

A renderer that can appear from more than one access point.

The renderer may be shared, while shell ownership still differs by access point.

Example: the patch viewer renderer can open from project scope or workspace scope

Implementation note: `surface` should describe what a group shows, not the outer workspace host

## Scope

### Project-scoped

Shared, durable project or repository context.

Examples: project pages, pull request tabs, project activity

### Workspace-scoped

Live execution context tied to one workspace.

Examples: terminals, services and preview surfaces, local changes, workspace canvas layout

Local worktree checkouts live under `~/.lifecycle/worktrees/<org_slug>/<repo_slug>/`, with `local` as the org slug when no active organization is selected.

### Repository path

The durable source checkout path on the authoritative bridge host.

Use this term for:

1. local worktree creation, rename, and archive operations
2. root-workspace source checkout identity

Do not use this term for runtime cwd once a workspace has been resolved.

### Workspace root

The live runtime working directory for one concrete workspace.

Rules:

1. Runtime reads and mutations such as shell attach, terminal control, stack execution, file IO, and git status use the workspace root.
2. For `checkout_type=root`, the workspace root equals the repository path.
3. For `checkout_type=worktree`, the workspace root is the concrete worktree checkout and the repository path remains the source checkout used to manage it.

## Current vs Target Terms

### Workspace surface

Current meaning: the existing mixed-tab workspace implementation, the current contract in `workspace-surface.md`

Target meaning: do not use this term for the split-only future model

Use `workspace` for the full workspace-scoped area. Use `workspace canvas` for the center work area.

### Pane

Legacy/current visual term for a tiled group in older workspace canvas implementations.

Do not use `pane` as the canonical data-model term for new canvas work.

Use `group` for the canvas-owned container and `tab` for the UI that selects a group's active surface.

### Project surface

Avoid this term for now because it is ambiguous between the raised project container and a specific project-scoped content unit.

Use: `project layout` for the raised container, `project page` or `surface` for the content unit

## Quick Reference

```text
app shell
├─ shell plane
│  └─ project switcher strip
└─ project layout
   ├─ project sidebar
   └─ project main
      ├─ page tabs
      └─ active tab body
         ├─ project page
         ├─ pull request tab
         └─ workspace tab
            └─ workspace
               ├─ workspace header
               ├─ workspace canvas
               │  ├─ tiled layout / spatial layout
               │  └─ group
               │     ├─ surface tabs
               │     └─ active surface
               ├─ workspace extension panel
               └─ workspace extension strip
```
