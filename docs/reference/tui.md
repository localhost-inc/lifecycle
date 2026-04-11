# TUI

Canonical contract for the Lifecycle terminal UI in `apps/tui`.

Current repo focus: the CLI and TUI are the primary product surfaces being hardened right now. Changes that affect shell attach, tmux persistence, workspace activity, and host-aware execution should prefer this document plus the CLI/workspace contracts before any desktop-specific guidance.

The TUI is a thin client over Lifecycle primitives. It owns terminal rendering, focus, mouse/keyboard routing, and outer column layout. It does **not** own workspace-host resolution or shell lifecycle policy.

## Bridge-First Rule

The TUI is a bridge client.

Rules:

1. The TUI asks the bridge to perform runtime reads and mutations by workspace identity.
2. The TUI does not shell out to fresh `lifecycle` subprocesses for core workspace operations when the bridge is available.
3. The bridge is the source of runtime truth.
4. The TUI does not resolve workspace host placement or pick host adapters on its own.
5. If the pinned bridge endpoint dies or the bridge registration in `~/.lifecycle/bridge.json` changes, the TUI must rediscover the current bridge endpoint and retry bridge reads and mutations instead of staying pinned to a dead URL.
6. When bridge-side runtime state changes, the bridge streams lifecycle events over WebSocket and the TUI updates UI state from those events.
7. The TUI owns only presentation state such as selection, focus, layout, scrolling, and dialogs.

## Core model

The TUI is a three-column shell:

1. left: workspace context and notes
2. center: one attached shell surface
3. right: workspace-side status for the same bound scope

The center column is one terminal surface from Lifecycle's point of view. If tmux is active, tmux owns all inner panes and windows inside that shell.

## Authority split

Client selection and bridge operations are separate.

Rules:

1. `lifecycle` with no args launches the TUI.
2. `apps/cli/src/tui/launch.ts` ensures the Lifecycle bridge is available before the Rust process starts.
3. The Lifecycle bridge endpoint is passed through `LIFECYCLE_BRIDGE_URL` and `LIFECYCLE_BRIDGE_TOKEN`.
4. The client owns selected-workspace state and may restore it from local state or an initial hint such as `LIFECYCLE_INITIAL_WORKSPACE_ID`.
5. The TUI must not resolve workspace host, bridge authority, shell attach policy, or tmux session naming on its own when the bridge is available.
6. The bridge layer resolves the authoritative bridge for a selected workspace and only that bridge executes runtime work.
7. Bridge requests use singular dotted method names such as `repo.list`, `workspace.get`, `workspace.activity`, `workspace.shell`, `service.list`, `service.start`, and `service.stop`.
8. In repository development mode, the TUI and bridge must inherit the local control-plane URL from the process environment. Root `bun dev` sets `LIFECYCLE_API_URL=http://127.0.0.1:8787`, and the TUI should not silently fall back to the production API in that mode.

## Bound workspace scope

One workspace shell operation maps to one workspace scope:

1. one `workspace.id` or explicit ad hoc local shell
2. one authoritative `workspace.host`
3. one shell launch path for the center column
4. one workspace-side fact view for the right column

The middle and right columns must never silently drift across hosts.

## Host behavior

### `local`

1. The Lifecycle bridge resolves a local workspace shell through the host-aware workspace client boundary.
2. TUI sessions request a tmux-backed launch by passing a persistent session name for the bound or ad hoc local path.
3. Terminal persistence backend, mode, and executable selection come from bridge-managed Lifecycle settings. The default configuration uses the tmux backend in `managed` mode, which runs through a Lifecycle-owned tmux server/profile instead of inheriting the user's default tmux server or config.
4. The Rust TUI attaches through tmux's native create-or-attach flow rather than a shell-script shim.
5. Closing the TUI detaches the client; the tmux session survives.
6. The right column reflects the same local workspace scope when Lifecycle can resolve it.

### `cloud`

