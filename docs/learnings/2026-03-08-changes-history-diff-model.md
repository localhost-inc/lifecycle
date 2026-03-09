# Changes + History Diff Model - 2026-03-08

## Context

The workspace git UX previously exposed file-scoped diff tabs plus viewer-local scope switching (`working`, `staged`, `branch`). That made persistence, reopen behavior, and the mental model more complex than the product actually needed.

## Learning

The simpler durable model is:

1. The primary viewer should answer only two questions: what is changing now, and what changed in this commit.
2. Current local edits work better as one reusable workspace-scoped `Changes` tab with an optional `focusPath`, not as separate tabs per file or per diff scope.
3. Commit review still benefits from dedicated commit-scoped tabs because users often compare or revisit multiple history entries over time.
4. A single diff surface component can serve both modes if the source contract is explicit (`changes` vs `commit`) and the shared multi-file layout accepts an initial focus path.
5. The staged/unstaged split belongs in the side panel for actions, not in the center diff viewer as separate rendering modes.

## Milestone Impact

1. M5: workspace git observability becomes easier to persist, reopen, and reason about without losing multi-file diff performance.
2. M5: staged/unstaged actions remain available without making the main viewer juggle multiple current-change patch scopes.
3. M6: cloud git history and current-change viewing can reuse the same center-panel model without reintroducing file-scoped document tabs.

## Follow-Up Actions

1. Keep branch comparison out of the primary Changes viewer until there is a clear product home for it.
2. Reuse the same unified diff surface for future provider-backed git history sources instead of growing mode-specific viewer components again.
3. If users later need explicit branch-comparison workflows, model them as their own document intent rather than overloading the Changes tab.
