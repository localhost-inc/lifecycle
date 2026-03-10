# Workspace Git Action State Machine - 2026-03-10

## What Changed

1. The Git action button no longer derives its behavior from a pull-request-specific helper.
2. Workspace Git actions now use an explicit derived state machine that combines:
   - working tree/index state
   - upstream sync state
   - current-branch pull request state
   - loading/support availability
3. The machine now models blocked sync states that the earlier helper skipped:
   - branch behind upstream
   - branch diverged from upstream
4. Commit flows now only offer `Commit & Push` when a push is actually valid after the commit.

## Why It Matters

1. The previous helper could surface misleading actions like `Commit & Push`, `Create PR`, or `Merge PR` while the branch was behind or diverged from its upstream.
2. Modeling Git actions as a workspace-scoped machine makes the split button reusable for future action surfaces without re-encoding the same precedence rules in multiple components.
3. This keeps the product model aligned with actual Git constraints: local composition first, remote sync second, PR actions last.

## Milestone Impact

1. M4: strengthens workspace-side operational modeling by treating Git actions as an explicit product state contract instead of ad hoc UI branching.
2. M5: gives future local CLI Git action/status surfaces one coherent precedence model to reuse.
3. M6: keeps PR actions grounded in the same provider-agnostic Git status contract that cloud mode will eventually implement.

## Follow-Up Actions

1. Reuse this machine in any future CLI or command-palette Git action surface instead of adding new bespoke branching logic.
2. Add explicit provider-backed sync actions later only if Lifecycle is going to own pull/rebase/reconcile flows rather than delegating them to terminals.
