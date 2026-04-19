# Plan: TUI tmux support with host-bound workspace scope

> Related: [docs/reference/workspace.md](../reference/workspace.md), [docs/reference/journey.md](../reference/journey.md), [docs/plans/cli.md](../../plans/cli.md), [docs/plans/cloud-workspaces.md](./cloud-workspaces.md)

This document is the tracked execution plan for adding tmux-backed persistence and user-controlled splitting to the Lifecycle TUI without weakening the repository's host-bound workspace model.

The plan treats the TUI as a thin shell around one bound workspace scope. In that scope, the **middle column** and **right column** must resolve against the same authoritative `workspace.host`.

## Problem

The current TUI embeds one local PTY in the middle column and gives it no persistence beyond the lifetime of the TUI process. That produces three product gaps:

1. Closing the historical standalone TUI tears down the middle terminal session instead of detaching from it.
2. Users cannot split the middle terminal without Lifecycle building its own inner pane model.
3. The TUI does not yet have an explicit contract for how the middle and right columns bind to `local`, `docker`, and `cloud` workspaces.

tmux is the lowest-risk way to solve the first two gaps, but only if the session identity and attach path stay host-aware.

## Core Decision

Lifecycle TUI should not build its own inner terminal splitter first.

Instead:

1. The TUI owns the outer shell only: sidebar, middle terminal column, right column.
2. The middle column remains a single terminal surface from Lifecycle's perspective.
3. tmux owns sub-splits, pane focus, windows, and process persistence inside that middle terminal surface when the selected host supports tmux-backed shell sessions.
4. The right column remains workspace-scoped UI, but it must bind to the same workspace scope and host authority as the middle terminal.

## Workspace Scope Rule

For the TUI, a bound workspace scope means:

1. one `workspace.id`
2. one `workspace.host`
3. one authoritative shell attach path for the middle column
4. one authoritative `WorkspaceClient` / `EnvironmentClient` interpretation for right-column reads and actions

The middle and right columns must never silently point at different hosts for the same visible workspace.

Examples:

1. If the TUI is attached to a `cloud` workspace shell, the right column must read cloud-backed workspace facts, not a local worktree approximation.
2. If the TUI is attached to a `docker` workspace, the middle terminal must attach to the docker-backed runtime path for that workspace, not a similarly named local tmux session on the developer's machine.
3. If the TUI is attached to a `local` workspace, closing the TUI may detach from the local shell session, but it must not mutate any `cloud` or `docker` session state.

## Host-specific terminal model

tmux support must sit behind the existing host boundary instead of bypassing it.

### `workspace.host=local`

1. The TUI may spawn or reattach a local tmux session directly on the developer machine.
2. The session name must be derived from workspace identity, not from a generic global name like `lifecycle`.
3. The working directory and environment must match the local workspace worktree/runtime context.
4. Detaching the TUI must leave the tmux session running.

### `workspace.host=docker`

1. The TUI must treat docker as a distinct host even if the underlying desktop implementation currently shares local code paths.
2. The middle terminal must attach to a tmux session inside the authoritative docker-backed shell context for that workspace.
3. A docker workspace must not reuse the local host's tmux session namespace.
4. Any right-column file, environment, preview, or control action must continue to dispatch through the docker-bound workspace scope.

### `workspace.host=cloud`

1. The TUI acts as a client attaching to a cloud-hosted shell path.
2. tmux should run inside the cloud workspace runtime, not on the local machine.
3. Closing the TUI detaches the client; it does not terminate the cloud tmux session unless the user explicitly kills it through the authoritative host path.
4. Right-column actions must resolve through cloud-backed workspace facts and cloud-capable clients.

## Identity and naming

tmux session identity must be stable enough for reattach but narrow enough to avoid host leakage.

The session key should include:

1. `workspace.id`
2. `workspace.host`
3. an optional lane or purpose token when multiple shell lanes are later introduced

The key should not depend on:

1. current TUI process id
2. local window id
3. transient selected tab state

The initial implementation may serialize this into a tmux-safe session name, but the source of truth should remain a structured host-bound shell session identifier in Lifecycle code.

## UX rules

The TUI should expose minimal but explicit shell semantics.

Rules:

