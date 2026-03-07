# terminal reattach needs a replay cursor, not full-buffer replay

Date: 2026-03-06
Milestone: M3

## Context

After moving the browser terminal surface to `ghostty-web`, tab switching exposed a transport bug that looked like phantom input. Re-entering a tab appended previously rendered prompt lines and shell output back into the same surface.

## Learning

The root cause was not keyboard input or canvas rendering. It was the detach/reattach contract:

1. The frontend now keeps terminal surfaces mounted to avoid tab-switch flicker.
2. The PTY stream detaches when a tab becomes inactive and reattaches when it becomes active again.
3. The runtime was replaying the entire bounded buffer on every attach.
4. Because the mounted surface already contained older output, reattach duplicated previously rendered lines.

The correct contract is incremental replay:

1. Each replay/live chunk needs a monotonic cursor.
2. The client needs to remember the last rendered cursor for the current surface.
3. Reattach must request only chunks newer than that cursor.

## Decision

Keep mounted terminal surfaces for smoother tab switching, but make replay cursor-aware across the Tauri runtime and the browser simulator.

## Impact

1. Fixes duplicated prompts/output on tab switch without going back to full terminal teardown.
2. Makes attach/detach semantics explicit in the terminal stream contract.
3. Preserves the ability to reconstruct a fresh surface by resetting the client replay cursor when the terminal widget is recreated.

## Follow-up

1. Validate live tab switching in the desktop app with Claude and Codex sessions after reload.
2. If tab switching still looks unstable, inspect Ghostty Web focus/canvas lifecycle next instead of revisiting the replay contract.
3. Keep future terminal transport changes cursor-aware; full replay on every attach is only valid for a brand-new surface.

## Sources

1. Repo implementation:
   - `apps/desktop/src-tauri/src/platform/runtime/terminal.rs`
   - `apps/desktop/src-tauri/src/capabilities/workspaces/terminal.rs`
   - `apps/desktop/src/features/terminals/api.ts`
   - `apps/desktop/src/features/terminals/components/terminal-panel.tsx`
