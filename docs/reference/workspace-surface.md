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
4. Visible mixed-tab ordering (`tabOrderKeys`) and hidden-runtime presentation (`hiddenRuntimeTabKeys`) are desktop-owned surface state.
5. Side-panel actions may request opening a document tab, but they do not own tab state.
6. Mixed tab bars must render from normalized tab records rather than terminal-specific component state.

## Runtime Mount Semantics

1. Runtime tabs may require a live attachment or native host surface.
2. Inactive runtime tabs must remain mounted when their host contract depends on attachment continuity or native surface synchronization.
3. Switching tabs should hide or detach runtime presentation without implicitly destroying the runtime resource.
4. Closing a runtime tab from the strip should detach or hide it, not kill the runtime.
5. Document tabs may mount on demand because they are render-only views over workspace data.

## Launcher Tabs

1. The launcher is a workspace-owned tab, not a provider-backed runtime.
2. `Cmd/Ctrl + T` should open a launcher tab.
3. A newly opened workspace should default to a launcher tab when no visible tab state exists yet.
4. Launcher tabs may create new runtime tabs or reopen prior sessions, but they do not own runtime lifecycle.
5. Launcher tabs may surface recent sessions and a workspace-scoped lifecycle activity feed sourced from normalized events.

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

## Forward Compatibility

1. File editor tabs should reuse the same document-tab path as diff tabs.
2. Future agent/workspace-native sessions should plug into the runtime-tab path rather than replacing the tab model again.
3. The surface contract must work for both `workspace.mode=local` and `workspace.mode=cloud`; only the provider-backed runtime/document data source changes.
