# File Surface Mode Split

## Context

The workspace surface already had a file document contract keyed by `file:<path>`, but editable text/code work raised a UI boundary question: should editing create a second tab kind, or should it stay inside the same file surface alongside richer viewers like markdown and Pencil?

## Learning

1. File editing should stay inside the existing `file:<path>` document identity. A separate `file-editor` tab kind would duplicate persistence, routing, and reopen semantics for the same workspace file.
2. `view` mode only makes sense for file types with a materially richer renderer than raw source:
   - markdown uses rendered preview in `view`
   - Pencil `.pen` files use structured preview in `view`
   - ordinary text/code files should default directly to `edit`
3. A scoped file-tree rail belongs inside the file surface, not in the workspace sidebar. This keeps Git/environment ownership in the sidebar while giving file tabs local navigation.
4. File reads, writes, and tree listing should still go through the workspace/provider boundary even in local mode. React should not walk or mutate the worktree directly.
5. Dirty draft state must be owned above the mounted editor pane. If draft state lives only inside the editor component, tab switches will silently drop unsaved work and tab-close interception cannot reason about dirty state.
6. Save hotkeys and conflict handling are part of the file-surface contract, not optional polish:
   - `Cmd/Ctrl + S` should save from the active file surface even when the editor has focus
   - closing a dirty file tab must confirm discard
   - disk changes that race with an unsaved draft should surface an explicit conflict state instead of silently reconciling
7. Once the file surface grows beyond a thin renderer shell, it should move out of `features/workspaces` into its own `features/files` boundary. The workspace surface should host document tabs, not absorb file-tree, editor, preview, and save/conflict product logic directly.
8. Renderer selection should be registry-driven, not `switch`-driven inside the file surface. Adding a renderer should mostly mean defining renderer metadata plus an optional view component, then registering it in one place.
9. Renderer and editor behavior should share one contract. Specialized file types may provide preview components, edit notices, and editor-configuration overrides from the same registry so the surface does not have to keep parallel heuristics in sync.
10. Custom per-file-type editor components should wait until there is a real file type that cannot be served by shared CodeMirror plus editor configuration. Adding that abstraction early would widen save, focus, and conflict contracts without a concrete user.

## Milestone Impact

1. M3: confirms that future editable workspace documents can evolve inside the shared center-surface model without reopening terminal/runtime ownership questions.
2. M6: preserves a provider-authoritative file contract that can later back cloud-hosted file reads and writes.

## Follow-Up Actions

1. Add save hotkeys, dirty-close affordances, and conflict handling for file edits.
2. Keep file renderer registration centralized in the shared registry as new specialized file types are added.
3. Evaluate split preview/edit mode for markdown once the base editor flow is stable.
4. Consider a small document-surface registry so future document features can mount into the workspace host without adding more inline branching to `workspace-surface-panels.tsx`.
5. Add custom `EditorComponent` support only when the first concrete visual file editor exists and can prove the abstraction.
