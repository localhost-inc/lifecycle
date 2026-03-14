## Learning

Provider adoption should follow workspace authority, not raw transport convenience.

The useful split is:

1. Workspace-scoped lifecycle reads and mutations that depend on the authoritative execution context belong on `WorkspaceProvider`.
2. Aggregate control-plane reads such as project-to-workspace listings can stay outside the provider as long as they operate on normalized domain records.
3. Desktop-only presentation and host-shell integrations such as native terminal surface sync or "open in app" should remain outside the provider boundary.

## Milestone Impact

M4 Phase 5 needed more than swapping a few mutation calls from `invokeTauri(...)` to `WorkspaceProvider`. The boundary only became coherent once workspace snapshot/runtime projection reads, manifest sync, rename, service configuration updates, terminal list/get/create/rename/attachment persistence, workspace file access, and git reads/writes all moved onto the provider as well. The remaining Tauri callers are now explicit non-provider modules for catalog/control-plane reads, host app launch, project branch lookup, and native terminal surface presentation.

## Follow-Up

1. Keep the remaining direct desktop calls constrained to aggregate control-plane queries and presentation-only helpers.
2. Add cloud implementations for the newly adopted provider reads and terminal metadata methods before M6 desktop/cloud mixed-mode work expands.
3. Continue Phase 6 by extracting a dedicated `WorkspaceSurface` controller module now that provider authority is no longer mixed into the main runtime API modules.