1. The middle column shows one attached shell surface.
2. tmux keyboard shortcuts pass through unchanged.
3. Lifecycle does not mirror tmux's inner panes into its own layout state.
4. The TUI should show which host the workspace is bound to.
5. The TUI should show whether the middle shell is persistent tmux-backed or an ephemeral raw shell.
6. Missing tmux support must fail explicitly for the current host; no silent fallback that makes persistence disappear without explanation.

## Mouse and input constraint

Current canvas mouse handling belongs to the TUI itself rather than terminal mouse passthrough. That means:

1. tmux keyboard-driven splitting is in scope for the first slice
2. tmux mouse mode is not yet complete in the first slice
3. mouse passthrough should be treated as a follow-up implementation stream, not hidden inside the initial tmux launch work

## Implementation slices

### Slice 1: host-bound launcher abstraction

Introduce a small shell-launch abstraction for the TUI.

Responsibilities:

1. resolve the active workspace scope
2. resolve the authoritative attach mode from `workspace.host`
3. choose `raw shell` vs `tmux shell`
4. return launch metadata suitable for UI status and reconnect behavior

This layer must replace direct local-shell spawning in the TUI.

### Slice 2: local tmux persistence

Add tmux-backed local shell sessions.

Responsibilities:

1. derive a stable local session key from workspace identity plus `host=local`
2. start or attach tmux in the workspace worktree
3. treat TUI close as detach, not session termination
4. preserve explicit kill semantics separately from detach

### Slice 3: docker host support

Add explicit docker-host attach semantics.

Responsibilities:

1. bind the shell attach path to the docker workspace host
2. ensure tmux executes in the docker runtime context, not the local host shell
3. keep right-column actions host-consistent with the same workspace scope

If docker support cannot yet attach to an authoritative shell context, fail fast and keep the host contract explicit rather than silently aliasing to local tmux behavior.

### Slice 4: cloud host support

Align TUI shell attach with the existing cloud shell model.

Responsibilities:

1. reuse the cloud shell attach path rather than inventing a second transport
2. allow tmux to run remotely inside the cloud workspace runtime
3. preserve detach and reattach semantics for the TUI client
4. keep right-column workspace facts and actions bound to `host=cloud`

### Slice 5: right-column workspace binding

Make the host-bound scope visible in the TUI's workspace-side surfaces.

Responsibilities:

1. plumb `workspace.id` and `workspace.host` through the TUI app state
2. ensure right-column status, files, environment, and future actions are derived from the same bound workspace scope as the middle shell
3. show a small host badge or equivalent context marker so users can tell whether they are in `local`, `docker`, or `cloud`

## Documentation changes required with implementation

The repository currently has a mismatch:

1. the desktop reference docs say the terminal runtime path was removed from the app shell
2. the checked-in TUI still embeds a live PTY and is becoming more terminal-capable

When the tmux-backed TUI contract ships, update the relevant docs in the same change so the repo clearly distinguishes:

1. desktop app terminal/runtime contracts
2. TUI shell contracts
3. host-bound attach semantics for local, docker, and cloud workspaces

## Verification scenarios

### Local

1. Start a long-running command in a local workspace tmux session, close the historical standalone TUI, reopen it, and confirm the process survived.
2. Split the tmux session in the middle column and confirm Lifecycle outer-column resize still produces correct terminal resizing.
3. Confirm explicit kill ends the tmux session while normal exit detaches.

### Docker

1. Open a docker workspace in the TUI and confirm the middle shell attaches to docker-hosted context, not the local machine shell.
2. Confirm right-column file/environment actions read docker-bound workspace facts.
3. Confirm docker tmux session names do not collide with local session names for the same workspace label.

### Cloud

1. Attach to a cloud workspace shell through the TUI and confirm tmux runs in the remote workspace.
2. Close the TUI and confirm the cloud session survives for later reattach.
3. Confirm right-column actions continue to target the cloud workspace authority.

## Non-goals

This plan does not include:

1. a Lifecycle-managed inner pane tree inside the TUI middle column
2. mirroring tmux panes into Lifecycle UI state
3. a silent compatibility layer that aliases unsupported hosts to local behavior
4. full tmux mouse mode support in the first delivery slice
