# Plan: Terminal Runtime

> Status: in progress
> Depends on: [architecture](../reference/architecture.md), [tui](../reference/tui.md), [canvas](../reference/canvas.md), [local-cli](./local-cli.md)
> Plan index: [docs/plans/README.md](./README.md)
> Current execution focus: not the primary repo lane. This plan matters when richer clients such as `desktop-mac` and future web clients need first-class terminal state without breaking the existing shell-first CLI/TUI contract.

Shared workspace-client types and bridge routes now exist for `list/create/connect/disconnect/close` across local and cloud tmux-backed hosts. Rich clients still need to migrate off the older `workspace shell`-driven terminal behavior onto this runtime.

## Goal

Introduce a first-class terminal runtime contract for richer clients while preserving the existing `workspace shell` contract for shell-first clients.

The result should be:

1. TUI and `lifecycle workspace shell` keep using `workspace shell`
2. richer clients such as `desktop-mac` and web use a new bridge-owned terminal runtime
3. host-specific tmux logic moves behind `packages/workspace`
4. canvas clients treat terminals as opaque runtime-bound records, not as direct tmux implementations

## Problem

Today the shared contract is coherent, but it is intentionally thin.

`workspace shell` currently means:

1. resolve one workspace scope
2. return one optional prepare step
3. return one interactive launch spec
4. optionally name one persistent tmux session

That is correct for:

1. `lifecycle workspace shell`
2. the TUI center column
3. any client that wants one attached shell surface

It is not strong enough for richer clients that need:

1. multiple terminal tabs per workspace
2. simultaneous visible terminal surfaces
3. isolated connection semantics per visible surface
4. stable terminal identity for canvas surfaces
5. host-independent terminal operations that do not leak tmux into client code

The current failure mode in `desktop-mac` follows directly from that mismatch: the app is forced to reinterpret `workspace shell` into a terminal-window-management layer that the bridge never promised.

## Design Principle

Do not replace `workspace shell`.

Instead, define two adjacent but distinct contracts:

1. `workspace shell` for shell-first clients
2. `workspace terminal runtime` for richer clients

`workspace shell` remains the lowest-level interactive primitive.

`workspace terminal runtime` becomes the richer terminal authority that powers:

1. canvas terminal tabs
2. terminal splits across groups
3. future web terminal panels
4. desktop/browser reopen, restore, and drag/drop flows

## Layered Model

### 1. Workspace shell

This remains exactly what it is today:

1. one workspace-scoped shell attach path
2. one scope
3. one prepare step
4. one interactive attach step

Use it for:

1. TUI
2. `lifecycle workspace shell`
3. any shell-first workflow where tmux may own inner panes and windows

### 2. Terminal runtime

This is the new richer runtime boundary.

One workspace may have one terminal runtime for interactive terminals.

That runtime exposes first-class terminal records and terminal connections.

Use it for:

1. `desktop-mac`
2. future web clients
3. desktop-shell CLI commands such as `tab open --surface terminal`

### 3. Canvas

Canvas remains purely client state.

It owns:

1. groups
2. surfaces
3. layout
4. active surface selection
5. drag/drop placement

Canvas does not own:

1. tmux session naming
2. tmux window creation
3. connection command synthesis
4. host transport selection

Terminal surfaces bind to terminal ids returned by the terminal runtime.

## Canonical Terms

This plan introduces planned terms. Do not promote them into `docs/reference/vocabulary.md` until they ship.

### Workspace terminal runtime

The authoritative bridge-owned runtime for interactive terminals in one workspace.

It is host-aware and may be backed by:

1. local tmux
2. remote tmux over SSH
3. cloud tmux in a workspace runtime
4. another provider-specific implementation later

### Terminal session

The persistent runtime substrate for terminals in one workspace.

Today, for tmux-backed hosts, this maps to one tmux session per workspace.

Clients must not assume tmux.

### Terminal

