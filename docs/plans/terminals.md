# Plan: Terminals

> Status: active plan
> Depends on: [Architecture](../reference/architecture.md), [TUI](../reference/tui.md), [CLI](./cli.md)
> Plan index: [docs/plans/README.md](./README.md)

This document owns the terminal runtime contract across local and cloud workspaces.

It defines what a terminal is, who owns it, and how clients attach to it.

It does not treat terminals as a special feature for richer clients. Terminals are a core product surface.

## Goal

Lifecycle should have one terminal model across the product:

1. the CLI can attach to terminals
2. the TUI can render terminals
3. native and web clients can render terminals
4. cloud and local hosts expose the same terminal runtime concepts

`workspace shell` remains the convenience entry point, but it should attach to the workspace's default terminal rather than representing a separate product model forever.

## Product Contract

1. Every interactive workspace can expose a terminal runtime.
2. A terminal is a first-class runtime object inside a workspace.
3. Terminal ids are stable within a workspace runtime.
4. Terminal connections are ephemeral and client-scoped.
5. Closing a client detaches; terminal persistence follows host/runtime policy.
6. tmux may back persistence today, but tmux is not the public contract.

## Core Concepts

### Workspace terminal runtime

The bridge-owned runtime boundary that manages terminals for one workspace.

It owns:

1. listing terminals
2. creating terminals
3. attaching and detaching clients
4. closing terminals
5. choosing the underlying host transport

### Terminal

One interactive terminal inside a workspace runtime.

A terminal has:

1. a stable id
2. a title
3. a kind such as `shell`, `claude`, `codex`, or `custom`
4. runtime metadata such as busy/idle or closable/non-closable

### Terminal connection

An ephemeral client attachment to one terminal.

Connections are:

1. client-scoped
2. transport-specific
3. safe to drop and recreate after interruption

### Default terminal

The primary terminal for a workspace.

Rules:

1. `lifecycle workspace shell` attaches the default terminal
2. if the default terminal does not exist yet, the runtime may create it
3. creating additional terminals must not redefine what `workspace shell` means

### Terminal activity

Terminal activity is the bridge-owned derived runtime state for one terminal.

Terminal activity is terminal-scoped first and workspace-scoped second.

A terminal may be:

1. `idle`
2. `command_running`
3. `turn_active`
4. `tool_active`
5. `waiting`
6. `interactive_quiet`
7. `interactive_active`
8. `unknown`

Rules:

1. Terminal activity is attached to a stable terminal id.
2. Workspace activity is derived from the set of terminal activity records in that workspace.
3. A terminal may carry optional activity metadata such as `turnId`, `toolName`, `waitingKind`, `provider`, `source`, and timestamps.
4. `provider` is optional metadata, not a required routing key.

## Authority Split

### Bridge owns

1. terminal runtime discovery
2. terminal list/create/attach/detach/close
3. host-specific transport selection
4. terminal identity and metadata
5. persistence and reconnect semantics

### Client owns

1. rendering
2. focus
3. layout
4. tab order
5. which visible surfaces attach to which terminal ids

### Control plane owns

Only cloud routing and cloud workspace lifecycle.

It must not become the terminal authority when a workspace bridge exists.

## User-Facing Behavior

### CLI

The CLI should expose terminal operations as a first-class family:

1. `lifecycle terminal list`
2. `lifecycle terminal open`
3. `lifecycle terminal attach`
4. `lifecycle terminal close`
5. `lifecycle workspace shell` as the default-terminal shortcut

### TUI

The TUI center column renders one attached terminal surface.

Rules:

1. the TUI stays terminal-first
2. the TUI should not own host-specific terminal lifecycle logic
3. over time, the TUI should consume the same terminal runtime contract instead of a permanently separate shell model

### Native and web clients

Native and web clients may render multiple terminals, but they should use the same terminal runtime model and the same bridge-owned terminal ids.

## Runtime API Shape

Semantic operations:

1. `workspace.terminal.list`
2. `workspace.terminal.create`
3. `workspace.terminal.connect`
4. `workspace.terminal.disconnect`
5. `workspace.terminal.close`
6. `workspace.activity.get`
7. `workspace.activity.emit`

Required response concepts:

1. runtime metadata
2. terminal record metadata
3. connection id
4. transport description
5. terminal activity records
6. workspace-level derived activity
7. typed launch/attach/activity errors

## Activity Signals

Activity signals come from multiple sources with different confidence levels.

Authoritative sources:

1. explicit activity events emitted from inside a Lifecycle-managed terminal, usually by harness hooks calling `lifecycle workspace activity emit`
2. shell integration markers such as OSC 133 for command start and prompt return

Fallback sources:

