# Workspace Surface Local Restore Boundary - 2026-03-07

## Context

The workspace center panel now mixes provider-backed runtime tabs and desktop-owned document tabs. Users also expect the desktop shell to reopen into the same workspace surface they were using before the app closed.

## Learning

The restore boundary needs to stay explicit:

1. Last-workspace selection and document-tab state belong to the desktop shell and can be restored from local UI persistence.
2. Runtime-backed tab existence still belongs to the provider/runtime layer. Local tab restore must not pretend a dead PTY process survived app restart.
3. Native terminal tabs can survive app relaunch as persisted `terminal` metadata by reconciling stale rows to a restorable state (`sleeping`) and letting the native host recreate the surface on demand.
4. A restored active-tab key may point at a runtime tab, but the runtime list should still be re-derived from provider data each time the workspace surface mounts.
5. Persisting only the document-tab inputs (`focus_path` for the shared Changes tab, commit SHA for History tabs) avoids coupling desktop restore logic to render-only labels or future tab presentation changes.

## Milestone Impact

1. M3: app relaunch can restore workspace selection and document tabs without changing the local terminal non-goal around process survival across restart.
2. M6: CLI and desktop can continue to treat runtime state as provider-authoritative while each client owns its own view-state restore policy.
3. M7: cloud workspace surfaces can reuse the same desktop restore boundary without leaking cloud session state into local UI persistence.

## Follow-Up Actions

1. Keep startup reconciliation for runtime tabs separate from local UI state hydration.
2. Reuse the same local persistence path for future file-editor tabs instead of inventing another restore mechanism.
3. If users later need true cross-restart terminal/session continuity, add a daemon- or provider-backed runtime host rather than stretching desktop view-state persistence beyond its boundary.
