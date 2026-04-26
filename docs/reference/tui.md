# TUI

Canonical contract for the Lifecycle terminal UI in `apps/cli/src/tui`.

The shipped TUI is a first-party surface inside the `lifecycle` CLI. There is no separate standalone TUI artifact in the active product contract, and the old Rust TUI package has been removed from the repo.

Current repo focus: the CLI and TUI are the primary product surfaces being hardened right now. Changes that affect shell attach, tmux persistence, workspace activity, and host-aware execution should prefer this document plus the CLI/workspace contracts before any desktop-specific guidance.

The TUI is a thin client over Lifecycle primitives. It owns terminal rendering, focus, mouse/keyboard routing, and outer column layout. It does **not** own workspace-host resolution or shell lifecycle policy.

## Bridge-First Rule

The TUI is a bridge client.

Rules:

1. The TUI asks the bridge to perform runtime reads and mutations by workspace identity.
2. The TUI does not shell out to fresh `lifecycle` subprocesses for core workspace operations when the bridge is available.
3. The bridge is the source of runtime truth.
4. The TUI does not resolve workspace host placement or pick host adapters on its own.
5. If the pinned bridge endpoint dies, the TUI must retry the fixed local bridge endpoint (or explicit override), restart the bridge when needed, and use `~/.lifecycle/bridge.json` only for pid diagnostics instead of endpoint discovery.
6. Shared runtime state is read from the bridge. The current TUI refreshes bridge-backed state explicitly, and bridge lifecycle streaming remains the preferred upgrade path when available.
7. The TUI owns only presentation state such as selection, focus, layout, scrolling, and inline confirmations.

## Core model

The current TUI is a desktop-inspired workspace scene:

1. left: repository/workspace tree sourced from the local bridge repository model, with collapsible repository groups
2. top of main area: a single-row workspace header with the workspace title on the left and workspace-level actions such as start/stop stack on the right
3. center: terminal canvas with a compact terminal tab strip directly under the header, backed by bridge terminal records
4. right: extension sidebar with a small tab rail (`stack`, `debug`) for bridge-backed workspace facts

The center pane is still one attached terminal surface at a time from the TUI's point of view. If tmux is active, Lifecycle terminal records map to tmux windows and tmux still owns all inner pane/window state.

## Authority split

Client selection and bridge operations are separate.

Rules:

1. `lifecycle` with no args launches the TUI.
2. `apps/cli/src/tui/launch.ts` ensures the Lifecycle bridge is available before the CLI-owned OpenTUI runtime starts.
3. The Lifecycle bridge endpoint is passed through `LIFECYCLE_BRIDGE_URL` and `LIFECYCLE_BRIDGE_TOKEN`.
4. The client owns selected-workspace state and may restore it from local state or an initial hint such as `LIFECYCLE_INITIAL_WORKSPACE_ID`.
5. The TUI must not resolve workspace host, bridge authority, shell attach policy, or tmux session naming on its own when the bridge is available.
6. The bridge layer resolves the authoritative bridge for a selected workspace and only that bridge executes runtime work.
7. Bridge requests use singular dotted method names such as `repo.list`, `workspace.get`, `workspace.activity`, `workspace.shell`, `service.list`, `service.start`, and `service.stop`.
8. In repository development mode, the TUI and bridge must inherit the local control-plane URL from the process environment. `just tui-local` (or `bun run dev:tui:local`) loads `LIFECYCLE_API_URL=http://127.0.0.1:18787`, `LIFECYCLE_BRIDGE_URL=http://127.0.0.1:52300`, and the rest of the repo-local dev contract, and the TUI should not silently fall back to the production API in that mode.
9. `just dev` is the standard-access path for the CLI-owned TUI and should not force repo-local bridge/control-plane overrides. Repo-local bridge/control-plane work is opt-in via `just tui-local`.

## Bound workspace scope

One selected workspace scene maps to one workspace scope:

1. one `workspace.id` or explicit ad hoc local shell
2. one authoritative `workspace.host`
3. one terminal runtime / terminal listing for the center column
4. one workspace-side fact view for the right column

The middle and right columns must never silently drift across hosts.

## Workspace Paths

The TUI should reason about workspace paths in one simple way:

1. `workspace.workspace_root` is the authoritative runtime path for the selected workspace.
2. The TUI may show repository metadata from `GET /repos`, but it should not treat repository paths as shell cwd or terminal attach inputs.
3. Local bridges may use a repository path behind the scenes to create or repair a worktree, but that is bridge-owned lifecycle behavior, not client policy.
4. If a local worktree path goes stale, the bridge should repair the workspace record before terminal attach instead of forcing the TUI to invent recovery logic.

## Host behavior

### `local`

1. The Lifecycle bridge resolves a local workspace shell through the host-aware workspace client boundary.
2. TUI sessions request a tmux-backed launch by passing a persistent session name for the bound or ad hoc local path.
3. Terminal persistence backend, mode, and executable selection come from bridge-managed Lifecycle settings. The default configuration uses the tmux backend in `managed` mode, which runs through a Lifecycle-owned tmux server/profile instead of inheriting the user's default tmux server or config.
4. The CLI-owned TUI executes the bridge-provided terminal prepare/spec launch contract in a local PTY; it does not own a second tmux attach policy.
5. Closing the TUI detaches the client; the tmux session survives.
6. The right column reflects the same local workspace scope when Lifecycle can resolve it.
7. If the selected local worktree was deleted on disk, the bridge should restore the worktree and update `workspace.workspace_root` before terminal operations continue.
8. Lifecycle-managed tmux sessions keep tmux mouse mode disabled so embedded terminal hosts own wheel scrolling and scrollback behavior. Clients may route wheel events to the terminal surface, but they should not require tmux mouse reporting for normal scrollback.

