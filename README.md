# Lifecycle

Lifecycle is a terminal-native workspace runtime for software teams. It manages development workspaces across local machines, containers, remote servers, and cloud sandboxes so the same shell, stack, and service graph can move cleanly from local work to cloud-hosted runtime.

`lifecycle.json` is the project contract. The `lifecycle` CLI is the primary control surface. The bridge is the workspace-host authority for clients. The control plane on Cloudflare Workers manages cloud workspaces, terminal routing, and a routable `opencode serve` endpoint for remote harnesses. Sandbox providers (`local`, `docker`, `remote`, `cloud`) run the same workspace contract everywhere.

## Status

Under active development. The current execution focus is:

1. **CLI and TUI** — workspace lifecycle, shell attach, tmux persistence, service graph operation
2. **Control plane** — Cloudflare Workers + Durable Objects + D1 for cloud workspace lifecycle and remote terminal/OpenCode routing
3. **Sandbox providers** — local (native), Docker, Daytona (remote/SSH), Modal (cloud)
4. **Terminal runtime** — host-aware shell attach, remote tmux continuity, and cloud runtime parity

Desktop and web surfaces are secondary unless they directly unblock the above.

## How It Works

### Interactive Mode

Shell into a workspace. Run `opencode`, `claude`, `codex`, or any tool in a tmux-backed terminal. Lifecycle manages the workspace and stays out of the way.

```bash
lifecycle project init
lifecycle workspace create
lifecycle stack run
lifecycle                        # tmux-backed shell — run opencode, claude, whatever
```

### Cloud Mode

Cloud workspaces can expose a routable `opencode serve` endpoint alongside the same shell/runtime contract. External harnesses connect to that endpoint while Lifecycle still owns the workspace, terminal, services, and host-aware execution.

```bash
# Control plane provisions sandbox, starts opencode serve, and routes clients to it
# Lifecycle still owns the shell, stack, files, health, and previews
# Harness companies keep owning chat UX, model routing, and approval semantics
```

Both modes share the same `lifecycle.json`, the same workspace environment, and the same CLI tools.

## Bridge-First Model

Lifecycle clients do not invent their own authority paths.

1. The CLI and TUI ask the bridge to read or mutate workspace state.
2. Clients address operations by workspace identity rather than resolving host placement themselves.
3. The bridge layer resolves the authoritative bridge for the workspace, and only that bridge executes runtime work.
4. The authoritative bridge owns shell attach, stack/service runtime control, git status, activity, and host-local execution.
5. When a request needs cloud or organization authority above the workspace runtime, the bridge calls the control plane.
6. When runtime state changes on the bridge side, the bridge streams lifecycle events over WebSocket and clients update UI state from those events. Routed OpenCode traffic is a secondary integration surface, not the primary UI model.
7. Clients stay thin. They own presentation state such as selection, focus, and layout. They do not shell out to fresh `lifecycle` subprocesses for core reads or mutations when the bridge is available.

## What Exists Today

1. **CLI** (`apps/cli`) — workspace lifecycle, stack/service commands, bridge launcher, shell/runtime control, context dump
2. **TUI** (`apps/tui`) — Rust terminal UI with tmux-backed shell attach, workspace sidebar, host-aware activity
3. **Bridge workspace runtime** (`apps/cli/src/bridge/domains/workspace`) — host-aware workspace client with `local`, `cloud`, `docker`, `remote` implementations
4. **Bridge stack runtime** (`apps/cli/src/bridge/domains/stack`) — process supervisor, graph lowering, health checks, logs, port management
5. **Contracts package** (`packages/contracts`) — shared domain types, manifest parsing, Zod validation
6. **DB package** (`packages/db`) — control-plane persistence (Turso/SQLite)
7. **API scaffold** (`apps/control-plane`) — Hono-based backend
8. **Bridge runtime** (`apps/cli/src/bridge`) — bridge runtime, authority routing, routes, registration, client bootstrap
9. **Native desktop app** (`apps/desktop-mac`) — Swift/AppKit client
10. **Landing page** (`apps/www`)

## CLI Interface

The CLI noun model:

```text
project   → project contract and lifecycle.json scaffold
workspace → concrete working instance of a project
stack     → live runnable graph inside a workspace
service   → one named node inside the stack
context   → aggregate machine-readable view for shells, tools, and harnesses
```

