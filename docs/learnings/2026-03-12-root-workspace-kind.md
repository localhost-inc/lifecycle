# Root Workspace Kind

Date: 2026-03-12

## Summary

Projects need an immediate "open the repo and work" path. Requiring a managed branch/worktree before any work starts adds ceremony in the common case and makes a freshly added project feel unusable.

## Decision

We split local workspaces into explicit kinds:

- `root`
  - backed directly by `project.path`
  - represents the repo exactly as it currently exists on disk
- `managed`
  - backed by a Lifecycle-created derived git worktree
  - Lifecycle owns the derived branch/worktree naming and cleanup behavior

`workspace.kind` is the stored contract. It is not modeled as an `is_root` boolean.

## Why

- The first action after adding a project is usually "start working in this repo," not "fork a managed worktree."
- `kind` expresses a real domain split; `is_root` would hide that difference behind special-case branching.
- `root` and `managed` have different rename, destroy, and selection semantics, so the contract needs an explicit variant.
- Calling the non-root variant `managed` keeps the contract product-oriented instead of binding it to a specific local Git implementation detail.

## Implementation Notes

- Local root workspaces store `workspace.worktree_path = project.path`.
- Root workspaces keep their `source_ref` fixed to the repo branch selected at creation time and do not participate in generated workspace identity hydration.
- Root workspace rename changes only the user-facing workspace name; it does not rename the repo branch or move the repo path.
- Destroying a root workspace removes Lifecycle metadata only; it does not remove the underlying repo checkout.
- Query selection prefers the root workspace when choosing a project's default workspace.

## Milestone Impact

- M3: a newly added project can open directly into a launcher-backed root workspace, while managed workspaces remain available as the isolation path for branch/worktree flows.

## Follow-Up

- Reconcile root workspace `source_ref` when the user changes branches directly in the repo outside Lifecycle.
- Add clearer desktop affordances so root workspaces are visibly distinct from managed workspaces before destructive actions.
