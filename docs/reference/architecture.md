# Architecture

Lifecycle is the terminal-native workspace runtime for software teams. It manages the lifecycle of development workspaces across hosts and provides the same shell, stack, and service graph locally and in the cloud.

This document defines the canonical system architecture. [Vision](./vision.md) owns product thesis and V1 boundaries. [Journey](./journey.md) owns the product narrative. This doc owns runtime authority, client/control-plane boundaries, and provider responsibilities.

## Bridge-First Rule

Lifecycle clients should treat the bridge as the single runtime authority boundary.

Rules:

1. CLI and TUI clients ask the bridge for reads and mutations by workspace identity.
2. `bridge` means the runtime authority process nearest the workspace, running on that workspace host.
3. Clients do not resolve workspace host placement or choose host adapters on their own.
4. If the contacted bridge is not authoritative for a workspace, the bridge layer resolves the owning bridge and forwards the request or returns explicit authority information.
5. The authoritative bridge owns host-local orchestration: shell attach, stack/service runtime control, git status, activity, and host-aware execution.
6. When an authoritative bridge-handled request needs cloud or organization authority above the workspace runtime, the bridge calls the control plane.
7. When bridge-side runtime state changes, the bridge emits lifecycle events over WebSocket and clients update UI state from those events. Routed OpenCode/provider traffic is a secondary integration surface.
8. Interactive bridge clients must self-heal bridge discovery. If the pinned bridge endpoint dies or the bridge registration in `~/.lifecycle/bridge.json` changes, clients rediscover the current bridge, retry the request, and may start the bridge when no healthy instance exists.
9. Clients own presentation state such as selection, focus, and layout. They do not create alternate authority paths by shelling out to ad hoc `lifecycle` subprocesses or bypassing the bridge for normal runtime operations.

## Two Modes

Lifecycle supports two access patterns over the same workspace contract.

### Interactive

A developer shells into a workspace and works directly. They run `opencode`, `claude`, `codex`, or any other tool inside a tmux-backed terminal session. Lifecycle manages the workspace — project contract, service graph, stack lifecycle, shell attach — and stays out of the way.

```text
Developer → TUI / terminal → tmux session → opencode / claude / codex / shell
                                              └─ lifecycle CLI for workspace awareness
```

### Cloud-routed

A cloud workspace runs the same shell/runtime contract plus a hosted `opencode serve` endpoint. External harnesses or APIs connect through the control plane while Lifecycle still owns the workspace runtime.

```text
Client (web / API / harness)
  → Control Plane (CF Workers + Durable Objects)
    → Bridge (WebSocket)
      → Cloud workspace runtime (tmux, files, stack)
        └─ OpenCode server (headless, optional routed endpoint)
```

Both modes share the same workspace contract, the same `lifecycle.json`, the same CLI tools, and the same sandbox environments. The difference is whether the shell is local or cloud-hosted, and whether a routable endpoint is exposed alongside it.

## Three Tiers

### 1. Clients

Interactive clients are thin surfaces that talk to the bridge. Cloud-facing clients and integrations may talk to the control plane, which then coordinates with the appropriate bridge and optional routed OpenCode endpoint.

| Client | Mode | Description |
|---|---|---|
| `lifecycle` CLI | Both | Primary control surface. Workspace lifecycle, shell/runtime control, stack commands. |
| TUI | Interactive | Tmux-backed three-column shell. Center panel is a terminal session. |
| Web | Secondary | Browser client for cloud workspace status, attach flows, and routed endpoint inspection. |
| Slack / Linear / GitHub | Secondary | Optional integration triggers for cloud workspaces. |
| API | Both | Programmatic access for workspace lifecycle, cloud runtime provisioning, and routed OpenCode access. |

Clients are interchangeable. State lives in the bridge, control plane, and workspaces, not in clients.

Lifecycle runs a bridge on each workspace host context. `lifecycle bridge start` starts the bridge for the current host context, and `lifecycle` launches the TUI as a client of that bridge surface. The client owns its selected workspace in local state, but it addresses runtime operations by workspace id instead of resolving host placement itself. The same bridge boundary is intended to run on local, remote, and cloud hosts so clients can reuse one authority surface across environments.

In repository development mode, the control plane defaults to the local API dev server instead of `https://control-plane.lifecycle.dev`. The root `bun dev` command exports `LIFECYCLE_DEV=1`, `LIFECYCLE_RUNTIME_ROOT=$REPO/.lifecycle-runtime-dev`, `LIFECYCLE_API_URL=http://127.0.0.1:18787`, `LIFECYCLE_API_PORT=18787`, `LIFECYCLE_BRIDGE_URL=http://127.0.0.1:52222`, and `LIFECYCLE_BRIDGE_PORT=52222`, then uses `turbo run dev` to start `packages/bridge`, `apps/control-plane`, and `apps/desktop-mac` in parallel. Bridge and CLI clients resolve their control-plane base URL from that shared process environment, while the repo-local runtime root keeps dev bridge process state isolated from `~/.lifecycle` without swapping out the user's normal product data by default.

