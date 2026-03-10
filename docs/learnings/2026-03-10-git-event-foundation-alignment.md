# Git Event Foundation Alignment

## What Changed

1. Local provider-owned git mutations now emit canonical lifecycle facts:
   - `git.status_changed`
   - `git.head_changed`
   - `git.log_changed`
2. Desktop git queries now subscribe to those facts so stage, unstage, commit, and push invalidations flow through the shared query/event layer instead of relying only on local refresh calls.

## Why It Matters

1. Git workflows were the main desktop mutation path still bypassing the event foundation while workspace, service, and terminal flows already used it.
2. Wiring git into the same fact model keeps the local provider contract aligned with [docs/reference/events.md](../reference/events.md) and [docs/reference/workspace-provider.md](../reference/workspace-provider.md).
3. This keeps desktop behavior closer to the future cloud provider model, where repo mutations also need transport-independent fact publication.

## Boundary Clarified

1. Provider-owned git mutations should publish canonical git facts immediately after the mutation commits.
2. Polling still has a separate role for out-of-band repository changes, such as git commands run inside terminals, because those changes do not currently pass through provider-owned mutation commands.

## Milestone Impact

1. Strengthens the shared event/query infrastructure required by the plan-wide event foundation work.
2. Reduces special-case UI refresh logic around M6 git workflows without requiring a separate git-specific event transport.

## Follow-Up Actions

1. Add repository observation for terminal-driven or external git changes so the desktop app can publish or derive the same git facts without depending on polling.
2. Revisit redundant manual refresh paths once provider-owned git facts cover all intended desktop mutation flows.
