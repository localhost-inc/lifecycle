# Lifecycle Root Should Be A Shared Path Contract

Date: 2026-03-10
Milestone: M3

## Context

The desktop code already had multiple Lifecycle-owned filesystem paths, but the root itself was not defined centrally. Worktrees defaulted to `~/.lifecycle/worktrees`, while terminal attachments introduced a separate local resolver for `$LIFECYCLE_ROOT`.

That split would turn the root path into another hidden convention instead of a shared contract.

## Learning

Lifecycle-owned local paths should derive from one root contract:

- `$LIFECYCLE_ROOT` when explicitly set
- `~/.lifecycle` by default

Desktop-owned path families such as worktrees and terminal attachments should then derive from that root rather than hardcoding independent defaults.

## Impact

- Worktree defaults and terminal attachment storage now point at the same root boundary.
- Future desktop-owned storage like logs, caches, or credentials can reuse the same resolver instead of duplicating home-directory expansion logic.
- The repository no longer has two competing sources of truth for where Lifecycle-owned files live locally.

## Follow-Up

- Move any future CLI local state paths to the same `$LIFECYCLE_ROOT` contract instead of introducing more `~/.lifecycle/...` literals.
- If desktop settings should expose the root directly rather than only the derived worktree path, add that as an explicit settings contract rather than inferring it indirectly.
