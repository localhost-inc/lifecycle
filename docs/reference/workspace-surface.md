# Workspace Surface Contract

The workspace center panel is a shared surface that can host both provider-backed runtime tabs and client-owned document tabs.

## Tab Classes

1. Runtime tabs:
   - backed by a provider/runtime entity
   - examples: `terminal` now, agent session later
   - identity is provider-owned (`terminal_id`, future `agent_session_id`)
2. Document tabs:
   - backed by workspace content or derived workspace artifacts
   - examples: launcher, git diff, pull request, file editor, preview-specific documents
   - identity is client-owned and derived from document intent (`diff:changes`, `diff:commit:<sha>`, `pull-request:<number>`, future `file:path`)

## Ownership Rules

1. Runtime lifecycle remains provider-authoritative even when the React tree controls selection state.
2. Document tabs are desktop-owned UI state and should not require provider persistence in V1.
3. Desktop-owned tab state may be restored locally across app restarts, but that restore must stay separate from provider/runtime authority.
4. Desktop-owned surface layout includes `activePaneId`, the persisted split tree, per-pane mixed-tab ordering (`pane.tabOrderKeys`), and hidden-runtime presentation (`hiddenRuntimeTabKeys`).
5. Side-panel actions may request opening a document tab, but they do not own tab state.
6. Mixed tab bars must render from normalized tab records rather than terminal-specific component state.
7. Route/search state may mirror the currently focused workspace view (for example the active Git rail tab or pull request number) so hot reload can restore the same surface, but that URL state must stay identifier-only rather than replacing local document snapshots.

## Pane Tree Model

1. The workspace surface is a tree of split nodes and leaf panes, not a single global tab strip.
2. Leaf panes own `activeTabKey` plus ordered `tabOrderKeys`; split nodes own `direction` (`row|column`) plus `ratio`.
3. `activePaneId` is the keyboard and launch target when an action does not name a destination pane explicitly.
4. Tabs belong to exactly one pane at a time. Reopening an existing document or runtime should select the owning pane instead of cloning the tab into a second pane.
5. Splitting a pane creates a sibling leaf pane and should seed that new pane with a launcher so the user has an immediate destination for the new surface.
6. Closing a pane removes that leaf from the tree and merges its tab order into the surviving sibling pane instead of silently discarding tabs.
7. Panes are separate tab groups. Moving a tab into another pane should transfer ownership to that pane rather than mirroring the tab across both panes.
8. Dragging a tab into a pane that currently only shows a launcher placeholder should replace that placeholder with the moved tab.
9. Dragging a tab onto an existing tab strip may position it before or after the hovered target tab inside that destination pane.
10. Dragging a tab to the left, right, top, or bottom edge of a pane should create a new split pane on that side, following the editor-group model rather than opening a mirrored view.
11. Local restore should persist the split tree, split ratios, and per-pane selection state. Legacy flat snapshots (`activeTabKey` + `tabOrderKeys`) should migrate into a single root leaf on read.

## Runtime Mount Semantics

1. Runtime tabs may require a live attachment or native host surface.
2. Inactive runtime tabs must remain mounted when their host contract depends on attachment continuity or native surface synchronization.
3. Switching tabs should hide or detach runtime presentation without implicitly destroying the runtime resource.
4. Closing a runtime tab from the strip should detach or hide it, not kill the runtime.
5. Document tabs may mount on demand because they are render-only views over workspace data.
6. Runtime tab semantics must stay mode-agnostic: a cloud terminal may attach through a provider bridge while a local terminal talks directly to the host runtime, but both remain the same runtime-tab class in the workspace surface.
7. A runtime tab may remain visible inside a non-focused pane, but only the focused pane's active runtime surface should receive native focus or pointer ownership.

## Launcher Tabs

1. The launcher is a workspace-owned tab, not a provider-backed runtime.
2. `Cmd/Ctrl + T` should open a launcher tab.
3. A newly opened workspace should default to a launcher tab when no visible tab state exists yet.
4. Opening a launcher without an explicit destination should place it in the active pane.
5. Launcher tabs may create new runtime tabs or reopen prior sessions, but they do not own runtime lifecycle.
6. Launcher tabs may surface recent sessions and a workspace-scoped lifecycle activity feed sourced from normalized events.

