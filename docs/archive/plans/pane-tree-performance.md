# Plan: Workspace pane tree performance

> Status: active execution plan
> Context: parallel to the active milestone contract in [docs/milestones/README.md](../milestones/README.md) and tracked with other future work in [docs/plans/README.md](./README.md)
> Related: [docs/reference/workspace.md](../reference/workspace.md), [docs/reference/terminal.md](../reference/terminal.md), [docs/milestones/4-workspace-environments.md](../milestones/4-workspace-environments.md)

This document is the canonical execution plan for making workspace pane and tab interactions feel instant under real multi-pane, multi-tab load.

Use this file for:
1. the current pane-tree performance constraints
2. the measurement protocol for tab switching and pane interactions
3. the phased implementation plan to remove latency
4. the acceptance gates before we move on to transcript rendering

## Planning Rules

1. Preserve the current workspace contract in [docs/reference/workspace.md](../reference/workspace.md), especially runtime mount continuity for live tabs and pane-local render locality.
2. Optimize by reducing invalidation scope first. Do not paper over render churn with throttles or hidden fallbacks.
3. Keep pane-tree, tab-bar, and surface-render improvements separable so we can verify each slice.
4. Do not break inactive live-tab mounting semantics just to improve switching numbers.
5. Add instrumentation before broad refactors so performance claims are repeatable.
6. Every change in this stream needs either a regression test, a benchmark fixture, or an explicit measurement hook.

## Problem Statement

Switching tabs in the workspace center panel has visible latency. Static inspection points to a fan-out problem more than one isolated slow component:

1. The canvas controller eagerly rebuilds normalized tab arrays, per-pane visible tab arrays, tab-bar models, active-surface models, and mounted surface descriptors across the full pane tree for many local state changes.
2. The pane-tree memo boundary is partially defeated by unstable tab-bar data, especially fresh React nodes used as tab leading icons.
3. Pane content re-renders every mounted surface in a pane on active-tab changes, even when only one surface becomes visible.
4. Hidden surfaces stay mounted by contract, but they are not yet isolated from parent re-renders well enough.
5. Drag/drop geometry reads and drag-state updates still do layout work on the hot pointer path.
6. The app has almost no pane-level instrumentation today, so regressions are easy to miss and improvements are hard to prove.

## Current Hotspots

### A. Controller-wide derivation fan-out

The controller rebuilds several full-tree derived objects on the active render path, including normalized tabs, `tabsByKey`, visible tabs per pane, rendered active tab lookup, and full `panesById` models that include tab-bar and surface models for every visible tab.

