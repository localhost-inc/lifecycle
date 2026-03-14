# Project Shell Cutover

This is the **working execution document** for moving Lifecycle from the current workspace-first desktop app to the target project-shell / workspace-workbench model.

Use this document step by step.

It should stay tactical enough to drive implementation, but stable enough that we do not rewrite it every time a file moves.

## Source Documents

1. [reference/app-shell-v2.md](../reference/app-shell-v2.md)
2. [reference/workspace-workbench.md](../reference/workspace-workbench.md)
3. [reference/workspace-provider.md](../reference/workspace-provider.md)
4. [reference/workspace-files.md](../reference/workspace-files.md)
5. [reference/workspace-surface.md](../reference/workspace-surface.md) for current-state comparison only

## Non-Negotiable Rules

1. Do not try to land the outer shell rewrite and the inner workspace-workbench rewrite in one batch.
2. Do not let project-scoped artifacts continue leaking through workspace-local UI once a project-level surface exists for them.
3. Do not let the new shell break workspace/provider/runtime authority boundaries.
4. Do not let the workbench become a second tab manager.
5. Delete old paths once the replacement is proven; do not accumulate compatibility layers.

## High-Level Sequence

```text
Contracts
→ Project shell spine
→ Workspace tab host
→ Project-scoped tabs
→ Workspace workbench cutover
→ Legacy deletion
```

## Phase 0 — Freeze the Contracts

Objective:

Create a stable doc system before cutting code.

Deliverables:

- [x] `app-shell-v2.md` is shell-only
- [x] `workspace-workbench.md` defines the target inner workspace model
- [x] current-vs-target boundary is explicit
- [x] naming for project view tabs, pull request tabs, workspace tabs, workspace workbench, and pane header is explicit

Exit gate:

- [x] no remaining ambiguity about what belongs to the project shell versus inside a workspace tab

## Phase 1 — Build the Project Shell Spine

Objective:

Introduce the new outer shell without changing the current workspace interior yet.

Deliverables:

- [x] real `ProjectRoute`
- [x] project switcher strip
- [x] project sidebar
- [x] project canvas with a top page-tab rail
- [x] page tabs live inside the project canvas, not on the shell plane
- [x] project-scoped content-tab state
- [x] canonical shell route based on `/projects/:projectId`

Likely code touchpoints:

- router
- dashboard/root shell layout
- title-bar replacement
- sidebar split into project shell components
- new project content-tab state module

Out of scope:

- split-only workspace workbench
- removing pane-local tabs
- moving PR/detail UI out of the current workspace surface

Exit gate:

- [x] the app can render a project-scoped shell even if a workspace tab still hosts the current workspace surface internally

## Phase 2 — Make Workspace a First-Class Top-Level Tab Kind

Objective:

Treat workspace as one project content-tab kind instead of the app's primary route mode.

Deliverables:

- [x] `WorkspaceTab` becomes a first-class content-tab payload
- [x] opening a workspace from the sidebar focuses or creates a workspace tab
- [x] current workspace content mounts inside that tab host
- [x] workspace deep links resolve to project context plus focused workspace tab
- [x] workspace tabs own a workspace page header below the page tabs for workspace identity and workspace-level actions

Likely code touchpoints:

- project content-tab reducer/store
- project route tab-host rendering
- workspace open request handling
- route/search-param focus helpers

Out of scope:

- changing the inner workspace model
- moving project-scoped PR/activity surfaces yet

Exit gate:

- [x] workspace no longer needs to be the app's primary navigation mode

## Phase 3 — Move Shared Project Artifacts to Top-Level Tabs

Objective:

Stop treating shared repo/project artifacts as workspace-owned UI.

Deliverables:

- [x] pull request list opens as a project-level surface
- [x] pull request detail opens as a project-level tab
- [x] activity moves to project scope
- [x] current project-level overview surface exists
- [x] shared patch viewer is reused from project access points without changing its renderer contract

Likely code touchpoints:

- Git / PR routes and panels
- workspace panel ownership boundaries
- project-level data loaders and views
- content-tab kinds for project views and PR tabs

Out of scope:

- split-only workspace cutover
- deeper org-only surfaces like Memory or Plans unless they are ready to ship

Exit gate:

- [x] PR and project activity no longer depend on opening a workspace first

## Phase 4 — Cut Over the Workspace Interior to the Workbench Model

Objective:

Replace the current mixed-tab workspace surface with the target split-only workbench.

Deliverables:

- [ ] one surface per pane
- [ ] compact pane header strip
- [ ] no pane-local tab groups
- [ ] explicit split / resize / close / whole-pane rearrangement
- [ ] empty-pane launch surfaces
- [ ] restore model aligned with the workbench contract

Likely code touchpoints:

- workspace surface state
- workspace surface controller and render tree
- pane drag/drop model
- pane header component
- file / diff / terminal open request flows

Out of scope:

- shell-level project tab changes
- provider authority changes unrelated to workbench placement

Exit gate:

- [ ] the workspace interior behaves as a split-only workbench and no longer carries a second tab stack

## Phase 5 — Delete Legacy Shell and Surface Paths

Objective:

Remove the old architecture once the new one is working.

Deliverables:

- [x] old workspace-first route removed
- [x] old title-bar assumptions removed
- [ ] old pane-local tab stack removed
- [ ] docs updated so current and target no longer diverge
- [ ] obsolete helper/state modules deleted

Exit gate:

- [ ] there is only one authoritative shell model and one authoritative workspace-interior model

## Verification Strategy

Each phase should prove one thing before the next begins.

### Phase 1

- [x] project shell renders
- [x] switching projects switches tab sets
- [x] shell still hosts current workspace content safely

### Phase 2

- [x] workspace open/focus behavior works through project tab state
- [x] workspace deep-link behavior still works

### Phase 3

- [x] PR and activity surfaces work with no workspace selected
- [x] project access points and workspace access points can share renderers without sharing ownership

### Phase 4

- [ ] split, resize, rearrange, empty-pane launch, and close flows behave correctly
- [ ] scenario tests cover repeated pane operations
- [ ] workbench restore survives reload

### Phase 5

- [ ] no dead shell paths remain
- [ ] docs and implementation match

## Open Decisions We Must Resolve Before or During Cutover

- [ ] which project-level surfaces ship in the first shell pass: Overview only, or Overview + PR + Activity?
- [ ] whether repo-level commit detail defaults to a project tab everywhere, or remains dual-entry depending on access point
- [ ] whether the workspace right-side panel survives as-is or is split into smaller workspace-scoped surfaces during workbench cutover

## Recommended First Batch

If we start implementation now, do this first:

1. land the project shell spine
2. make workspace a top-level tab kind
3. host the current workspace surface inside that tab

That gives us the new app shape with the least churn and keeps the split-only workbench rewrite as an isolated second move.