A first-class terminal record inside the terminal session.

Today, for tmux-backed hosts, this maps to one tmux window.

Clients receive a stable terminal id and metadata, not tmux syntax.

### Terminal connection

An ephemeral, client-scoped way to connect one renderer to one terminal.

Connections are not canvas state and are not durable records.

They exist to support:

1. per-client isolation
2. reconnect after interruption
3. host-specific connection transports
4. cleanup of per-connection runtime resources

### Terminal surface

A client-side surface whose runtime binding is one terminal id.

Many surface behaviors are client-local:

1. tab order
2. group membership
3. active group
4. drag/drop placement

The terminal record stays bridge-owned.

## Authority Split

### Bridge / workspace client owns

1. resolving whether the workspace supports a terminal runtime
2. ensuring the backing terminal session exists
3. listing authoritative terminals
4. creating and closing terminals
5. connecting and disconnecting client renderers
6. host-specific transport and isolation strategy
7. activity/title metadata derived from the runtime substrate

### Rich client owns

1. canvas groups and surfaces
2. group tab order
3. group layout
4. which surface is active
5. mapping a surface to a terminal id
6. choosing when to connect visible surfaces

### TUI owns

1. one center shell surface
2. PTY rendering
3. outer chrome and focus

The TUI does not need terminal runtime APIs for V1.

## Why TUI Stays Different

The TUI is intentionally shell-first.

Its center column is one shell surface from Lifecycle's point of view. If tmux is active, tmux owns the inner window and pane model.

That is still correct.

The richer terminal runtime exists because `desktop-mac` and web clients need Lifecycle to model terminal records explicitly rather than delegating everything to an inner tmux UI.

So the contract split is:

1. TUI: `workspace shell`
2. rich clients: `workspace terminal runtime`

Those are complementary, not conflicting.

## Runtime API Shape

### Workspace client interface

Add a terminal runtime surface to `packages/workspace`.

Suggested types:

```ts
export interface ResolveWorkspaceTerminalRuntimeInput {
  cwd?: string | null
  sessionName?: string | null
  syncEnvironment?: string[]
}

export interface WorkspaceTerminalRuntime {
  backendLabel: string
  runtimeId: string | null
  launchError: string | null
  persistent: boolean
  supportsCreate: boolean
  supportsClose: boolean
  supportsConnect: boolean
  supportsRename: boolean
}

export interface WorkspaceTerminalRecord {
  id: string
  title: string
  kind: "shell" | "claude" | "codex" | "custom"
  busy: boolean
  closable: boolean
}

export interface WorkspaceTerminalConnectionInput {
  terminalId: string
  clientId: string
  access: "interactive" | "observe"
  preferredTransport: "spawn" | "stream"
}

export type WorkspaceTerminalTransport =
  | {
      kind: "spawn"
      prepare: WorkspaceShellLaunchSpec | null
      spec: WorkspaceShellLaunchSpec | null
    }
  | {
      kind: "stream"
      streamId: string
      websocketPath: string
      token: string
      protocol: "vt"
    }

export interface WorkspaceTerminalConnection {
  connectionId: string
  terminalId: string
  transport: WorkspaceTerminalTransport | null
  launchError: string | null
}
```

Suggested methods on `WorkspaceClient`:

```ts
resolveTerminalRuntime(
  workspace: WorkspaceRecord,
  input?: ResolveWorkspaceTerminalRuntimeInput,
): Promise<WorkspaceTerminalRuntime>

listTerminals(
  workspace: WorkspaceRecord,
  input?: ResolveWorkspaceTerminalRuntimeInput,
): Promise<WorkspaceTerminalRecord[]>

createTerminal(
  workspace: WorkspaceRecord,
  input?: ResolveWorkspaceTerminalRuntimeInput & {
    kind?: "shell" | "claude" | "codex"
    title?: string | null
  },
): Promise<WorkspaceTerminalRecord>

closeTerminal(
  workspace: WorkspaceRecord,
  terminalId: string,
): Promise<void>

connectTerminal(
  workspace: WorkspaceRecord,
  input: WorkspaceTerminalConnectionInput & ResolveWorkspaceTerminalRuntimeInput,
): Promise<WorkspaceTerminalConnection>

disconnectTerminal(
  workspace: WorkspaceRecord,
  connectionId: string,
): Promise<void>
```

