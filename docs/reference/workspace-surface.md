# Workspace Surface Contract

The workspace center panel is a shared surface that can host both provider-backed runtime tabs and client-owned document tabs.

## Tab Classes

1. Runtime tabs:
   - backed by a provider/runtime entity
   - examples: `terminal` now, agent session later
   - identity is provider-owned (`terminal_id`, future `agent_session_id`)
2. Document tabs:
   - backed by workspace content or derived workspace artifacts
   - examples: git diff, file editor, preview-specific documents
   - identity is client-owned and derived from document content (`diff:path:scope`, future `file:path`)

## Ownership Rules

1. Runtime lifecycle remains provider-authoritative even when the React tree controls selection state.
2. Document tabs are desktop-owned UI state and should not require provider persistence in V1.
3. Desktop-owned tab state may be restored locally across app restarts, but that restore must stay separate from provider/runtime authority.
4. Side-panel actions may request opening a document tab, but they do not own tab state.
5. Mixed tab bars must render from normalized tab records rather than terminal-specific component state.

## Runtime Mount Semantics

1. Runtime tabs may require a live attachment or native host surface.
2. Inactive runtime tabs must remain mounted when their host contract depends on attachment continuity or native surface synchronization.
3. Switching tabs should hide or detach runtime presentation without implicitly destroying the runtime resource.
4. Document tabs may mount on demand because they are render-only views over workspace data.

## Git Diff Documents

1. Git diffs are document tabs, not runtime tabs.
2. A diff tab key should be stable per `{file_path, scope}` so re-opening focuses the existing tab instead of duplicating it.
3. Diff scope is explicit: `working` and `staged` are different documents even for the same file.
4. Full patch rendering belongs in the center panel; list summaries belong in the side panel.
5. The side panel should stay lightweight: summaries, status toggles, and diff navigation belong there; commit composition does not.

## Forward Compatibility

1. File editor tabs should reuse the same document-tab path as diff tabs.
2. Future agent/workspace-native sessions should plug into the runtime-tab path rather than replacing the tab model again.
3. The surface contract must work for both `workspace.mode=local` and `workspace.mode=cloud`; only the provider-backed runtime/document data source changes.
