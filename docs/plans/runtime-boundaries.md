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

### `packages/bridge/src/workspace`

Owns host-local execution adapters below the bridge authority boundary.

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
6. dispatch into `src/workspace` host adapters

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
3. `bridge`
4. `cli`
5. app surfaces

### Collapse

#### `stack`

`stack` is now bridge-owned runtime code.

Result:

1. stack authority lives in `packages/bridge/src/stack`
2. `packages/bridge/src/workspace` stays focused on host execution adapters
3. the standalone `packages/stack` package is gone

#### `agents`

`agents` should stop being a top-level app-facing package.

Target:

1. move durable records and event schemas into `contracts`
2. move bridge-owned runtime/provider logic into `packages/bridge/src/agents`
3. delete the `packages/agents` package once bridge is the only authority path and no active surface imports it directly

## Current Mismatches

These are the concrete code paths that still violate the target model:

1. agent/provider runtime logic still lives in `packages/agents` even though bridge owns session authority
2. several CLI commands still use the old desktop RPC path instead of bridge, especially `context`, `plan *`, `task *`, and `tab open`
3. CLI auth/catalog/worker commands still import `@lifecycle/agents` internals directly instead of talking to a bridge-owned agent authority surface

## Bridge Capability Inventory

The current bridge package owns more than one concern. This is the inventory of behavior that currently lives under `packages/bridge`.

### Process and bootstrap

1. process startup and shutdown (`src/app.ts`, `src/server.ts`)
2. bridge registration and discovery (`src/registration.ts`, `src/ensure.ts`)
3. runtime-root path resolution (`src/runtime-paths.ts`)
4. development bootstrap and default repository seeding (`src/dev-bootstrap.ts`)

### Transport surface

1. HTTP routing and OpenAPI export (`src/http/*`, `routes/*`, `openapi.json`)
2. WebSocket connection lifecycle, topic subscription, and fanout (`src/server.ts`)
3. health surface (`routes/health.get.route.ts`)

Contract note:

1. `packages/bridge/openapi.json` is the canonical generated bridge spec.
2. The bridge serves the same contract at `GET /openapi.json`.
3. Generated clients should point at that bridge-owned artifact, not a second copied spec file.

### Local bridge platform services

1. settings read/write and legacy settings migration (`src/settings.ts`)
2. local credential storage and refresh (`src/credentials.ts`, `src/control-plane.ts`)
3. control-plane client construction and authenticated passthrough (`src/control-plane.ts`, `src/control-plane-url.ts`)
4. local profile discovery (`src/git-profile.ts`)
5. preview proxy install and uninstall (`src/proxy/install.ts`)

### Workspace and host runtime

1. workspace host adapter contract (`src/workspace/host.ts`)
2. local and cloud host adapters plus tmux helpers (`src/workspace/hosts/*`)
3. manifest loading and workspace naming/archive policy (`src/workspace/manifest.ts`, `src/workspace/policy/*`)
4. workspace create and archive authority (`src/workspace/provision.ts`)
5. workspace record and scope resolution (`src/workspace/resolve.ts`)
6. workspace shell and terminal authority (`src/workspace/terminals.ts`)
7. workspace activity state and event projection (`src/workspace/activity.ts`)
8. workspace stack authority (`src/workspace/stack.ts`)
9. workspace log reads (`src/workspace/logs.ts`)
10. git reads and mutations via host adapters (`routes/workspaces/$id/git*.route.ts`)

### Stack runtime engine

1. dependency graph lowering and ordering (`src/stack/graph.ts`)
2. local process and image service startup (`src/stack/clients/local/client.ts`)
3. process supervision (`src/stack/supervisor.ts`)
4. port assignment, runtime env expansion, preview host naming (`src/stack/ports.ts`, `src/stack/runtime.ts`)
5. stack runtime-state persistence and log path helpers (`src/stack/runtime-state.ts`, `src/stack/logs/*`)
6. health checks (`src/stack/health.ts`)

### Agent runtime authority

1. agent route surface and websocket event projection (`routes/agents*`, `src/agents/events.ts`)
2. agent lifecycle coordination and persistence (`src/agents/manager.ts`, `src/agents/persistence.ts`)
3. provider child-process launch and direct handle transport (`src/agents/process.ts`, `src/agents/handle.ts`, `src/agents/worker.ts`)
4. provider auth checks and login flows (`src/agents/provider-auth.ts`)

### Control-plane passthrough endpoints currently hosted by bridge

1. auth device-code, token, refresh, and auth state routes
2. organizations and cloud account routes
3. repo link route
4. cloud workspace list, shell GET, exec, PR create, PR merge, and user environment sync routes

## Bridge Structural Failures

These are the bridge-internal problems that should drive the reorganization work.

