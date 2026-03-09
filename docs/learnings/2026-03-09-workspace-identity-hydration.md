# Workspace Identity Hydration

Date: 2026-03-09

## Summary

Workspace naming should split into two layers:

1. Workspace identity
   This covers the durable workspace name, worktree directory, and managed branch name.
2. Session presentation
   This covers per-terminal tab titles.

The correct trigger for workspace identity is the first real harness prompt. That is the earliest point where the system has task intent without forcing the user to pre-name the workspace.

## Decision

We implemented first-prompt workspace identity hydration as a dedicated backend flow instead of extending terminal auto-title logic:

- The first prompt attempts one structured generation call that returns both `workspace_title` and `session_title`.
- `workspace_title` hydrates workspace name, worktree path, and managed branch name once.
- `session_title` updates the triggering terminal tab.
- If generation fails, only the terminal falls back to a truncated prompt title.
- Workspace identity never falls back automatically. The placeholder identity remains until the user renames manually.

## Why

This avoids the previous conflation between UI titles and workspace identity:

- Terminal titles can stay lightweight and presentation-only.
- Workspace/worktree/branch naming now has an explicit one-shot lock.
- Manual rename can reuse the same mutation path.
- Branch renames stay safe because they only run for lifecycle-managed local branches without upstreams.

## Implementation Notes

- `workspace.worktree_path` is now the canonical runtime cwd source.
- Terminals no longer depend on a copied `launch_worktree_path` field during runtime behavior.
- `workspace.source_ref_origin` now tracks whether branch identity is still unlocked (`default`) or already locked by generated/manual identity.
- `workspace.renamed` events now carry `source_ref` so the frontend updates branch display immediately after rename.

## Milestone Impact

- M3: strengthens harness-driven workspace flows by letting the first prompt establish durable workspace identity without creating ongoing rename churn.

## Follow-Up

- Remove the leftover `terminal.launch_worktree_path` column entirely in a later schema cleanup.
- Extend the harness adapter layer for additional providers like `opencode` and `amp` so they can participate in the same first-prompt identity contract.
