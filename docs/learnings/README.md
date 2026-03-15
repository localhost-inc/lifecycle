# Learnings Log

This directory captures implementation learnings, architectural decisions, and milestone orientation notes.

## Why this exists

- Preserve project context between sessions.
- Track decisions that should affect future triage and implementation.
- Avoid repeating dead-end explorations.

## Entry format

- Filename: `YYYY-MM-DD-short-title.md`
- Include:
  - `Context`
  - `Observation`
  - `Decision`
  - `Impact on milestones`
  - `Follow-up actions`

## How to read this directory

1. Treat the directory listing itself as the authoritative index. This README points to useful starting points, not every file.
2. Start with [docs/plan.md](../plan.md) and the active milestone doc, then read the newest learnings in the area you are changing.
3. Prefer recent files over older ones when two notes overlap; older notes often capture superseded intermediate states.

## Suggested starting points

1. Shell and workspace model:
   - [2026-03-14-shell-canvas-doc-split.md](./2026-03-14-shell-canvas-doc-split.md)
   - [2026-03-14-project-shell-surface-layering.md](./2026-03-14-project-shell-surface-layering.md)
   - [2026-03-14-workspace-page-header-boundary.md](./2026-03-14-workspace-page-header-boundary.md)
   - [2026-03-14-workspace-extension-strip-ownership.md](./2026-03-14-workspace-extension-strip-ownership.md)
2. Workspace interior and pane model:
   - [2026-03-12-workspace-surface-pane-tree.md](./2026-03-12-workspace-surface-pane-tree.md)
   - [2026-03-13-workspace-pane-layout-contract.md](./2026-03-13-workspace-pane-layout-contract.md)
   - [2026-03-13-workspace-surface-controller-boundary.md](./2026-03-13-workspace-surface-controller-boundary.md)
   - [2026-03-13-workspace-surface-module-boundaries.md](./2026-03-13-workspace-surface-module-boundaries.md)
   - [2026-03-14-canvas-surface-taxonomy.md](./2026-03-14-canvas-surface-taxonomy.md)
3. Environment and runtime boundaries:
   - [2026-03-09-workspace-environment-lifecycle-split.md](./2026-03-09-workspace-environment-lifecycle-split.md)
   - [2026-03-10-workspace-environment-graph-target.md](./2026-03-10-workspace-environment-graph-target.md)
   - [2026-03-12-separate-workspace-setup-from-environment-tasks.md](./2026-03-12-separate-workspace-setup-from-environment-tasks.md)
4. Native terminal and attach model:
   - [2026-03-06-native-ghostty-terminal-panel.md](./2026-03-06-native-ghostty-terminal-panel.md)
   - [2026-03-12-cloud-terminal-attach-helper-boundary.md](./2026-03-12-cloud-terminal-attach-helper-boundary.md)
   - [2026-03-12-cloud-terminal-native-host-alignment.md](./2026-03-12-cloud-terminal-native-host-alignment.md)