1. Bridge internals are not split by real product domains. The code currently sprawls across root files, `src/workspace`, `src/stack`, and `src/agents` instead of having one obvious home for auth, workspace management, stack management, and terminal management.
2. `src/server.ts` is a god-object composition root. It owns singleton service lookup, process arbitration, WebSocket fanout, local/cloud host wiring, preview proxy startup, bridge registration shutdown, and agent-manager boot.
3. The default local host wiring is contract-incomplete. `LocalWorkspaceHost` exposes file and git operations such as `read_file`, `get_git_status`, `list_git_log`, `commit_git`, and `push_git`, but the server wires it to `invokeLocalWorkspaceCommand`, which only implements worktree management commands. Routes like `workspaces/$id/git.get` and `workspaces/$id/git/commit.post` therefore depend on methods the default local runtime does not actually provide.
4. The cloud host adapter only implements shell and tmux-terminal behavior. Shared routes such as `workspaces/$id.get` and the stack/growth of git-style workspace routes still assume every host implements manifest, stack, file, and git capabilities.
5. Bridge runtime state is scattered across incompatible storage roots. Registration and workspace activity use `LIFECYCLE_RUNTIME_ROOT`, stack runtime state uses `LIFECYCLE_ROOT`, settings use `LIFECYCLE_ROOT`, and credentials always write directly to `~/.lifecycle`.
6. The route layer duplicates response schemas instead of sharing bridge response models. `workspaceScopeSchema`, terminal runtime schemas, terminal record schemas, stack node schemas, and agent record schemas are repeated across multiple route files.
7. Bridge package exports are broader than the intended authority boundary. `package.json` currently exports `./workspace`, `./workspace/host`, `./workspace/hosts/*`, `./stack`, `./runtime-paths`, and `./server`, which encourages consumers to depend on internal structure instead of a narrower bridge client/server boundary.
8. Control-plane passthrough and workspace runtime authority sit side by side with no explicit boundary. Routes for auth, orgs, and cloud workspace passthrough live next to host-runtime routes without a clear distinction between bridge-owned authority and proxy-owned surfaces.

## Bridge Internal Target

The core split should be:

1. `src/domains` for bridge business logic
2. `src/lib` for shared mechanics and support code

Within `src/domains`, the bridge should reflect the few product areas it actually owns: auth, workspace management, stack management, and terminal management. Agent session code should not define the architecture. While it still lives in bridge, it should sit under workspace management because agents are workspace-scoped.

```text
packages/bridge/src/
  app.ts                   # process entrypoint
  domains/
    auth/
      service.ts           # auth, orgs, repo-link, env sync, settings reads
      schemas.ts
    workspace/
      service.ts           # create/get/list/archive/resolve/git/logs/activity
      host.ts
      registry.ts
      local-host.ts
      local-invoke.ts
      cloud-host.ts
      manifest.ts
      agents.ts            # temporary workspace-scoped agent entrypoint
      policy/*
      schemas.ts
    terminal/
      service.ts           # shell + terminals + connections
      tmux.ts
      tmux-runtime.ts
      schemas.ts
    stack/
      service.ts           # stack reads/start/stop/reset/health
      engine.ts            # local stack runner
      graph.ts
      runtime.ts
      runtime-state.ts
      ports.ts
      health.ts
      supervisor.ts
      preview.ts
      schemas.ts
  lib/
    server.ts              # Bun server + websocket lifecycle
    http.ts                # hono app wiring + error mapping
    routes/
      auth/*
      workspaces/*
      terminals/*
      stacks/*
      agents/*
    control-plane.ts
    credentials.ts
    settings.ts
    errors.ts
    registration.ts
    ensure.ts
    runtime-paths.ts
```

### Placement rules

1. `src/domains/*` is the only place for bridge business logic.
2. `src/lib/*` is the only place for transport, persistence helpers, bootstrap glue, and cross-domain support code.
3. No `authority.ts` files. Use domain names like `service.ts`, `local-host.ts`, `preview.ts`, or `runtime-state.ts`.
4. `domains/workspace` owns git, logs, activity, host adapters, and temporary workspace-scoped agent logic because those all hang off a workspace.
5. `domains/terminal` is only shell and terminal orchestration.
6. `domains/stack` owns preview routing because preview hosts derive from stack runtime state.
7. Do not add more top-level concepts than `domains` and `lib`.
8. Do not introduce more nested folders unless a domain is already too large to stay readable.

## Bridge Migration Slices

1. Create `src/domains` and `src/lib` first. That is the structural cut.
2. Move current bridge code into the four real domains:
   - auth + control-plane passthrough -> `domains/auth/*`
   - workspace create/archive/resolve/git/logs/activity/hosts -> `domains/workspace/*`
   - shell and terminals -> `domains/terminal/*`
   - stack start/stop/reset/health/preview -> `domains/stack/*`
3. Keep shared server, routing, settings, credentials, registration, and bridge startup code under `src/lib/*`.
4. Treat agent session code as workspace-scoped for now and move its entrypoint under `domains/workspace/agents.ts` or a nearby workspace-owned file, even if some runtime helpers still remain grouped together during migration.
5. Fix the local-host invoke mismatch before broader cleanup so the default bridge wiring matches the adapter contract.
6. Replace duplicated route schemas with one schema file per domain, not per route.
7. Narrow package exports once the `domains` / `lib` split is stable.

## Migration Order

1. Move remaining runtime-facing CLI commands off desktop RPC and onto bridge
2. Move durable agent records and schemas into `contracts`
3. Keep migrating bridge-owned agent runtime code into `packages/bridge/src/agents`
4. Move CLI auth/catalog/worker flows behind bridge-owned agent routes where they should be authority-backed
5. Delete `packages/agents` once no active consumer imports it

## Exit Gate

This plan is done when:

1. active clients only talk to bridge for runtime work
2. `contracts` holds the stable cross-boundary records
3. bridge internals are split into `src/domains` and `src/lib`
4. the main bridge business logic lives under the four real domains: auth, workspace, stack, terminal
5. `packages/agents` is either gone or reduced to a boundary that is still clearly justified