Operation naming should stay consistent at the semantic layer. Bridge and control-plane methods use singular dotted names such as `workspace.get`, `workspace.list`, `workspace.activity`, `workspace.shell`, `service.get`, `service.list`, and `repo.list`. CLI commands and MCP tools keep the filesystem command tree, but they should map cleanly onto the same underlying operations.

Bridge eventing follows the same rule: bridge-side changes stream as lifecycle events first. Raw OpenCode/provider passthrough may also be exposed on the same socket for secondary harness integrations or transcript UIs, but those are not the primary product model.

### 2. Bridge

The bridge is the authoritative runtime process for Lifecycle clients, running on the workspace host.

**Responsibilities:**

1. Workspace record lookup and workspace-to-bridge authority resolution
2. Request forwarding to the authoritative bridge when the contacted bridge is not the owner
3. Host-local execution through the workspace client boundary on the authoritative bridge
4. Shell attach and tmux session orchestration
5. Stack and service runtime operations
6. Git and activity reads
7. Local DB-backed state and runtime coordination
8. WebSocket lifecycle streaming to clients
9. Upstream calls to the control plane when a request needs cloud or organization authority above the workspace runtime

The bridge is the runtime authority. Clients should not bypass it for normal workspace operations.

Current implementation note:

1. Some cloud workspace operations are still proxied from the current host bridge through control-plane endpoints.
2. That proxy path is transitional. The target model is still workspace-host bridge authority with bridge-side forwarding to the owning bridge when needed.

### 3. Control Plane

The control plane runs on Cloudflare Workers with Durable Objects and D1.

**Responsibilities:**

1. Cloud workspace lifecycle — provision, wake, stop, destroy workspaces through sandbox providers
2. Terminal routing — coordinate remote shell attach for cloud workspaces
3. OpenCode routing — start and route `opencode serve` for compatible remote harnesses
4. Real-time streaming — WebSocket hub broadcasts runtime and lifecycle events to connected clients
5. Auth and org management — WorkOS for identity, RBAC, and organization membership
6. Repo and PR operations — GitHub App for clone, push, PR create, PR merge
7. Automation — cron schedules, webhook triggers, and event-driven workspace bring-up

**Key Durable Objects:**

- `WorkspaceDO` — per-workspace lifecycle state machine, sandbox provider dispatch, health monitoring
- `SessionDO` — optional routed OpenCode session state, queueing, and event history when remote harness traffic needs control-plane coordination

**D1** stores shared state: users, organizations, repositories, workspaces, sessions index, encrypted secrets, automation definitions.

**Design rules:**

1. Workspace runtime authority lives with the bridge nearest the workspace.
2. Session state for routed OpenCode access is secondary to workspace lifecycle.
3. WebSocket hibernation eliminates compute cost during idle periods.
4. The control plane never executes code. It orchestrates sandboxes that do.

### 4. Sandbox Providers

Sandbox providers are pluggable execution environments. Each provider knows how to provision a workspace runtime, support shell attach, and optionally host a routed OpenCode endpoint inside it.

Every sandbox contains:

1. The project checkout
2. A full development environment (language runtimes, build tools, git)
3. The `lifecycle` CLI
4. tmux (for session persistence)
5. Mounted storage: project (`/workspace`), home (`/home/lifecycle`), cache
6. `opencode` when cloud-hosted routed access is enabled

#### Provider Matrix

| Host | Provisioner | Persistence | Snapshot | Use Case |
|---|---|---|---|---|
| `local` | Direct process | Filesystem | No | Developer's machine. Fastest feedback loop. |
| `docker` | Docker API | Volume mounts | Container commits | Local isolation. Reproducible environments. |
| `remote` | SSH / remote provider | Remote filesystem | Provider snapshots | Persistent remote workspaces. Team sharing. |
| `cloud` | Provider adapter | Provider-managed | Provider snapshots | Hosted runtime with remote shell and routed OpenCode access. |

#### Provider Interface

Every provider implements:

1. `provision(workspace)` — create the execution environment
2. `start(workspace)` — start the workspace runtime (prepare + run) and any configured companion services
3. `stop(workspace)` — stop the workspace gracefully
4. `destroy(workspace)` — tear down and clean up
5. `attach(workspace)` — return a shell attach path (PTY)
6. `exec(workspace, command)` — run a command and return output
7. `snapshot(workspace)` — capture current state (where supported)
8. `restore(workspace, snapshot)` — restore from snapshot (where supported)

#### Sandbox Bridge Process

In cloud mode, a bridge process can run alongside OpenCode inside each sandbox. It:

1. Connects to the control plane via WebSocket
2. Relays lifecycle events and health state upstream
3. Coordinates shell attach and runtime reads for the cloud workspace
4. Routes OpenCode traffic when `opencode serve` is enabled
5. Sends heartbeats for health monitoring
6. Buffers important events during disconnects and flushes on reconnect