1. The Lifecycle bridge resolves a cloud workspace shell through the host-aware workspace client boundary.
2. Persistent TUI sessions use remote tmux by asking the cloud runtime for a prepare step plus an interactive attach step.
3. Cloud terminal persistence policy also comes from bridge-managed Lifecycle settings, so the default tmux-backed `managed` mode attaches through the same Lifecycle-owned tmux profile semantics as local workspaces.
4. The shell session lives in the cloud workspace runtime, not on the local machine.
5. `lifecycle workspace shell` and the TUI center column use the same host-owned shell runtime contract.

### `docker`

1. Docker remains a distinct host in the contract.
2. The TUI must not silently alias docker shells to local tmux sessions.
3. Until an authoritative docker shell attach path exists, the TUI surfaces an explicit unsupported-host error.

## Selected Workspace

The TUI owns selected-workspace state.

Rules:

1. On startup, the client may restore a selected workspace from local state.
2. If no workspace is selected, the TUI shows an empty state.
3. Repository and workspace lists still load from the bridge.
4. Selecting a workspace is a client event, not a server decision.

## Workspace Shell

When the user selects a workspace, the TUI asks the Lifecycle bridge for the workspace shell.

The server response contains:

1. `workspace`
   - binding mode (`bound` or `adhoc`)
   - workspace identity and host
   - current path / worktree path
   - workspace status and services when available
   - resolution notes or errors
2. `shell`
   - backend label
   - persistence flag
   - tmux session name when present
   - optional prepare launch spec (`program`, `args`, `cwd`, `env`) for hosts that need setup before attach
   - interactive launch spec (`program`, `args`, `cwd`, `env`) or launch error

The workspace shell is the canonical bridge operation for opening the center shell. Clients keep selection local and ask the bridge only for authoritative workspace/shell facts.

## Lifecycle Bridge

The TUI is a client of the Lifecycle bridge.

Rules:

1. `lifecycle bridge start` starts the Lifecycle bridge for the current host context.
2. The same bridge boundary is intended to run on local, remote, and cloud hosts.
3. Clients address workspace operations by workspace id; the bridge layer resolves the authoritative bridge when needed.
4. The authoritative bridge owns workspace-shell resolution, shared workspace reads, repository/workspace listing, workspace activity, git status, and stack/service runtime operations.
5. The TUI should prefer the bridge for shared reads and mutations instead of shelling out to fresh `lifecycle` subprocesses.
6. Clients stay thin; the bridge owns stateful coordination.

## Input and layout

The TUI owns:

1. raw terminal rendering through `portable-pty` plus the configured VT backend
2. focus switching across sidebar, canvas, and right column
3. outer-column resize via mouse drag
4. key passthrough into the center shell when the canvas is focused

The TUI forwards terminal mouse and keyboard input for the center canvas through the VT backend's native encoders whenever available. Sidebar chrome, right-column panels, and outer column-resize borders remain TUI-owned and are not forwarded into the shell.

## Activity

Sidebar activity is derived from the Lifecycle bridge's workspace-activity read, not from Rust-side host-specific tmux inspection. The bridge is responsible for querying the authoritative host runtime and tmux session for each workspace. A workspace is considered busy when any pane in its tracked tmux session has a foreground command that represents real background work. Plain shells are always non-busy foregrounds. Interactive agent CLIs such as `claude` and `codex` are activity-gated foregrounds: they count as busy only while recent pane output indicates an active turn, and they return to non-busy once that output goes quiet. Shells without a tmux session may still fall back to active-PTY shell integration for the currently attached workspace only. Service state, stack transitions, and other runtime changes should arrive through bridge lifecycle events whenever the bridge can stream them.

## Module map

```text
apps/tui/src/
  main.rs        # TUI runtime, event loop, input dispatch
  app.rs         # app state, column layout, render orchestration
  selection.rs   # client-owned selected-workspace persistence
  bridge.rs      # client for the Lifecycle bridge surface, including workspace-shell reads
  shell.rs       # workspace-shell types plus shell launch helpers
  terminal.rs    # PTY lifecycle and VT feeding
  ui/
    sidebar.rs   # workspace scope summary
    canvas.rs    # center shell rendering
    extensions.rs # right-column workspace status
```

## Non-goals

The TUI does not currently:

1. maintain its own inner pane tree inside the center terminal
2. mirror tmux panes into Lifecycle UI state
3. define a second host resolution system separate from the Lifecycle bridge
