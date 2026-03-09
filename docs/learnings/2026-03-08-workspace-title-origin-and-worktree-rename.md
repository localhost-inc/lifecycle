# Workspace Title Origin And Worktree Rename

## Context

Inline workspace and terminal rename now share the same native desktop path as the harness auto-title flow. The first submitted harness prompt can promote default labels into generated titles, but a manual rename must remain authoritative after that point.

## Learning

1. Title generation needs an explicit origin flag.
   - `default`, `generated`, and `manual` origins let the runtime accept a generated title once while preventing later agent prompts from stomping a user rename.
2. Submit and completion are different harness facts.
   - `terminal.harness_prompt_submitted` is the right first-prompt boundary for immediate title generation; `terminal.harness_turn_completed` remains a separate response-complete fact.
   - Until prompt submission is emitted as a first-class kernel fact, native auto-title can recover the first prompt from the authoritative session log when the first completion fact arrives.
3. Workspace rename cannot be treated as a display-only mutation.
   - The underlying git worktree directory must move with the visible workspace name so filesystem state, SQLite metadata, and the UI stay aligned.
4. Existing terminal sessions need their launch worktree path preserved.
   - Harness session discovery and completion watchers may still need the original launch path string after a workspace rename, even when the live workspace record now points at the moved worktree.

## Milestone Impact

1. M3 now includes inline workspace/session naming and first-prompt auto-titles as part of the terminal surface contract.
2. M3 title generation should key off prompt submission rather than response completion when immediate visual feedback is required, but a completion-triggered session-log fallback is acceptable until that event exists.
3. M4 lifecycle work should treat worktree rename as ordinary local metadata maintenance, not a special destructive flow.

## Follow-Up Actions

1. Add a focused integration test around renaming a workspace while an attached harness session is still active.
2. Add a focused integration test that verifies the first submitted harness prompt emits prompt-boundary title updates before response completion.
3. Revisit whether the selected workspace title in the top bar should also enter inline edit mode, or remain a read-only mirror of the sidebar rename control.
