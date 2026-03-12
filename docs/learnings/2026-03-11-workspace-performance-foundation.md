# Workspace Performance Foundation

## Context

The desktop workspace route was paying for too much work on first open:

1. multiple independent Tauri reads for the same workspace shell
2. eager polling for git history and pull-request data even when those surfaces were closed
3. heavy workspace documents keeping sibling panels mounted just to preserve local UI state
4. diff and markdown renderer code sitting on the hot path for the broader workspace shell

## Learning

1. The workspace shell needs one cheap read-model query for boot, then event-driven patching for steady state.
2. Polling is only justified for surfaces that are both visible and semantically active; the rest should stay dormant.
3. Active-panel-only mounting is a large win as long as essential tab view state is persisted outside the panel component.
4. It is more valuable to lazy-load renderer-heavy bodies than to over-lazy-load shell chrome.
5. Frontend and local-runtime performance work need a shared measurement story; otherwise bundle, render, and lifecycle latency regressions are hard to compare.

## Milestone Impact

1. M4: makes the local workspace shell cheaper to enter and cheaper to keep open while environment controls continue to expand.
2. M5: gives the future CLI and observability work a clearer snapshot/read-model boundary instead of growing more ad hoc query surfaces.
3. M6: keeps cloud/provider-backed workspace shells aligned with the same event-driven and visibility-gated query model.

## Follow-Up Actions

1. Expand the snapshot/read-model approach if other workspace routes still fan out into repeated Tauri reads.
2. Revisit remaining eager renderer imports if production bundle analysis still shows large workspace-shell chunks.
3. Add regression checks around route-ready timing and lifecycle phase timings once the diagnostics output stabilizes.

