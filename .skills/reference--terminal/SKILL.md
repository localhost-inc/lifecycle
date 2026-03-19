---
name: reference--terminal
description: Terminal harness, session lifecycle, log streaming, native surface sync, launch types
user-invocable: true
---

Apply the following terminal contracts as context for the current task. Use these for terminal lifecycle, harness integration, log streaming, and native surface sync work.

---

# Terminal Harness & Session Lifecycle

Canonical contracts for terminal sessions, harness integration, and native surface behavior in the Lifecycle desktop app.

## Terminal Session Lifecycle

Terminal sessions follow a strict state machine:

- `active -> detached | sleeping | finished | failed`
- `detached -> active | sleeping | finished | failed`
- `sleeping -> detached | active | failed`
- `finished` and `failed` are terminal states

Lifecycle boundaries:
1. Local terminal sessions are **app-owned**, not daemon-owned. If the desktop app disappears, stale `active`/`detached`/`sleeping` rows must be reconciled on next boot.
2. `create`/`attach` require workspace interactive context (worktree exists, workspace not in create/destroy teardown).
3. `sleeping` terminals reject input.
4. Workspace `destroy` hard-terminates non-finished/non-failed terminals.
5. `detachTerminal` hides the active surface without terminating the session.
6. `killTerminal` is the only action that intentionally ends a live session.

Control operations use typed commands (`create`, `attach`, `write`, `resize`, `detach`, `kill`). Raw PTY bytes travel on a dedicated ordered stream channel, not the generic store event bus.

## Launch Types

Every terminal session has an explicit `launch_type` discriminator:

| Launch Type | Description | Lifecycle |
|---|---|---|
| `shell` | Interactive user shell | Standard terminal lifecycle |
| `harness` | Agent session (Claude, Codex, etc.) | Extended with harness metadata |
| `service_log` | Service log viewer | Read-only, tied to service lifecycle |

Rules:
- `harness_provider` is only set when `launch_type = harness`.
- `harness_session_id` is optional harness-owned resume metadata.
- Provider-specific launch details stay behind adapter resolution — raw command arguments are not persisted on the terminal record.
- Terminal interactivity keys off interactive workspace context, not `workspace.status === ready`. Services being stopped does not mean the workspace is not programmable.

## Harness Contract

### Adapter Boundary

All harness-specific behavior lives behind **one adapter contract** in the desktop backend:

- CLI launch metadata (command, args, env)
- Session-store lookup and session ID binding
- Prompt-submission parsing
- Completion parsing
- Provider display metadata (default label, icon)

Terminal lifecycle code consumes **normalized harness facts** instead of branching on provider names. Adding a new harness means implementing one adapter entry, not threading conditionals through the terminal stack.

### Session Binding

Terminal-to-session ownership is a **launch contract**, not a reconciliation problem:

1. Claude launches with an explicit session ID from the start; respawns switch to resume once the session log exists.
2. Codex runs inside a terminal-owned `CODEX_HOME` so session files live in an exclusive namespace from terminal creation.
3. A terminal that needs post-launch discovery should only discover inside its own provider-owned scope. Global provider session stores are not acceptable when multiple terminals share one workspace.
4. Frontend cache updates for harness session metadata need an explicit terminal update event — not incidental refetches.

### Prompt Submission

Prompt-boundary facts come from **authoritative session logs**, not renderer input plumbing:

- Claude and Codex session logs record submitted user messages with stable timestamps.
- The backend emits `terminal.harness_prompt_submitted` from log records.
- Session-log watchers re-read from the start filtered by terminal launch time — they do not blindly seek to EOF on first attach.
- Codex auto-title triggers use `event_msg.user_message` as the source of truth, not `response_item` records (which may contain AGENTS/context scaffolding).

### Turn Completion

The existing `terminal:status-changed` path covers process exit, but **turn completion** is a distinct signal:

- Interactive harness sessions remain alive after a response — PTY completion and turn completion are different.
- Provider-owned session stores (structured JSONL records) are the hook point, not PTY output scraping.
- The backend emits `terminal.harness_turn_completed` carrying `terminal_id`, `workspace_id`, `harness_provider`, `harness_session_id`, and optional `turn_id`.
- The desktop shell (not terminal rendering code) consumes this event for tab attention, dock badges, and notification policy.

## Native Surface Sync

### Frame & Visibility

Terminal surfaces are native `NSView`s managed through the platform adapter boundary:

- Geometry, visibility, and focus are synced between the webview layout and the native surface.
- Inactive runtime tabs remain mounted when their host depends on attachment continuity — switching tabs hides the native surface without destroying it.
- Closing a runtime tab detaches/hides, does not kill.

### Theme Propagation

Theme sync flows from CSS tokens to the Ghostty palette:

1. Every preset needs an explicit shell-depth hierarchy: `--background` (outer shell), `--surface` (primary workspace/terminal plane), `--card` (nested/raised plane).
2. Terminal ANSI palette must maintain distinguishable semantic lanes (blue vs cyan, green vs cyan).
3. Preset audits use contract tests asserting shell/surface/card separation and preventing semantic lane collisions.

## Log Streaming

Service logs are a **top-priority feature** — real-time, high quality, never janky:

1. Stream in real-time using async line readers, not batching.
2. Support ANSI color rendering.
3. Mark high-frequency log events as non-activity to avoid UI noise in workspace activity feeds.
4. Log streaming correctness and performance take priority in any code touching log paths.

## Inline Terminal Actions

Terminal-adjacent controls follow this hierarchy:

1. **Inline/header actions** — lightweight controls expand inside pane chrome.
2. **Route-level dialogs** — modal workspace flows use route-driven dialogs with native-terminal suppression.
3. **No floating overlays** — no screenshot-swap, no hosted-overlay compatibility layer.

Native-terminal suppression is scoped to modal flows only — never reused for lightweight inline actions.

## Persistence

- Terminal records persist in SQLite with launch type, harness metadata, and status.
- Harness session rows track provider-specific session IDs and completion state.
- Attachment storage lives outside the worktree.
- Per-workspace restore state persists split topology, tab order, and active pane — but must not override provider/runtime authority.

Key files:
- `apps/desktop/src-tauri/src/capabilities/workspaces/terminal/` — all terminal capability files
- `apps/desktop/src/features/terminals/` — frontend terminal features