## Bridge API Shape

Keep `workspace shell` unchanged.

Add a new family of workspace terminal operations.

Semantic operation names:

1. `workspace.terminal.list`
2. `workspace.terminal.create`
3. `workspace.terminal.connect`
4. `workspace.terminal.disconnect`
5. `workspace.terminal.close`

Suggested HTTP routes:

1. `GET /workspaces/:id/terminals`
2. `POST /workspaces/:id/terminals`
3. `GET /workspaces/:id/terminals/:terminalId`
4. `DELETE /workspaces/:id/terminals/:terminalId`
5. `POST /workspaces/:id/terminals/:terminalId/connections`
6. `DELETE /workspaces/:id/terminals/:terminalId/connections/:connectionId`

Suggested `list` response shape:

```json
{
  "workspace": { "...": "same scope shape as workspace shell" },
  "runtime": {
    "backend_label": "local tmux",
    "runtime_id": "rtm_ws_123",
    "launch_error": null,
    "persistent": true,
    "supports_create": true,
    "supports_close": true,
    "supports_connect": true,
    "supports_rename": false
  },
  "terminals": [
    {
      "id": "term_123",
      "title": "shell",
      "kind": "shell",
      "busy": false,
      "closable": false
    }
  ]
}
```

Suggested `connect` response shape:

```json
{
  "connection_id": "conn_123",
  "terminal_id": "term_123",
  "launch_error": null,
  "transport": {
    "kind": "spawn",
    "prepare": null,
    "spec": {
      "program": "tmux",
      "args": ["..."],
      "cwd": "/workspace",
      "env": [["TERM", "xterm-256color"]]
    }
  }
}
```

## Transport Rule

The terminal runtime contract must be transport-neutral.

That is the key design change.

`workspace shell` is currently spawn-spec-oriented because the CLI and TUI can directly spawn local or SSH-backed processes.

Richer clients cannot all do that in the same way:

1. web wants a streamed terminal transport
2. `desktop-mac` may want spawn today for Ghostty
3. a future native/web renderer may prefer bridge-streamed PTY data instead

Therefore `connect` must return a transport variant, not assume one launch model.

### V1 recommendation

Support both transport families in the contract, but only require one per host/client pairing:

1. `spawn` for local native clients that can embed a terminal host backed by a child process
2. `stream` for browser clients and any native client that wants bridge-proxied PTY IO

The bridge chooses the concrete host strategy. Clients choose only a preferred transport.

## Isolation Rule

Terminal connections must be isolated by contract.

That means:

1. connecting terminal `term_123` for client surface `A` must not accidentally redirect input from surface `B`
2. clients must not synthesize connection commands locally
3. clients must not infer isolation policy from `spec.program`

For tmux-backed hosts, the implementation may use:

1. grouped tmux sessions
2. control mode proxies
3. another isolation mechanism

The bridge owns that choice.

Rich clients should not know or care which isolation technique is used.

## Host Mapping

### Local

Recommended V1 mapping:

1. terminal session -> local tmux session
2. terminal -> tmux window id
3. `list` -> `tmux list-windows`
4. `create` -> `tmux new-window`
5. `close` -> `tmux kill-window`
6. `connect` -> isolated connection path chosen by the bridge

### Cloud

Recommended V1 mapping:

1. terminal session -> remote tmux session in the workspace runtime
2. terminal -> remote tmux window id
3. `list/create/close` -> host-aware remote execution through the cloud workspace client
4. `connect` -> either SSH-backed spawn spec or bridge-proxied stream transport

