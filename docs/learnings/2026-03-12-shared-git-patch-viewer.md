# Shared Git Patch Viewer

## Learning

1. The remembered split versus unified diff preference belongs in a shared patch-viewer component, not in each surface that happens to render a patch.
2. `GitDiffSurface` and `PullRequestSurface` should own their fetch and header state, while a shared viewer owns diff rendering, empty and error states, and persisted viewer preferences.
3. Parsing patch metadata is also a reusable concern, so a small shared hook keeps cache-key handling consistent across diff surfaces.

## Why It Matters

1. Persisted diff-view state now has a single storage boundary instead of being duplicated across multiple surfaces.
2. Regression coverage can assert the remembered viewer mode once at the component that owns it, which reduces test duplication and makes future diff-surface changes safer.

## Milestone Impact

1. M7 Git and pull request surfaces now share a cleaner diff-rendering contract, which makes future review-surface work less error-prone.

## Follow-Up Actions

1. Reuse the shared patch-viewer boundary for any additional desktop diff surfaces instead of introducing per-surface persistence again.
2. Keep surface-specific metadata and provider fetch logic outside the shared viewer so the rendering boundary stays narrow.
