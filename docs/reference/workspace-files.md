# Workspace Files Contract

The files feature owns workspace-backed file tabs inside the shared workspace surface. It is responsible for file rendering, editing, draft/conflict behavior, and scoped file navigation, while `features/workspaces` remains the document-tab host.

## Ownership

1. File tabs are document tabs, not runtime tabs.
2. File tab identity is keyed by normalized repo-relative path as `file:<path>`.
3. `features/workspaces` owns tab orchestration, persistence, active-tab routing, and dirty-close interception.
4. `features/files` owns file-specific UI and behavior:
   - renderer selection
   - editor configuration
   - preview/edit mode behavior
   - scoped file tree
   - draft/conflict handling inside the active file surface
5. File reads, writes, and file-tree listing must go through the workspace/provider boundary rather than direct React-side filesystem access.

## Surface Model

1. A file stays on one tab identity even when its presentation changes.
2. File tabs do not split into separate viewer/editor document kinds.
3. Per-tab presentation may switch between:
   - `view` for richer file-type-specific presentation
   - `edit` for source editing
4. Ordinary text/code files default directly to `edit`.
5. Only file types with a materially better preview should expose `view`.

## Renderer Registry

1. File-type behavior should be registered through a shared renderer registry.
2. Adding a new file type should mostly mean:
   - define renderer metadata
   - optionally provide a preview component
   - register it in one place
3. The registry should own file-type-specific behavior needed by both preview and edit paths:
   - renderer label
   - whether `view` mode exists
   - preview component
   - preview loading label
   - edit notices
   - editor configuration overrides
4. `file-surface` should consume the registry contract rather than branching inline on file extensions.

## Editor Contract

1. The default edit surface is the shared CodeMirror editor.
2. File types may influence the shared editor through configuration, not by reimplementing editor behavior ad hoc.
3. Supported editor overrides include:
   - language mode
   - line wrapping
   - edit-specific notices
4. Preview and edit behavior for a file type should come from the same renderer definition so they cannot drift independently.

## Session Behavior

1. Draft state must survive tab switches while the file tab remains open.
2. Save shortcuts belong to the active file surface and should work while the editor holds focus.
3. Closing a dirty file tab must confirm discard.
4. If the on-disk file changes while a dirty draft exists, the file surface must enter an explicit conflict state.
5. Reload/revert behavior should be explicit and should not silently overwrite either draft or newer disk state.

## File Tree

1. The file surface may own a scoped file-tree rail for navigating other workspace files.
2. That file tree is local to the file feature and does not replace the workspace sidebar.
3. The workspace sidebar continues to own broader workspace concerns such as Git, environment, and workspace lifecycle.

## Unsupported Files

1. Unsupported binary files should render an explicit fallback state.
2. Oversized files should render an explicit fallback state.
3. Opening unsupported files may still create a file tab so the user has a clear recovery path such as opening externally.

## Future Custom Editors

1. Do not add per-renderer `EditorComponent` support speculatively.
2. The shared CodeMirror path should remain the default until a concrete file type genuinely needs a custom editing UI.
3. Examples that could justify a future custom editor:
   - a real visual `.pen` editor
   - a markdown split preview/source editor that cannot be expressed as shared editor config
   - image or PDF annotation flows
4. If custom editor support is added later, it should plug into the existing file-surface shell so tab identity, save behavior, conflict handling, and provider boundaries remain unchanged.