### Docker

Same model as local/cloud, but docker remains a distinct host with its own authoritative runtime path.

Do not alias docker terminals to the local host's tmux namespace.

### Remote

Same model as cloud, but backed by the remote host's authoritative connection path.

## Client Rules

### TUI

1. keep using `workspace shell`
2. do not adopt terminal runtime APIs in V1
3. continue treating inner tmux structure as tmux-owned

### Desktop-mac

1. load terminal list from bridge
2. bind terminal surfaces to terminal ids, not tmux window ids
3. call `connectTerminal` for visible terminal surfaces
4. call `disconnectTerminal` when a visible surface unmounts
5. call `createTerminal` and `closeTerminal` instead of managing tmux directly
6. never derive host transport from `spec.program`

### Web

1. load terminal list from bridge
2. create and close terminals through bridge operations
3. connect through `stream` transport in V1
4. treat the terminal as a first-class runtime record separate from canvas layout

## Canvas Binding Rule

The canvas data model stays:

1. `canvas`
2. `group`
3. `surface`

Terminal surfaces bind like this:

```ts
Surface {
  id: "surface_123"
  kind: "terminal"
  binding: {
    terminalId: "term_123"
  }
}
```

This preserves the right ownership split:

1. runtime owns terminals
2. canvas owns surfaces
3. one surface usually binds to one terminal
4. moving a surface between groups does not change terminal identity

## CLI Relationship

The existing local CLI plan already points toward richer terminal concepts in desktop-shell flows.

Once terminal runtime exists, desktop-shell CLI commands should route through it instead of going through app-local tmux assumptions.

Examples:

1. `lifecycle tab open --surface terminal` -> create or focus a terminal record, then open a client surface bound to it
2. `lifecycle context` -> may include bridge-reported terminal facts when a rich client is present

`lifecycle workspace shell` should remain the lower-level shell primitive and should not be redefined to mean "open a rich terminal tab".

## Migration Plan

### Phase 1: Interface

1. add terminal runtime types to `packages/workspace`
2. keep `resolveShellRuntime` unchanged
3. add tests for local/cloud terminal runtime behavior

### Phase 2: Bridge

1. add `workspace.terminal.*` routes
2. keep `workspace.shell` unchanged
3. expose stable terminal ids and connection ids

### Phase 3: Desktop-mac

1. remove direct tmux window management from the app
2. bind canvas surfaces to terminal ids
3. connect and disconnect through bridge operations
4. stop synthesizing connection commands from `workspace shell`

### Phase 4: Web

1. add browser terminal panels against `workspace.terminal.*`
2. use stream transport for connect

### Phase 5: Optional TUI follow-up

Keep TUI on `workspace shell` unless there is a strong reason to unify later.

Unification is optional, not a requirement for shipping richer clients.

## Explicit Non-Goals

This plan does not require:

1. replacing tmux immediately
2. making the TUI tab-aware
3. shared multi-user interactive typing into the same terminal
4. streaming raw terminal scrollback into D1 or the control plane as durable product data
5. changing the canvas model away from `canvas > group > surface`

## V1 Decisions

To keep the first version coherent, make these decisions up front:

1. `workspace shell` stays as-is
2. richer clients use `workspace terminal runtime`
3. terminal ids are opaque and stable within the runtime
4. tmux stays the substrate for local/cloud interactive persistence
5. terminal connection isolation is bridge-owned
6. `desktop-mac` must stop managing tmux directly

## Exit Gate

This plan is successful when all of the following are true:

1. local and cloud workspace clients expose the same terminal runtime interface
2. bridge routes expose terminal list/create/connect/close without leaking tmux details
3. `desktop-mac` no longer lists or mutates tmux windows directly
4. web can render a first terminal panel against the same bridge terminal contract
5. TUI still works unchanged through `workspace shell`
