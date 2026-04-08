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

Required response concepts:

1. runtime metadata
2. terminal record metadata
3. connection id
4. transport description
5. typed launch/attach errors

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
