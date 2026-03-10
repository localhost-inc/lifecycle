# Terminal Attachments Should Not Pollute The Workspace Tree

Date: 2026-03-10
Milestone: M3

## Context

Terminal image paste needs a real file path because Codex and Claude consume pasted image references as filesystem paths in the embedded terminal flow. The first implementation stored those files under `WORKTREE/.lifecycle/attachments/`.

That made the path contract work, but it also leaked internal clipboard artifacts into the user's workspace tree and file pickers.

## Learning

The harness needs durable files, not worktree-local files.

For local desktop terminals, the better boundary is:

- persist terminal attachment files in Lifecycle-owned storage under `$LIFECYCLE_ROOT/attachments/`
- paste the resulting absolute path into the harness session
- keep the workspace filesystem focused on user-authored project state rather than Lifecycle internals

## Impact

- Pasted terminal images still resolve to stable on-disk files that Codex and Claude can open.
- Workspace-visible `.lifecycle/attachments/*` clutter is removed for newly created attachments.
- Attachment retention is now a Lifecycle-owned cache concern under `$LIFECYCLE_ROOT` rather than an accidental property of worktree cleanup.

## Follow-Up

- Add retention and pruning rules for old terminal attachments in `$LIFECYCLE_ROOT/attachments/`.
- If workspace destroy flows should clean attachment cache eagerly, make that policy explicit in the same lifecycle contract rather than relying on path placement.
