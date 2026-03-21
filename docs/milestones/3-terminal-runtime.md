# Milestone 3: "I can run an agent in a terminal"

> Prerequisites: M2
> Introduces: `terminal` entity, local terminal architecture, harness integration
> Tracker: high-level status/checklist lives in [`docs/plan.md`](../plan.md). This document is the detailed implementation contract.

> Update (2026-03-15): the brief external `tmux` session-host experiment was rolled back. Local terminals are again desktop-process-owned Ghostty sessions, so app restart returns to being a terminal termination boundary.

## Goal

User opens a workspace, lands in the shared workspace surface, optionally launches a coding agent harness (Claude Code, Codex, etc.) from an empty pane, and interacts with a native terminal session that supports detach/restore within the running desktop app. Newly created workspaces should default to an empty pane state so session choice stays inside the shared workspace tab surface without requiring a synthetic launcher tab. Adding a project should create a repo-backed root workspace immediately so work can start without managed-worktree ceremony.

## What You Build

1. Native Ghostty terminal hosting on macOS:
   - `libghostty` embedded as an `NSView` mounted above the Tauri `WKWebView`
2. Local `terminal` entity and desktop-owned terminal session supervision.
3. Terminal transport split by responsibility:
   - Tauri `invoke` for backend operations (`create`, `detach`, `kill`, native host sync`)
   - normalized terminal fact events for metadata and lifecycle changes only
4. Harness adapters for plain shell plus supported coding CLIs.
5. Runtime-backed terminal tabs with live state powered by the desktop query layer.

## Non-Goals (Explicit)

1. No external CLI attach bridge in M3. CLI-driven terminal control belongs in M5.
2. No cloud terminal transport in M3. Cloud workspace terminals belong in M6 when cloud workspaces exist.
3. Current M3 limitation: local terminals do not survive desktop app restart because the runtime lives inside the desktop app process.
4. No requirement to support resumable session capture for every harness. Resume is per-harness capability, not a universal M3 gate.

## Entity Contracts

### `terminal` (interactive session)

1. Purpose:
   - native-backed interactive process running inside a workspace; may be a plain shell or a coding harness session (`launch_type=shell` means plain shell)
2. Required fields:
   - `id`
   - `workspace_id`
   - `launch_type` (`shell|harness|preset|command`) — M3 uses `shell` and `harness`
   - `harness_provider` (nullable string, e.g. `"claude"`, `"codex"`) — null unless `launch_type=harness`
   - `harness_session_id` (nullable opaque string) — persisted only when a harness exposes a stable resumable session identifier
   - `created_by` (nullable for local pre-auth sessions)
   - `label` (human-friendly, e.g. `"Terminal 1"`, `"Claude · auth-fix"`)
   - `status` (`active|detached|sleeping|finished|failed`)
   - `failure_reason` (nullable typed enum; required when `status=failed`)
   - `exit_code` (nullable integer)
   - `started_at`, `last_active_at`, `ended_at` (nullable; required when `status=finished|failed`)
3. Invariants:
   - create is allowed whenever the parent workspace has an interactive worktree context
   - service sleep does not automatically suspend terminals; terminal access remains available while the worktree exists
   - workspace `destroy` hard-terminates any non-finished/non-failed terminal
   - `status=finished` requires `ended_at`; `exit_code` is recorded when the process exits with one
   - `launch_type=harness` requires `harness_provider`
   - `harness_session_id` is provider-owned metadata, not a cross-harness contract

## Implementation Contracts

### Terminal Model

A terminal session runs inside a workspace execution environment and may be a plain shell or a coding harness. The desktop terminal panel is a native Ghostty host mounted into the desktop shell.

For local mode in M3:
- macOS native mode uses an embedded Ghostty surface that owns the local terminal child process directly
- the terminal working directory is the workspace `worktree_path`
- metadata and lifecycle state flow through the desktop query cache
- raw terminal output stays inside the native terminal host rather than the event foundation

### Reactive Data Model

1. Terminal metadata uses the same app-facing reactive substrate introduced in M2:
   - feature hooks such as `useWorkspaceTerminals()` and `useTerminal()`
   - query-backed descriptors and reducers
   - terminal facts such as `terminal.created`, `terminal.status_changed`, `terminal.renamed`, `terminal.removed`, `terminal.harness_prompt_submitted`, and `terminal.harness_turn_completed`, aligned to [reference/events.md](../reference/events.md)
2. Raw terminal rendering and input stay inside the native host, not the reducer-driven fact event model.
3. Terminal creation and lifecycle mutations stay imperative and transport-oriented.

### Workspace Surface Compatibility

1. Terminal tabs are the first runtime-backed tab type in the workspace surface.
2. Future document tabs (for example git diff or file editors) must not redefine terminal lifecycle semantics.
3. Runtime-backed terminal panels may stay mounted while inactive so detach/reattach and native host behavior remain correct.
4. The shared workspace surface may restore as a split-pane tree with pane-local tab strips, but terminal runtime ownership and detach/restore semantics must remain identical across single-pane and multi-pane layouts.

### Harness Integration

1. Harness support is adapter-based:
   - `plain shell`
   - `Claude Code`
   - `Codex`
   - future CLIs without changing the terminal transport
2. M3 requires reliable native terminal launch for supported harnesses. It does **not** require stable resumable session capture for every harness.
3. `harness_session_id` is optional and opaque:
   - set it when a harness exposes a stable documented resume token
   - leave it null when the harness does not expose one or the signal is not reliable enough
4. Claude Code has a documented `--resume` flow for existing sessions. Initial launch should be a normal interactive CLI invocation, not a synthetic app-assigned session id.
5. Codex and other harnesses should be treated as adapter-defined integrations. Do not hardcode milestone-critical behavior around undocumented or fast-moving CLI session internals.

### Auto-Title Semantics

1. First-prompt title generation listens to `terminal.harness_prompt_submitted`, not `terminal.harness_turn_completed`.
2. `terminal.harness_prompt_submitted` is submit-scoped: once per accepted prompt/turn, never per keystroke.
3. The event is emitted by authoritative runtime/backend code and carries normalized prompt context rather than renderer-local input state.
4. If `terminal.label_origin == default` and `workspace.name_origin == default`, the first submitted harness prompt may generate titles and then emit `terminal.renamed` and `workspace.renamed`.
5. Manual renames remain authoritative and must not be overwritten by later generated titles.

### Provider Contract (M3 Scope)

The current M2 placeholder `openTerminal(workspaceId, cols, rows)` is insufficient for M3. The actual terminal surface should expand to explicit lifecycle operations:

1. `createTerminal(workspaceId, launchType, harnessProvider?, harnessSessionId?)` → terminal metadata
2. `detachTerminal(workspaceId, terminalId)` → hide the active native surface without killing the process
3. `killTerminal(workspaceId, terminalId)` → terminate the native-backed terminal session

### Local Terminal Architecture (M3 Scope)

1. On macOS, Tauri hosts a native `libghostty` surface above the `WKWebView` and syncs its frame/focus from the DOM shell.
2. Control operations use Tauri commands (`invoke`) so the command boundary stays typed and explicit across the React shell and native host.
3. macOS native mode persists terminal metadata in SQLite while the embedded Ghostty host owns the child process lifetime for the running app session.
4. The native Ghostty surface owns both presentation and runtime for the current desktop app session.
5. Explicit terminal kill tears down the live native session; app shutdown does too.
6. External CLI attach/detach is deferred to M5.

### Native Surface Contract

1. The React shell syncs geometry, visibility, focus, appearance, and font settings into native Ghostty surfaces through typed Tauri commands.
2. Input, resize, selection, clipboard, IME, and output rendering stay inside the native host view rather than flowing through JS as PTY byte streams.
3. Closing or hiding a terminal tab detaches the native surface without killing the underlying session.
4. Restoring a live terminal in the same desktop app session reuses the same native-backed process instead of replaying buffered output.
5. App shutdown terminates local terminal sessions because the runtime still lives inside the desktop app process.

### Tab, Window, and Process Semantics

1. Switching away from a terminal tab detaches or hides the UI client; it does not terminate the terminal session.
2. Closing a terminal tab in the UI must not silently kill a running process.
3. For `active` or `detached` terminals, the default close-tab behavior is `detach`, not `kill`.
4. Explicit terminate/kill is a separate user action and is the only normal tab-level action that intentionally ends a running session.
5. Reopening a previously closed terminal tab in the same desktop app session restores the existing detached terminal if it still exists.
6. Natural process exit transitions terminal state to `finished`; terminated processes may resolve to `finished` or `failed` depending on exit semantics and recorded failure reason.
7. Desktop app quit/window close terminates local terminal sessions.
8. If cross-restart continuity becomes important again, it should come from a deliberate external host or daemon rather than ad hoc view-state restoration.

### Native macOS Terminal Host

1. Use `libghostty` as the macOS terminal surface, embedded as an `NSView` layered above the Tauri `WKWebView`.
2. The React shell remains responsible for tab state, geometry measurement, and focus/visibility changes.
3. Native terminal input, IME, selection, clipboard, and rendering stay inside the AppKit host view rather than crossing JS IPC per keystroke.

### Browser Terminal Fallback

Browser fallback is intentionally out of scope for the current desktop product direction. If it returns later, it should be reintroduced as a separate contract rather than shaping the native desktop architecture by default.

### Cloud Terminal Architecture (Deferred)

Cloud terminal transport is out of scope for M3. M3 should keep the domain model and provider contract compatible with a future cloud implementation, but cloud attach transport, auth tokens, and websocket bridging belong in M6. That future cloud path should extend the native-first desktop surface model where a platform-native host exists instead of reintroducing a browser terminal renderer in the main desktop app.

## Desktop App Surface

- **Terminal tabs**: tab bar with label and state indicators
- **Inline naming**: double-click workspace rows and terminal tabs to rename in place; default titles may be replaced by a generated title from the first harness prompt, but manual renames win thereafter
- **Prompt-boundary titling**: the first accepted harness prompt may generate workspace/session titles immediately on submit; response completion remains a separate event
- **Empty-pane default**: newly created workspaces open with an empty pane state that can start shell or harness sessions
- **New terminal action**: create plain shell or supported harness terminal from any workspace with interactive context
- **Session history**: recent workspace terminal sessions remain visible from the workspace surface, and finished harness sessions with a stored `harness_session_id` can be resumed without retyping the id
- **terminal panel**: real-time native terminal rendering with resize support
- **Split panes**: the center surface may split horizontally or vertically, with pane-local tab strips, resizable boundaries, and drag moves between panes
- **Tab switching**: detach/attach without killing the process
- **Explicit terminate action**: user can kill a terminal intentionally
- **Finished state**: tab shows exit code when available

## Exit Gate

- Project added or workspace created → empty pane state appears automatically
- First workspace for a project is the repo-backed root workspace
- Empty pane state can start shell, Claude, or Codex sessions
- Workspace has interactive context → pane action buttons or `Cmd/Ctrl + T` add additional terminal tabs
- Choose plain shell or a supported harness
- Submit the first harness prompt → generated workspace/session titles appear immediately when both title origins are still `default`
- Terminal output streams in real time
- Switch tabs → process keeps running → switch back in the same app session → the same native session is restored
- Resize the panel → native terminal layout updates correctly
- Explicitly terminate or let process exit → tab shows finished state with exit code when available

## Test Scenarios

```text
workspace created → empty pane state appears → start harness session → output streams
first harness prompt submitted while workspace and terminal titles are default → generated titles appear before response completion
workspace sleeping → new shell terminal → shell prompt appears → type command → see output
large output burst → terminal stays responsive
terminal active → switch tabs → switch back in same app session → the same detached session is restored
terminal active → resize panel → native terminal layout stays correct
workspace or terminal title changes → visible labels update in place without a full query invalidation
manual workspace or terminal rename after first prompt → later prompt submissions do not overwrite the manual title
terminal active → terminate terminal → process exits → terminal shows finished state with exit status
all tabs closed → empty pane state remains visible and split layout stays intact
```