## Git Diff Documents

1. Git diffs are document tabs, not runtime tabs.
2. Current local edits use a single workspace-scoped `Changes` tab with a fixed key; repeated clicks update that tab's `focusPath` instead of opening file-scoped diff tabs.
3. History commit diffs use commit-scoped document tabs keyed by commit SHA.
4. Full patch rendering belongs in the center panel; list summaries belong in the side panel.
5. The side panel should stay lightweight: summaries and diff navigation belong there; commit composition and staging workflows do not.

## Pull Request Documents

1. Pull requests are document tabs, not runtime tabs.
2. Git-panel PR actions may request opening a PR tab, but the workspace surface owns the resulting tab lifecycle.
3. PR tabs are keyed by pull request number within a workspace and should reuse the existing tab when the same PR is reopened.
4. Persisted PR tabs may store a last-known snapshot so the surface can render even when live provider detail is temporarily unavailable.
5. Router-backed PR focus should carry only the PR number needed to reopen the surface; the rendered snapshot and tab ordering remain desktop-owned state.

## File Viewer Documents

1. File viewers are document tabs, not runtime tabs.
2. File-viewer tabs are keyed by normalized repo-relative path (`file:<path>`) and should reuse the existing tab when the same file is reopened.
3. The detailed file-surface contract lives in [workspace-files.md](./workspace-files.md).
4. File content reads must go through the workspace/provider authority boundary rather than direct React-side filesystem access.
5. Renderer selection is desktop-owned presentation state derived from the file path or payload:
   - `.md` uses the markdown renderer
   - `.pen` uses a Pencil-aware structured renderer
   - all other supported text files fall back to plain text
   - renderer registration should live in a shared file-renderer registry so new file types do not require growing `file-surface.tsx` with more inline branching
   - the same registry may provide editor-specific overrides such as language mode, line wrapping, or edit notices so preview and edit behavior stay aligned for a file type
6. File tabs do not fork into separate viewer/editor document kinds. The `file:<path>` tab remains the single workspace document identity, while per-tab presentation state may switch between `view` and `edit`.
7. `view` mode exists only for file types with a meaningfully richer renderer than raw text:
   - `.md` may switch between rendered markdown and source editing
   - `.pen` may switch between structured Pencil preview and raw JSON editing
   - ordinary text/code files default to `edit` only
8. Editable file surfaces must preserve unsaved draft state while the tab remains open, even when the tab is not currently focused.
9. Save shortcuts belong to the active file surface and should work while the editor holds focus (`Cmd/Ctrl + S`).
10. Closing a dirty file tab must prompt for discard instead of silently dropping the draft.
11. If the on-disk file changes while a dirty draft exists, the surface should enter an explicit conflict state rather than silently overwriting either version.
12. File surfaces may own a scoped file-tree rail for navigating other workspace files, but that rail is local presentation state within the active file tab and does not replace the workspace sidebar.
13. Unsupported binary files or oversized files may still open as tabs, but the surface should show an explicit fallback state rather than silently failing.
14. Git-side file open affordances from the Changes tab, diff surfaces, and PR surfaces should request file-viewer documents instead of handing files off to the OS.
15. `features/workspaces` owns tab orchestration only. File-specific renderer selection, draft/conflict state, file-tree UI, and editor behavior should live in a dedicated file feature so the workspace surface stays a host rather than an ever-growing file implementation.

## Forward Compatibility

1. File editor tabs should reuse the same document-tab path as diff tabs.
2. Future agent/workspace-native sessions should plug into the runtime-tab path rather than replacing the tab model again.
3. The surface contract must work for both `workspace.mode=local` and `workspace.mode=cloud`; only the provider-backed runtime/document data source changes.
4. On desktop platforms with a native terminal host, cloud terminals should reuse the same native-host lane as local terminals; provider attach transport should change underneath that surface rather than reintroducing a browser terminal worldview.
