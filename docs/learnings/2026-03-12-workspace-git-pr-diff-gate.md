# Workspace Git PR Diff Gate - 2026-03-12

## What Changed

1. Current-branch pull request context now carries `hasPullRequestChanges`, which reports whether `HEAD` has committed diff against the resolved base branch.
2. The workspace Git action state machine now blocks `Create PR` when the branch is clean/synced but has no branch diff to review.
3. Local PR creation now performs the same no-diff guard server-side before invoking `gh pr create`.

## Why It Matters

1. A clean working tree is not enough to justify a pull request action; PR eligibility depends on committed branch diff against base, not only local file edits.
2. Without this guard, the Git panel could advertise `Create PR` for branches that matched `main`/`trunk`, then fail only after the user clicked through.
3. Keeping the diff signal in the current-branch PR contract lets every UI surface reuse one decision instead of re-querying branch patches ad hoc.

## Milestone Impact

1. M6: tightens the local PR workflow so the workspace action rail only advertises PR creation when the branch actually has reviewable changes.
2. M6: aligns the desktop-side UX more closely with the milestone contract that PR creation should validate branch diff before creation.

## Follow-Up Actions

1. Reuse `hasPullRequestChanges` anywhere else the app surfaces branch-scoped PR actions instead of duplicating base-vs-head checks.
2. When the cloud PR provider lands, preserve the same contract semantics so local and cloud Git action surfaces stay consistent.
