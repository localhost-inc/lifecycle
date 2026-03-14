# Project Tabs, Workspace Panes - 2026-03-14

## Context

The shell direction clarified into a three-layer model:

1. project / organization shell
2. project-scoped top-level content tabs
3. split-only workspace workbench inside a workspace tab

The important question was not just "project-first or workspace-first." It was whether the workspace should keep acting like a second tab system after the shell itself gains durable top-level tabs.

## Learning

1. Top-level project tabs and workspace-local pane tabs create an unnecessary "tabs inside tabs" mental model when the outer shell already owns durable destinations.
2. The cleaner model is:
   - project tabs for durable shared artifacts such as inbox, memory, plans, pull requests, and project activity
   - split-only panes for live workspace execution and local state
   - a compact pane header strip for local identity and actions, but no pane-local tab groups
   - whole-pane rearrangement remains valid; what goes away is pane-local tab transfer semantics
3. Scope should follow the access point and authority boundary, not the visual size of a surface.
4. Shared renderers can still be reused across both levels. A full-canvas patch viewer does not force one navigation layer.
5. A workspace is best treated as one kind of top-level content tab rather than the app's primary shell mode.

## Why It Matters

1. The shell becomes easier to understand: one tab strip at the project level, panes inside a workspace.
2. Shared project artifacts stop being awkwardly forced through workspace-local UI.
3. Workspace interactions can optimize for one to three simultaneous panes instead of becoming a second general-purpose tab manager.

## Milestone Impact

1. M7 shell and org/project work should treat project tabs as the durable navigation layer.
2. Future workspace-surface cleanup should simplify toward split-only panes rather than preserving pane-local tab groups.

## Follow-Up Actions

1. Keep `app-shell-v2.md` explicit that a workspace tab hosts a split-only workbench.
2. Use "same renderer, different access point" as the rule for diff, PR, and other shared surfaces.
3. When the migration begins, split implementation work into:
   - top-level shell / project tab architecture
   - workspace surface simplification to single-content panes
