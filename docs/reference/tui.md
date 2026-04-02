# TUI

Canonical contract for the Lifecycle terminal UI in `apps/tui`.

The TUI is a thin client over Lifecycle primitives. It owns terminal rendering, focus, mouse/keyboard routing, and outer column layout. It does **not** own workspace-host resolution or shell lifecycle policy.

## Core model

The TUI is a three-column shell:

1. left: workspace context and notes
2. center: one attached shell surface
3. right: workspace-side status for the same bound scope

The center column is one terminal surface from Lifecycle's point of view. If tmux is active, tmux owns all inner panes and windows inside that shell.

## Authority split

Lifecycle CLI is the primary control-plane brain for the TUI session.

Rules:

1. `packages/cli/src/commands/tui.ts` resolves the TUI session before the Rust process starts.
2. The resolved session is passed into the TUI through `LIFECYCLE_TUI_SESSION`.
3. The Rust app consumes that session and renders it; it should not invent separate host, workspace, or shell semantics when the CLI already resolved them.
4. A Rust-side fallback path may exist for direct binary launches, but it is secondary to the CLI-resolved path.

## Bound workspace scope

One TUI session maps to one workspace scope:

1. one `workspace.id` or explicit ad hoc local shell
2. one authoritative `workspace.host`
3. one shell launch path for the center column
4. one workspace-side fact view for the right column

The middle and right columns must never silently drift across hosts.

## Host behavior

### `local`

1. The CLI resolves a local tmux-backed shell launch for the bound or ad hoc local path.
2. Closing the TUI detaches the client; the tmux session survives.
3. The right column reflects the same local workspace scope when Lifecycle can resolve it.

### `cloud`

1. The CLI resolves a cloud shell attach path through `lifecycle workspace shell`.
2. Persistent TUI sessions use remote tmux via `--tmux-session`.
3. The shell session lives in the cloud workspace runtime, not on the local machine.

### `docker`

1. Docker remains a distinct host in the contract.
2. The TUI must not silently alias docker shells to local tmux sessions.
3. Until an authoritative docker shell attach path exists, the TUI surfaces an explicit unsupported-host error.

## Session envelope

The CLI passes a JSON session envelope through `LIFECYCLE_TUI_SESSION`.

The envelope contains:

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
   - launch spec (`program`, `args`, `cwd`, `env`) or launch error

This envelope is the current primitive that lets other Lifecycle clients reuse the same host-aware session decision without copying Rust UI code.

## Input and layout

The TUI owns:

1. raw terminal rendering through `portable-pty` plus the configured VT backend
2. focus switching across sidebar, canvas, and right column
3. outer-column resize via mouse drag
4. key passthrough into the center shell when the canvas is focused

The TUI does not currently provide terminal mouse passthrough into tmux. Keyboard tmux flows are first-class; tmux mouse mode is a follow-up.

## Module map

```text
apps/tui/src/
  main.rs        # TUI runtime, event loop, input dispatch
  app.rs         # app state, column layout, render orchestration
  lifecycle.rs   # session bootstrap; prefers CLI-provided LIFECYCLE_TUI_SESSION
  shell.rs       # TUI session types plus fallback shell resolution
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
3. define a second host resolution system separate from the CLI