1. foreground process identity
2. recent terminal output
3. host/runtime-specific transport fallbacks

Rules:

1. Explicit activity events outrank shell integration and all heuristics.
2. Shell command lifecycle and harness turn lifecycle are separate signal classes and should not be collapsed at ingestion time.
3. `workspace_id` and `terminal_id` are the routing keys for explicit activity events.
4. `turn_id` is optional metadata. When it is absent, the reducer assumes at most one explicit turn per terminal.
5. If a terminal is not Lifecycle-managed and cannot resolve both ids, explicit activity emission should fail instead of guessing.

## Activity Reducer Rules

The bridge owns the reducer that turns activity signals into terminal activity state.

Precedence order:

1. `waiting` from explicit `waiting.started` / `waiting.completed`
2. `tool_active` from explicit `tool.started` / `tool.completed`
3. `turn_active` from explicit `turn.started` / `turn.completed`
4. `command_running` from shell integration command start / finish
5. `interactive_active` when a known interactive harness process is in the foreground and output is recent
6. `interactive_quiet` when a known interactive harness process is in the foreground but output has gone quiet
7. `idle` when no stronger signal remains

Reducer rules:

1. Explicit completion events clear the matching explicit state on that terminal.
2. Duplicate explicit start events refresh timestamps and metadata rather than creating parallel terminal states.
3. `waiting` is sticky until an explicit completion event or terminal exit clears it.
4. `interactive_active` decays to `interactive_quiet` after a short no-output timeout.
5. Terminal exit clears terminal-scoped activity state and removes stale explicit turn or tool records for that terminal.
6. Workspace-level busy state is derived from its terminals rather than written independently.

## Activity Event Contract

`lifecycle workspace activity emit` is the user-facing CLI surface for explicit terminal activity signals.

The target event vocabulary is:

1. `turn.started`
2. `turn.completed`
3. `tool.started`
4. `tool.completed`
5. `waiting.started`
6. `waiting.completed`

The command resolves `LIFECYCLE_WORKSPACE_ID` and `LIFECYCLE_TERMINAL_ID` from the terminal session by default and only needs explicit workspace or terminal overrides for tests and debugging.

Optional event fields:

1. `turnId`
2. `name` for tool names such as `Bash`
3. `kind` for waiting kinds such as `approval`
4. `provider`
5. `metadata`

The bridge read surface should return one terminal activity record per terminal plus a workspace-derived aggregate view.

## Transport Rule

The terminal runtime contract must stay transport-neutral.

Rules:

1. clients ask to attach to a terminal, not to spawn tmux directly
2. the bridge chooses the concrete transport
3. transports may be `spawn`, `stream`, or another bridge-defined variant later
4. clients must not infer runtime semantics from the underlying executable

## Host Mapping

All hosts use the same terminal concepts:

1. `local`
2. `docker`
3. `remote`
4. `cloud`

Rules:

1. each host has its own authoritative terminal runtime path
2. docker terminals must not silently alias into the local host namespace
3. cloud terminals live in the cloud workspace runtime, not on the caller's machine
4. tmux is an implementation detail that current hosts may use for persistence

## Current Migration Direction

Today, some clients still rely on a thinner `workspace shell` contract or direct tmux assumptions.

The target direction is:

1. keep `workspace shell` as a stable user-facing convenience command
2. make `workspace shell` attach the default terminal from the terminal runtime
3. move host-specific tmux logic fully behind the bridge/workspace client boundary
4. stop letting any client manage tmux windows or sessions directly

## Explicit Non-Goals

This plan does not require:

1. exposing tmux as a public API
2. replacing tmux immediately
3. a shared multi-user typing model
4. durable terminal transcript storage in the control plane
5. a client-specific terminal model for desktop versus web versus TUI
6. redefining `workspace shell` as window management or app navigation

## Exit Gate

This plan is successful when all of the following are true:

1. local and cloud workspaces expose the same terminal runtime concepts
2. `workspace shell` and `terminal attach` compose cleanly around one terminal model
3. the bridge exposes terminal list/create/connect/close without leaking tmux details
4. no client manages tmux directly
5. TUI, CLI, and richer clients can all be described in terms of the same terminal runtime contract

## Test Scenarios

```text
workspace shell -> attaches the default terminal for the selected workspace
terminal list --json -> returns stable terminal records for the workspace
terminal open --kind shell -> creates a second terminal in the same workspace runtime
terminal attach <terminal> -> attaches without exposing host-specific transport details
terminal close <terminal> -> closes the selected terminal without affecting unrelated terminals
client disconnect -> reconnect -> terminal remains available when host persistence policy says it should
local workspace and cloud workspace -> expose the same runtime/terminal/connection concepts
```