Key commands:

```bash
lifecycle project init                    # scaffold lifecycle.json
lifecycle proxy install                  # optional clean HTTP lifecycle.localhost routing
lifecycle workspace create                # materialize a workspace
lifecycle workspace prepare               # bootstrap the environment
lifecycle workspace shell <workspace>     # attach a shell
lifecycle stack run                       # start the service graph
lifecycle stack status                    # service health dashboard
lifecycle service logs <service>          # stream service logs
lifecycle context --json                  # structured workspace/runtime dump
lifecycle                                 # launch the TUI
lifecycle pr create                       # create PR through control plane
```

## Architecture

Three tiers: clients, bridge, control plane, sandbox providers.

```text
Clients (CLI, TUI, integrations)
  → Bridge layer (workspace-id API + authority routing)
    → Authoritative bridge (workspace host + WebSocket event source)
      → Workspace runtime (tmux, git, files, stack)
      → Control Plane when org/cloud authority or routed OpenCode access is required
        → Sandbox Providers (local, docker, remote, cloud)
```

See [docs/reference/architecture.md](./docs/reference/architecture.md) for the full system design.

## Prerequisites

1. Bun `>=1.3.10`
2. Rust toolchain (`cargo`) for TUI builds
3. Optional: Docker for container-hosted workspaces
4. Optional: Daytona for remote workspaces
5. Optional: Modal for cloud sandboxes

## Quick Start

```bash
git clone https://github.com/localhost-inc/lifecycle.git
cd lifecycle
bun install
bun run qa
lifecycle proxy install --dry-run         # inspect machine-scoped preview routing changes
bun run dev   # desktop loop: bridge + control plane + desktop-mac
```

## Common Commands

From repo root:

1. `bun run format` — apply formatting
2. `bun run lint` — lint checks
3. `bun run typecheck` — type checks
4. `bun run test` — JS/TS tests
5. `bun run test:rust` — TUI Rust tests (`lifecycle-tui`)
6. `bun run qa` — full quality gate
7. `bun run build` — workspace builds
8. `bun run dev` — desktop loop: bridge, control plane, and `desktop-mac`
9. `bun run dev:desktop` — explicit desktop dev loop
10. `bun run dev:desktop:services` — bridge + control plane only, for Xcode/native debugging
11. `bun run dev:tui` — focused TUI dev loop
12. `bun run desktop:mac:xcode-env` — print the canonical Xcode Run environment for `desktop-mac`

## Repository Layout

```text
apps/
  cli/          lifecycle CLI + bundled bridge runtime (`apps/cli/src/bridge`)
  control-plane/ Hosted Hono control plane
  desktop-mac/  Native Swift desktop app
  tui/          Rust TUI — tmux-backed workspace shell
  www/          Landing page
packages/
  config/       Shared TypeScript config
  contracts/    Domain contracts, manifest parsing, validation
  db/           Control-plane persistence
  store/        Control-plane query/mutation layer
  ui/           Shared UI primitives
docs/
  reference/    Canonical contracts (architecture, vision, journey, TUI, shell, etc.)
  plans/        Execution plans (local CLI, cloud V1, sandbox providers)
  milestones/   Active milestone contracts
  archive/      Historical specs
AGENTS.md       Engineering playbook
```

## Documentation

1. [Docs Home](./docs/README.md) — where to start and how the docs tree is organized
2. [Architecture](./docs/reference/architecture.md) — system design, three tiers, sandbox providers
3. [Vision](./docs/reference/vision.md) — product direction and V1 boundaries
4. [Journey](./docs/reference/journey.md) — narrative from local terminal work to cloud-hosted runtime
5. [TUI](./docs/reference/tui.md) — terminal UI contract, shell attach, tmux model
6. [CLI](./docs/plans/cli.md) — CLI command contract
7. [Cloud](./docs/plans/cloud.md) — cloud delivery plan
8. [Vocabulary](./docs/reference/vocabulary.md) — canonical terms
9. [AGENTS.md](./AGENTS.md) — engineering workflow and quality bar

## Contributing

Lifecycle is currently maintainer-led. Small fixes, docs improvements, and tightly scoped bug reports are welcome. For anything broad, read [CONTRIBUTING.md](./CONTRIBUTING.md) and align on direction before writing a large patch.