This sandbox bridge is still part of the same bridge concept: it is the runtime-facing process nearest the workspace, and it relays lifecycle events upstream.

## OpenCode

OpenCode is the default remote harness endpoint Lifecycle stands up in cloud workspaces. Lifecycle does not build custom agent provider integrations or a first-party chat surface. Harness vendors own agent UX; Lifecycle owns the runtime they attach to.

**Interactive mode:** A developer may run `opencode` directly in their tmux session, just like any other terminal tool.

**Cloud mode:** `opencode serve` runs headlessly on port 4096 when routed remote access is enabled. The bridge and control plane route compatible clients to it while keeping workspace runtime authority inside Lifecycle.

### Lifecycle Integration

OpenCode gains workspace awareness through:

1. **Custom tools** — `.opencode/tools/` scripts that call `lifecycle context`, `lifecycle stack status`, `lifecycle service info`, etc. The tool understands the workspace through the same CLI a human uses.
2. **Plugins** — `.opencode/plugins/` for lifecycle-specific hooks such as `shell.env` workspace environment injection.
3. **Configuration** — `opencode.json` in the project root configures providers, tools, permissions, and MCP servers.

### Why OpenCode

1. Server-first architecture — easy to route in cloud without making it the product center
2. Plugin system — extensible without forking
3. Custom tools — workspace-aware without coupling
4. MCP support — composable tool ecosystem
5. Open source — the runtime can be inspected and debugged directly

## Workspace Contract

The workspace contract is the same across all hosts and modes.

### `lifecycle.json`

The project contract. Declares the environment: services, dependencies, prepare steps, health checks, ports.

### CLI Noun Model

```text
project   → the durable project contract on disk
workspace → a concrete working instance of a project
terminal  → one interactive terminal inside a workspace runtime
stack     → the live runnable graph inside a workspace
service   → one named node inside the stack
context   → one-shot aggregate machine-readable view
```

### Workspace Lifecycle

```text
provisioning → preparing → running → stopping → stopped → destroyed
                                   ↘ failed
```

All transitions are explicit and typed. No silent state drift.

### Environment

Every workspace runtime provides:

```text
PWD=/workspace
HOME=/home/lifecycle
LIFECYCLE_WORKSPACE_ID=<id>
LIFECYCLE_PROJECT_ID=<id>
LIFECYCLE_WORKSPACE_HOST=<local|docker|remote|cloud>
LIFECYCLE_WORKSPACE_PATH=/workspace
PATH includes: lifecycle, opencode, git, language runtimes
```

## Auth Model

| Concern | System |
|---|---|
| User identity and orgs | WorkOS AuthKit |
| Social login | GitHub via WorkOS |
| Org roles and RBAC | WorkOS |
| Repository access | GitHub App installation tokens |
| PR create/merge | GitHub App through control plane |
| Sandbox secrets | AES-256-GCM encrypted in D1 |
| Tool auth (Claude, OpenAI, etc.) | In-box, persisted in mounted home |

Tool auth (Anthropic API key, OpenAI key, etc.) lives inside the workspace home directory. Lifecycle owns the workspace runtime. The tool running inside that workspace handles its own provider authentication.

Clients may still go through the bridge for auth status and login flows. The bridge owns the client-facing auth surface, then delegates to the in-workspace tool/runtime so credentials remain in the workspace home instead of moving into client-side state.

## Key Design Decisions

### Lifecycle is runtime infrastructure, not the harness

Lifecycle manages where shells and stacks run. OpenCode and other harnesses handle how remote agent UX works. The workspace contract, service graph, and CLI tools are the integration surface — not a custom provider SDK.

### Terminal is the primary interface

The TUI center panel is a tmux-backed terminal. The developer runs whatever they want inside it. Lifecycle does not wrap or replace the tool experience. It provides the workspace that tools operate inside.

### Cloud exposes the same runtime plus a routed endpoint

Cloud mode should feel like the same workspace contract with two additions: remote shell attach and an optional routable `opencode serve` endpoint.

### Control plane never executes code

The control plane orchestrates. Sandboxes execute. This keeps the control plane cheap, stateless per request, and horizontally scalable through Durable Objects.

### Local-first, cloud as upgrade

No account required for local work. Cloud unlocks hosted runtime, remote shell continuity, durable workspaces, and routed OpenCode access. Signing in does not change how local workspaces work.

## Relationship to Other Docs

1. [Vision](./vision.md) — product direction and V1 boundaries
2. [Journey](./journey.md) — narrative from local terminal work to cloud-hosted runtime
3. [TUI](./tui.md) — terminal UI contract, shell attach, tmux model
4. [CLI](../plans/cli.md) — CLI command contract
5. [Cloud](../plans/cloud.md) — cloud delivery plan