References:
1. [workspace-canvas-controller.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/workspace-canvas-controller.tsx#L132)
2. [workspace-canvas-controller.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/workspace-canvas-controller.tsx#L153)
3. [workspace-canvas-controller.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/workspace-canvas-controller.tsx#L201)

### B. Tab-bar memo invalidation from unstable `leading`

`createWorkspacePaneTabModels(...)` rebuilds each tab model on every pass, and `areWorkspacePaneTabModelsEqual(...)` compares `leading` by reference. Since tab presentation returns fresh React nodes, pane headers re-render even when the semantic tab state did not change.

References:
1. [workspace-canvas-controller.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/workspace-canvas-controller.tsx#L230)
2. [workspace-pane-tree.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/panes/workspace-pane-tree.tsx#L470)
3. [agent-surface-definition.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/surfaces/agent-surface-definition.tsx#L75)

### C. Active-tab switches re-render every mounted surface in the pane

`WorkspacePaneContent` maps all `tabSurfaces` on every render and calls `renderWorkspacePaneActiveSurface(...)` for every mounted tab. Because hidden surfaces remain mounted and the concrete surface components are not isolated behind stable memo boundaries, same-pane tab switches can still re-render hidden agent, file, and preview surfaces.

References:
1. [workspace-pane-content.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/panes/workspace-pane-content.tsx#L27)
2. [agent-surface-definition.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/surfaces/agent-surface-definition.tsx#L143)
3. [file-editor-surface-definition.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/explorer/surfaces/file-editor-surface-definition.tsx#L36)
4. [preview-surface-definition.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/surfaces/preview-surface-definition.tsx#L29)

### D. Drag path still performs full DOM geometry reads

During tab drag, drop intent resolution reads pane, body, tab-bar, and tab rects from the DOM and stores drag state in React state on pointer movement. That path is separate from ordinary tab switching, but it still needs tuning because it shares the same tree and can easily regress perceived responsiveness.

References:
1. [workspace-pane-tree.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/panes/workspace-pane-tree.tsx#L736)
2. [workspace-pane-tree.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/panes/workspace-pane-tree.tsx#L818)
3. [workspace-pane-tab-bar.tsx](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/tabs/workspace-pane-tab-bar.tsx#L220)

### E. Repeated tree inspection and tab lookup work in reducer/helpers

The pane layout helpers and reducer repeatedly traverse the recursive layout and tab ownership structures. This is not the primary cause of visible tab-switch latency, but it contributes avoidable work and should be tightened once the render path is under control.

References:
1. [workspace-pane-layout.ts](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/lib/workspace-pane-layout.ts#L136)
2. [workspace-canvas-state.ts](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/state/workspace-canvas-state.ts#L196)
3. [workspace-canvas-reducer.ts](/Users/kyle/dev/lifecycle/apps/desktop-legacy-do-not-touch/src/features/workspaces/canvas/workspace-canvas-reducer.ts#L299)

## Performance Contract

The target behavior for this stream is:

1. Same-pane tab switches should feel instant and should not visibly stall input, paint, or scroll.
2. Switching the active tab in one pane must not re-render sibling pane bodies.
3. Hidden live tabs remain mounted, but hidden surfaces must not do meaningful React work unless their own data changes.
4. Pane header updates must be proportional to the tabs whose visible metadata actually changed.
5. Dragging a tab should not cause layout thrash or full-tree React churn on every pointer move.
6. The pane tree should expose measurement hooks that transcript rendering can reuse later.

## Measurement Protocol

Before implementation starts, add a small opt-in dev instrumentation layer for the pane tree.

### Representative scenarios

Measure all of these in a reproducible fixture workspace:

1. One pane, five tabs: `agent`, `file-editor`, `preview`, `file-editor`, `agent`
2. Two panes, three tabs each, switching only inside the active pane
3. Four panes with mixed agents/files/previews
4. Same-pane switching while one hidden agent tab is actively streaming
5. Tab drag reorder inside one pane
6. Tab drag split across panes

### Metrics to capture

1. `tab-switch:dispatch->paint`
2. `tab-switch:controller-derive`
3. `tab-switch:pane-tree-render`
4. `tab-switch:active-pane-content-render`
5. `tab-drag:pointermove->preview`
6. React render counts for `WorkspacePaneTree`, `WorkspacePaneLeaf`, `WorkspacePaneTabBar`, `WorkspacePaneContent`, `AgentSurface`, `FileEditorSurface`, and `PreviewSurface`

### Initial target gates

1. Same-pane tab switch: under 16ms median and under 50ms p95 in the representative fixture on a warm desktop session
2. Switching one pane tab: zero sibling `WorkspacePaneContent` renders
3. Switching one pane tab: zero hidden `AgentSurface` or `FileEditorSurface` renders unless their own subscribed data changed
4. Tab drag pointer path: no layout reads beyond the active drag geometry cache refresh cadence we explicitly choose

If the first baseline shows these targets are unrealistic or too loose, update this plan with measured numbers before broad code changes continue.

## Execution Status

| Milestone | Status | Outcome |
| --- | --- | --- |
| P0 | planned | Reproducible instrumentation and baseline traces exist |
| P1 | planned | Controller and tab-bar identity churn is removed |
| P2 | planned | Hidden surface re-render isolation is in place |
| P3 | planned | Drag/drop pointer path stops thrashing layout and React state |
| P4 | planned | Regression harness and perf gates are part of normal verification |
| P5 | planned | Transcript rendering optimization starts on top of the new pane-tree instrumentation |

## P0. Instrumentation and Baseline

**Outcome**

We can measure pane-tree latency precisely and compare before/after changes on the same scenarios.

**Tasks**

- [ ] Add user-timing marks around tab selection dispatch, controller derivation, pane-tree render completion, and first post-switch paint.
- [x] Add an opt-in dev render counter helper for the pane tree and mounted surface components.
- [ ] Build a deterministic test fixture or debug route that opens a representative mix of panes and tabs without manual setup.
- [ ] Capture baseline traces for all representative scenarios and record them in this plan or a linked dated learning.
- [ ] Add one targeted automated test that asserts sibling panes do not re-render on same-pane tab switches once the instrumentation exists.

**Exit gate**

- We have baseline timings and render counts for same-pane tab switching and tab dragging.

## P1. Controller fan-out and header identity cleanup

**Outcome**

Tab switches update only the data needed for the affected pane header and active surface.

**Tasks**

- [ ] Stop rebuilding full `tabs` arrays and `tabsByKey` objects when normalization does not materially change a tab.
- [ ] Replace tab `leading` React-node equality with stable semantic presentation data, or precompute/cache the rendered icon so memo equality becomes meaningful.
- [ ] Split controller derivation into pane-local selectors so the active pane can update without regenerating unrelated pane models.
- [ ] Avoid rebuilding `tabSurfaces` for unchanged panes.
- [ ] Remove avoidable `Object.fromEntries(...)` / `map(...)` churn on the hot selection path.

**Exit gate**

- Same-pane tab switches only change the active pane model and the active tab metadata that actually changed.

## P2. Hidden surface isolation

**Outcome**

Hidden surfaces stay mounted for continuity but do not meaningfully re-render during unrelated tab switches.

**Tasks**

- [ ] Introduce a stable mounted-surface wrapper that memoizes per-surface props and isolates inactive surfaces from parent re-renders.
- [x] Introduce a stable mounted-surface wrapper that memoizes per-surface props and isolates inactive surfaces from parent re-renders.
- [x] Memoize or otherwise isolate `AgentSurface`, `FileEditorSurface`, and `PreviewSurface` at the mounted-surface boundary.
- [x] Stop recreating pane-content render context objects unless one of their semantic fields changes.
- [ ] Separate visibility toggling from content re-rendering so an active-tab flip can update container visibility without reconstructing every child subtree.
- [ ] Verify that hidden live tabs still preserve DOM continuity, scroll position, and session attachment.

**Exit gate**

- Same-pane tab switches do not re-render hidden surface bodies in the representative scenarios.

## P3. Drag and layout path hardening

**Outcome**

Tab dragging stays smooth under multi-pane load and does not regress general pane-tree responsiveness.

**Tasks**

- [ ] Cache pane/tab geometry at drag start and refresh it only when layout actually changes, not on every pointer move.
- [ ] Move transient drag-preview state away from full-tree React invalidation where possible.
- [ ] Review `ResizeObserver` and split-resize behavior for unnecessary updates during tab interactions.
- [ ] Avoid repeated DOM queries for tab-bar descendants during active drag.
- [ ] Add a drag-specific trace for pointer-move cost and preview latency.

**Exit gate**

- Drag reorder and drag split interactions stay smooth without layout thrash in the representative scenarios.

## P4. Regression harness and verification

**Outcome**

Pane-tree performance is protected by automated checks and documented verification steps.

**Tasks**

- [ ] Add focused tests for pane-local render locality and mounted-surface continuity.
- [ ] Add a perf-smoke script or dev harness instructions so regressions can be checked before merging.
- [ ] Run `bun run qa` plus the new pane-tree perf verification path for each implementation slice.
- [ ] Record final before/after numbers in this plan once the first pass lands.

**Exit gate**

- Pane-tree work has reproducible before/after evidence and automated regression coverage.

## P5. Follow-on: transcript rendering

This stream intentionally stops after the pane tree is fast and instrumented.

Follow-on work should start from the same measurement primitives and focus on:

1. transcript list virtualization or windowing where needed
2. message-part render isolation
3. streaming update coalescing
4. markdown/diff/render hotspot profiling inside `AgentSurface`

The transcript pass should become its own plan or be appended here only after P0 through P2 are complete.