### `cloud`

1. The Lifecycle bridge resolves a cloud workspace shell through the host-aware workspace client boundary.
2. Persistent TUI sessions use remote tmux by asking the cloud runtime for a prepare step plus an interactive attach step.
3. Cloud terminal persistence policy also comes from bridge-managed Lifecycle settings, so the default tmux-backed `managed` mode attaches through the same Lifecycle-owned tmux profile semantics as local workspaces.
4. The shell session lives in the cloud workspace runtime, not on the local machine.
5. `lifecycle workspace shell`, terminal attach, and the TUI center column use the same host-owned terminal runtime contract.
6. The TUI still treats the returned workspace root as the runtime cwd concept, even when the underlying cloud host does not expose a local repository path.

### `docker`

1. Docker remains a distinct host in the contract.
2. The TUI must not silently alias docker shells to local tmux sessions.
3. Until an authoritative docker shell attach path exists, the TUI surfaces an explicit unsupported-host error.

## Selected Workspace

The TUI owns selected-workspace state.

Rules:

1. On startup, the client may restore a selected workspace from local state.
2. If no workspace is selected, the TUI shows an empty state.
3. The sidebar tree is derived from `GET /repos` so the TUI matches the desktop app's local repository/workspace model and does not require cloud auth just to render local repositories and workspaces.
4. Selecting a workspace is a client event, not a server decision.

## Workspace Terminals

When the user selects a workspace, the TUI asks the Lifecycle bridge for:

1. `GET /workspaces/:id`
   - stack summary and workspace facts for the right sidebar
2. `GET /workspaces/:id/terminals`
   - authoritative workspace scope
   - terminal runtime capabilities and errors
   - terminal records (`id`, `title`, `kind`, `busy`) for the session strip
3. `POST /workspaces/:id/terminals`
   - create a new terminal when the runtime supports it
4. `POST /workspaces/:id/terminals/:terminalId/connections`
   - optional prepare launch spec plus the interactive attach spec for the selected terminal
   - optional initial ANSI snapshot of the terminal's existing tmux scrollback so reconnecting clients can restore prior output before live attach bytes continue in the current session

The canonical TUI attach path is now terminal-based, not the older `workspace.shell` one-shot attach path. Clients keep selection local and ask the bridge only for authoritative workspace / terminal facts.

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

1. raw terminal rendering through OpenTUI plus the Ghostty-backed terminal renderable
2. focus switching across the sidebar tree, shell canvas, and extension sidebar
3. fixed three-region sizing derived from terminal width and height
4. sidebar tree keyboard and mouse interaction, including repository collapse/expand state
5. terminal tab switching, extension tab switching, and key / paste passthrough into the active terminal when the canvas is focused
6. inline destructive confirmation for workspace delete; the current scene should keep this simple and not introduce a separate modal system
7. a full-height repository sidebar that starts at the top scene edge, while the selected workspace route renders full bleed inside the main column instead of inside a nested card frame
8. a compressed main-column hierarchy: single header row first, terminal tab strip second, then the shell canvas and right details rail

The TUI currently uses `bun-pty` for the local PTY process that runs the bridge-provided terminal launch spec. When the bridge can provide an initial ANSI snapshot for the selected terminal, the TUI seeds the shell canvas with that tmux scrollback before appending live attach output. Sidebar chrome, header, tab rails, and extension content remain TUI-owned and are not forwarded into the shell.

## Activity

Sidebar activity is derived from the Lifecycle bridge's workspace-activity read, not from client-side host-specific tmux inspection. The bridge is responsible for querying the authoritative host runtime and tmux session for each workspace. A workspace is considered busy when any pane in its tracked tmux session has a foreground command that represents real background work. Plain shells are always non-busy foregrounds. Interactive agent CLIs such as `claude` and `codex` are activity-gated foregrounds: they count as busy only while recent pane output indicates an active turn, and they return to non-busy once that output goes quiet. Shells without a tmux session may still fall back to active-PTY shell integration for the currently attached workspace only. Service state, stack transitions, and other runtime changes should arrive through bridge lifecycle events whenever the bridge can stream them.

## Theme

The CLI TUI chrome derives its semantic color tokens from the active terminal palette when the renderer can detect it. Lifecycle maps the terminal's default foreground/background plus ANSI status colors into TUI roles such as borders, muted text, selected surfaces, and error/info states. The TUI should not override the renderer's root background color, so host-terminal effects such as translucency or blur remain visible behind the chrome. If palette detection is unavailable, the TUI falls back to the Lifecycle dark token set.

## Module map

```text
apps/cli/src/tui/
  launch.ts             # bridge bootstrap + TUI startup
  opentui.tsx           # OpenTUI runtime, bridge reads, terminal attach, and input orchestration
  tui-models.ts         # bridge response and shared TUI types
  tui-theme.ts          # palette-derived semantic TUI tokens
  components/
    repository-sidebar.tsx   # repository/workspace tree presentation
    workspace-header.tsx      # workspace header and actions
    workspace-session-strip.tsx # terminal tab rail
    workspace-shell-panel.tsx # terminal canvas presentation
    workspace-extension-sidebar.tsx # right-side stack/debug inspector
  selection-state.ts    # client-owned selected-workspace persistence
  opentui-helpers.ts    # small UI/runtime helpers for selection and terminal launch
```

## Non-goals

The TUI does not currently:

1. maintain its own inner pane tree inside the center terminal
2. mirror tmux panes into Lifecycle UI state
3. define a second host resolution system separate from the Lifecycle bridge
