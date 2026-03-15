# Workspace Extension Strip

This is the working execution document for replacing the current workspace right rail with a workspace-scoped extension strip.

Use this document to drive the change in small, deletable batches.

## Source Documents

1. [milestones/m4.md](../milestones/m4.md)
2. [reference/app-shell-v2.md](../reference/app-shell-v2.md)
3. [reference/workspace-canvas.md](../reference/workspace-canvas.md)
4. [VOCABULARY.md](../VOCABULARY.md)
5. [reference/workspace-surface.md](../reference/workspace-surface.md) for current-state comparison only

## Decisions

1. Git and Environment are first-party workspace extensions, not shell chrome.
2. The extension strip appears only inside workspace tabs.
3. Only one extension panel is open at a time.
4. The extension host lives in `features/workspaces` / `features/extensions`, not in `ProjectRoute` portal infrastructure.
5. Panel width is a best-effort persisted desktop preference; active extension state is workspace-scoped state.
6. Existing `GitPanel` and `EnvironmentPanel` should be reused first; do not invent a plugin API in the first batch.
7. The workspace header no longer owns a generic show/hide-right-sidebar control; the strip is the durable affordance.

## Non-Negotiable Rules

1. Do not keep route-owned right-rail state and merely rename it to extension state.
2. Do not preserve the current `WorkspaceLayout -> portal -> #workspace-right-rail` path as a compatibility layer.
3. Do not ship badge UI without explicit derivation rules for Git and Environment state.
4. Do not lose native terminal resize coordination; preserve shell resize notifications for extension-panel drags.
5. Update docs and tests in the same change that deletes the old rail.

## Revised Sequence

```text
Contract updates
→ Extension host primitives
→ Controlled extension state
→ Workspace integration
→ Legacy rail deletion
→ Tests and doc cleanup
```

## Phase 0 — Freeze The Contract

Objective:

Make the target UI model explicit before changing layout code.

Deliverables:

- [x] vocabulary updated from `workspace panel` to `workspace extension strip` / `workspace extension panel`
- [x] M4 desktop-surface contract updated so Environment controls are extension-owned
- [x] project-shell cutover docs record that the old right rail is not the target model

Exit gate:

- [x] target docs no longer describe the combined right rail as the durable architecture

## Phase 1 — Build Extension Host Primitives

Objective:

Introduce one workspace-scoped extension host with explicit state and ownership.

Deliverables:

- [x] extension descriptor type for built-in slots
- [x] workspace extension host state with `activeExtensionId`
- [x] persisted panel width with new storage keys
- [x] resizable extension-panel container with left-edge drag handle

Likely code touchpoints:

- `apps/desktop/src/features/extensions/*`
- `apps/desktop/src/lib/panel-layout.ts`

Rules:

1. The descriptor must support badge derivation and workspace-scoped availability.
2. Keep the first version internal; do not promise third-party extension loading yet.

Exit gate:

- [x] the extension host can render a strip and one resizable panel without depending on `ProjectRoute`

## Phase 2 — Lift Extension-Local View State

Objective:

Avoid remount-driven state loss when switching between extensions.

Deliverables:

- [x] Git continues to use explicit controlled state for `changes|history`
- [x] Environment tab selection becomes explicit controlled state instead of hidden component-local state
- [x] active extension state is stored per workspace rather than as one global app toggle

Likely code touchpoints:

- `apps/desktop/src/features/workspaces/lib/workspace-route-state.ts`
- `apps/desktop/src/features/workspaces/components/environment-panel.tsx`
- `apps/desktop/src/features/git/components/git-panel.tsx`

Exit gate:

- [x] switching Git ↔ Environment does not reset panel-local navigation unexpectedly

## Phase 3 — Integrate The Host Inside The Workspace Page

Objective:

Move the workspace-scoped extension layout into the workspace feature and stop treating it as route chrome.

Deliverables:

- [x] `WorkspaceLayout` renders the center canvas plus extension strip/panel directly
- [x] `ProjectRoute` no longer renders `#workspace-right-rail` or owns workspace extension-panel width/collapse state
- [x] header actions drop the old generic show/hide-sidebar affordance if it no longer maps cleanly to the new model

Likely code touchpoints:

- `apps/desktop/src/features/workspaces/components/workspace-layout.tsx`
- `apps/desktop/src/features/projects/routes/project-route.tsx`
- `apps/desktop/src/components/layout/title-bar-actions.tsx`
- `apps/desktop/src/features/workspaces/components/workspace-header.tsx`

Exit gate:

- [x] workspace layout is self-contained and no longer depends on a portal target owned by the project route

## Phase 4 — Register Built-Ins And Badge Rules

Objective:

Make Git and Environment first-class workspace extensions with explicit badge behavior.

Deliverables:

- [x] Git extension descriptor with icon and changed-file-count badge
- [x] Environment extension descriptor with icon and derived health indicator
- [x] badge derivation helpers documented in code and covered by tests

Badge rules:

1. Git badge is driven by `gitStatus.files.length`.
2. Environment health is derived from `workspace.status`, `workspace.failure_reason`, and current service states; do not invent a new backend contract for the first slice.

Likely code touchpoints:

- `apps/desktop/src/features/extensions/builtin-extensions.ts`
- `apps/desktop/src/features/git/hooks.ts`
- `apps/desktop/src/features/workspaces/hooks.ts`

Exit gate:

- [x] strip icons reflect live workspace state without reopening the full panel

## Phase 5 — Delete Legacy Right-Rail Infrastructure

Objective:

Remove the old implementation once the replacement is proven.

Deliverables:

- [x] `WorkspaceSidebar` deleted
- [x] portal fallback path removed from `WorkspaceLayout`
- [x] right-rail storage keys removed
- [x] old resize gutter and collapse state removed from `ProjectRoute`

Exit gate:

- [x] there is only one authoritative workspace-extension layout path

## Verification

1. Extension strip appears only on workspace tabs, not Overview, Activity, or PR tabs.
2. Clicking Git opens the Git extension panel; clicking Git again collapses it.
3. Clicking Environment switches the active extension panel.
4. Git badge shows changed-file count.
5. Environment badge reflects derived health state.
6. Panel width is draggable and persists.
7. No extension panel open means the workspace content regains nearly full width except for the strip.
8. Existing Git and Environment panel functionality still works unchanged inside the new host.
9. Native terminal resize behavior remains stable while dragging the extension panel.

## Test Plan

1. Add unit tests for extension-host toggle behavior and badge rendering.
2. Update `WorkspaceLayout` tests to stop mocking `WorkspaceSidebar` and instead assert extension-host integration.
3. Update route-level tests so workspace tabs render the strip while project tabs do not.
4. Update header-action tests if the old sidebar toggle is removed or repurposed.
