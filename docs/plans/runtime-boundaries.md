# Plan: Runtime Boundaries

> Status: active execution plan
> Plan index: [docs/plans/README.md](./README.md)

## Goal

Make the package graph match the bridge-first architecture.

Clients should have one runtime authority surface: the bridge. Runtime engines and host adapters should live below that boundary. Shared schemas should live in `contracts`. Packages that are neither shared boundaries nor clear subsystem boundaries should be collapsed.

## Target Boundaries

### `packages/contracts`

Owns durable shared nouns and wire payloads only.

Examples:

1. workspace, service, repository, and organization records
2. agent session, agent message, and agent event records
3. request/response payloads shared across bridge, control plane, CLI, TUI, and native clients
4. stable enums, state values, and typed error codes

Non-goals:

1. provider logic
2. tmux logic
3. process supervision
4. DB access
5. bridge authority logic

### `packages/workspace`

Owns host-local execution adapters.

Examples:

1. `WorkspaceClient`
2. local, docker, remote, and cloud host adapters
3. shell attach and terminal runtime primitives
4. file, git, exec, and tmux helpers that execute on a host

Non-goals:

1. bridge routing
2. DB persistence
3. websocket fanout
4. product authority

### `packages/bridge`

Owns runtime authority.

Examples:

1. route handlers
2. authority lookup and forwarding
3. DB-backed runtime coordination
4. websocket event streaming
5. `agents`, `stack`, `services`, `git`, `terminals`, and `activity` authorities

Rule:

1. if a client is doing runtime reads or mutations, it should be talking to bridge

### `packages/cli`

Owns command parsing, command help, and output formatting.

Rule:

1. CLI commands should talk to bridge or control plane
2. CLI commands should not import runtime implementation internals directly

### `apps/tui` and `apps/desktop-mac`

Own presentation only.

Rule:

1. UI state lives here
2. runtime authority does not

## Package Decisions

### Keep

1. `contracts`
2. `db`
3. `workspace`
4. `bridge`
5. `cli`
6. app surfaces

### Collapse

#### `stack`

`stack` should stop being a client-facing package.

Target:

1. move stack authority into `packages/bridge/src/stack`
2. keep only truly host-local helpers in `packages/workspace` if they still need a separate home
3. delete the `packages/stack` package once no active surface imports it directly

#### `agents`

`agents` should stop being a top-level app-facing package.

Target:

1. move durable records and event schemas into `contracts`
2. move bridge-owned runtime/provider logic into `packages/bridge/src/agents`
3. delete the `packages/agents` package once bridge is the only authority path and no active surface imports it directly

## Current Mismatches

These are the concrete code paths that still violate the target model:

1. bridge still imports `@lifecycle/stack` as a package-level authority dependency instead of owning `stack` under `packages/bridge/src/stack`
2. agent/provider runtime logic still lives in `packages/agents` even though bridge owns session authority
3. several CLI commands still use the old desktop RPC path instead of bridge, especially `context`, `plan *`, `task *`, `tab open`, `workspace destroy`, `workspace health`, and `workspace reset`
4. CLI auth/catalog/worker commands still import `@lifecycle/agents` internals directly instead of talking to a bridge-owned agent authority surface

## Migration Order

1. Create `packages/bridge/src/stack` and migrate stack authority code there
2. Reduce `packages/stack` to host-local runtime helpers only
3. Move remaining runtime-facing CLI commands off desktop RPC and onto bridge
4. Move durable agent records and schemas into `contracts`
5. Keep migrating bridge-owned agent runtime code into `packages/bridge/src/agents`
6. Move CLI auth/catalog/worker flows behind bridge-owned agent routes where they should be authority-backed
7. Delete `packages/stack` once no active consumer imports it
8. Delete `packages/agents` once no active consumer imports it

## Exit Gate

This plan is done when:

1. active clients only talk to bridge for runtime work
2. `contracts` holds the stable cross-boundary records
3. `workspace` holds host execution adapters only
4. bridge owns runtime authority for `agents`, `stack`, `services`, `git`, and `terminals`
5. `packages/stack` and `packages/agents` are either gone or reduced to boundaries that are still clearly justified
