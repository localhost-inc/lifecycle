# Lifecycle

Lifecycle is a workspace runtime and agent orchestration platform. It manages development workspaces across local machines, containers, remote servers, and cloud sandboxes — and provides the infrastructure for both interactive development and autonomous background agent work.

`lifecycle.json` is the project contract. The `lifecycle` CLI is the primary control surface. The bridge is the local host authority for clients. The control plane on Cloudflare Workers orchestrates background agents and cloud workspaces. Sandbox providers (`local`, `docker`, `remote`, `cloud`) run the same workspace contract everywhere.

## Status

Under active development. The current execution focus is:

1. **CLI and TUI** — workspace lifecycle, shell attach, tmux persistence, service graph operation
2. **Control plane** — Cloudflare Workers + Durable Objects + D1 for session management and workspace orchestration
3. **Sandbox providers** — local (native), Docker, Daytona (remote/SSH), Modal (cloud)
4. **OpenCode integration** — custom tools and plugins for workspace-aware agent operation

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

### Background Mode

Agents run headlessly in cloud sandboxes. Prompts arrive from Slack, Linear, GitHub, the web, or the API. The control plane manages sessions and streams results.

```bash
# API / integration triggers a session
# Control plane provisions sandbox, starts opencode serve, routes prompt
# Agent works autonomously, pushes code, opens PR
# Human reviews
```

Both modes share the same `lifecycle.json`, the same workspace environment, and the same CLI tools.

## Bridge-First Model

Lifecycle clients do not invent their own authority paths.

1. The CLI and TUI ask the bridge to read or mutate workspace state.
2. The bridge owns host-local orchestration: workspace records, shell attach, stack/service runtime control, git status, activity, and host-aware execution.
3. When a request needs cloud or organization authority, the bridge calls the control plane.
4. When runtime state changes on the bridge side, the bridge streams lifecycle events over WebSocket and clients update UI state from those events.
5. Clients stay thin. They own presentation state such as selection, focus, and layout. They do not shell out to fresh `lifecycle` subprocesses for core reads or mutations when the bridge is available.

## What Exists Today

1. **CLI** (`packages/cli`) — workspace lifecycle, stack/service commands, bridge launcher, agent launcher, context dump
2. **TUI** (`apps/tui`) — Rust terminal UI with tmux-backed shell attach, workspace sidebar, host-aware activity
3. **Workspace package** (`packages/workspace`) — host-aware workspace client with `local`, `cloud`, `docker`, `remote` implementations
4. **Stack package** (`packages/stack`) — process supervisor, health checks, port management
5. **Contracts package** (`packages/contracts`) — shared domain types, manifest parsing, Zod validation
6. **DB package** (`packages/db`) — control-plane persistence (Turso/SQLite)
7. **API scaffold** (`apps/control-plane`) — Hono-based backend
8. **Desktop app** (`apps/desktop`) — Tauri app, maintenance-only
9. **Landing page** (`apps/www`)

## CLI Interface

The CLI noun model:

```
project   → project contract and lifecycle.json scaffold
workspace → concrete working instance of a project
stack     → live runnable graph inside a workspace
service   → one named node inside the stack
context   → aggregate machine-readable view (designed for agents)
```

Key commands:

```bash
lifecycle project init                    # scaffold lifecycle.json
lifecycle workspace create                # materialize a workspace
lifecycle workspace prepare               # bootstrap the environment
lifecycle workspace shell <workspace>     # attach a shell
lifecycle stack run                       # start the service graph
lifecycle stack status                    # service health dashboard
lifecycle service logs <service>          # stream service logs
lifecycle context --json                  # structured workspace dump for agents
lifecycle                                 # launch the TUI
lifecycle workspace agent <ws> <provider> # launch agent in cloud workspace
lifecycle pr create                       # create PR through control plane
```

## Architecture

Three tiers: clients, bridge, control plane, sandbox providers.

```
Clients (CLI, TUI)
  → Bridge (host authority + WebSocket event source)
    → Control Plane (CF Workers + Durable Objects + D1)
      → Sandbox Providers (local, docker, remote, cloud)
        → OpenCode server + lifecycle CLI + full dev environment
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
bun run dev
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
8. `bun run dev` — development loops

## Repository Layout

```text
apps/
  control-plane/ Hosted Hono control plane
  desktop/      Tauri desktop app (maintenance-only)
  tui/          Rust TUI — tmux-backed workspace shell
  www/          Landing page
packages/
  agents/       Agent orchestration contracts and adapter interfaces
  auth/         Auth helpers and contracts
  cli/          lifecycle CLI
  cmd/          Filesystem-based command framework
  config/       Shared TypeScript config
  contracts/    Domain contracts, manifest parsing, validation
  db/           Control-plane persistence
  stack/        Stack client, process supervisor, health, ports
  store/        Control-plane query/mutation layer
  ui/           Shared UI primitives
  workspace/    Host-aware workspace client contracts
docs/
  reference/    Canonical contracts (architecture, vision, journey, TUI, shell, etc.)
  plans/        Execution plans (local CLI, cloud V1, sandbox providers)
  milestones/   Active milestone contracts
  archive/      Historical specs
AGENTS.md       Engineering playbook
```

## Documentation

1. [Architecture](./docs/reference/architecture.md) — system design, three tiers, sandbox providers
2. [Vision](./docs/reference/vision.md) — product direction and V1 boundaries
3. [Journey](./docs/reference/journey.md) — narrative from local dev to background agents
4. [TUI](./docs/reference/tui.md) — terminal UI contract, shell attach, tmux model
5. [Local CLI](./docs/plans/local-cli.md) — CLI command contract
6. [Kin Cloud V1](./docs/plans/kin-cloud-v1.md) — cloud delivery plan
7. [Vocabulary](./docs/reference/vocabulary.md) — canonical terms
8. [AGENTS.md](./AGENTS.md) — engineering workflow and quality bar

## Contributing

Lifecycle is currently maintainer-led. Small fixes, docs improvements, and tightly scoped bug reports are welcome. For anything broad, read [CONTRIBUTING.md](./CONTRIBUTING.md) and align on direction before writing a large patch.
