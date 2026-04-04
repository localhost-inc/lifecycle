# Architecture

Lifecycle is a workspace runtime and agent orchestration platform. It manages the lifecycle of development workspaces across hosts and provides the infrastructure for both interactive development and background agent work.

This document defines the canonical system architecture.

## Bridge-First Rule

Lifecycle clients should treat the bridge as the single runtime authority boundary.

Rules:

1. CLI and TUI clients ask the bridge for reads and mutations.
2. The bridge owns host-local orchestration: workspace records, shell attach, stack/service runtime control, git status, activity, and host-aware execution.
3. When a bridge-handled request needs cloud or organization authority, the bridge calls the control plane.
4. When bridge-side runtime state changes, the bridge emits lifecycle events over WebSocket and clients update UI state from those events.
5. Clients own presentation state such as selection, focus, and layout. They do not create alternate authority paths by shelling out to ad hoc `lifecycle` subprocesses or bypassing the bridge for normal runtime operations.

## Two Modes

Lifecycle supports two modes of operation over the same workspace contract.

### Interactive

A developer shells into a workspace and works directly. They run `opencode`, `claude`, `codex`, or any other tool inside a tmux-backed terminal session. Lifecycle manages the workspace — project contract, service graph, stack lifecycle, shell attach — and stays out of the way.

```
Developer → TUI / terminal → tmux session → opencode / claude / codex / shell
                                              └─ lifecycle CLI for workspace awareness
```

### Background

An agent runs headlessly inside a sandbox. Prompts arrive through the API from Slack, Linear, GitHub, a web client, or any other integration. The agent works autonomously. Results flow back through the control plane.

```
Client (Slack / Linear / web / API)
  → Control Plane (CF Workers + Durable Objects)
    → Bridge (WebSocket)
      → OpenCode server (headless, in sandbox)
        └─ lifecycle CLI for workspace awareness
```

Both modes share the same workspace contract, the same `lifecycle.json`, the same CLI tools, and the same sandbox environments. The difference is whether a human is in the terminal or a control plane is routing prompts.

## Three Tiers

### 1. Clients

Interactive clients are thin surfaces that talk to the bridge. Background-triggering clients such as Slack, Linear, GitHub, web, and external API consumers talk to the control plane, which then coordinates with the appropriate bridge.

| Client | Mode | Description |
|---|---|---|
| `lifecycle` CLI | Both | Primary control surface. Workspace lifecycle, session management, agent launch. |
| TUI | Interactive | Tmux-backed three-column shell. Center panel is a terminal session. |
| Web | Background | Browser client for session monitoring, prompt submission, workspace status. |
| Slack | Background | Natural language prompt submission. Repo classification. Status updates. |
| Linear | Background | Issue-triggered agent sessions. |
| GitHub | Background | PR comment and event-triggered sessions. |
| API | Both | Programmatic access for custom integrations and automation. |

Clients are interchangeable. State lives in the bridge, control plane, and workspaces, not in clients.

For interactive hosts, Lifecycle runs a host-local bridge near the workspace. `lifecycle bridge start` starts that bridge, and `lifecycle` launches the TUI as a client of it. The client owns its selected workspace in local state. When it needs to read or mutate workspace state, it asks the bridge. The same bridge boundary is intended to run on local, remote, and cloud hosts so clients can reuse one authority surface across environments.

In repository development mode, the control plane defaults to the local API dev server instead of `https://control-plane.lifecycle.dev`. The root `bun dev` command exports `LIFECYCLE_DEV=1` and `LIFECYCLE_API_URL=http://127.0.0.1:8787`, `apps/control-plane` listens on `127.0.0.1:8787`, and bridge / CLI API clients resolve their control-plane base URL from that shared process environment.

Operation naming should stay consistent at the semantic layer. Bridge and control-plane methods use singular dotted names such as `workspace.get`, `workspace.list`, `workspace.activity`, `workspace.shell`, `service.get`, `service.list`, and `repo.list`. CLI commands and MCP tools keep the filesystem command tree, but they should map cleanly onto the same underlying operations.

Bridge eventing follows the same rule: bridge-side changes stream as lifecycle events, and clients should update their UI models from that stream instead of inventing a second polling or subprocess-based source of truth.

### 2. Bridge

The bridge is the authoritative host-local or host-near runtime process for Lifecycle clients.

**Responsibilities:**

1. Workspace record lookup and host-aware workspace resolution
2. Shell attach and tmux session orchestration
3. Stack and service runtime operations
4. Git and activity reads
5. Local DB-backed state and runtime coordination
6. WebSocket lifecycle event streaming to clients
7. Upstream calls to the control plane when a request needs cloud or organization authority

The bridge is the runtime authority. Clients should not bypass it for normal workspace operations.

### 3. Control Plane

The control plane runs on Cloudflare Workers with Durable Objects and D1.

**Responsibilities:**

1. Session lifecycle — one Durable Object per agent session with its own SQLite database
2. Prompt queuing — prompts queue when the agent is busy; one message processes at a time
3. Sandbox orchestration — provision, wake, stop, destroy workspaces through sandbox providers
4. Real-time streaming — WebSocket hub broadcasts events to all connected clients
5. Auth and org management — WorkOS for identity, RBAC, and organization membership
6. Repo and PR operations — GitHub App for clone, push, PR create, PR merge
7. Automation — cron schedules, webhook triggers, event-driven session spawning

**Key Durable Objects:**

- `SessionDO` — per-session state, SQLite for event history, WebSocket with hibernation API for idle cost, prompt queue management
- `WorkspaceDO` — per-workspace lifecycle state machine, sandbox provider dispatch, health monitoring

**D1** stores shared state: users, organizations, repositories, workspaces, sessions index, encrypted secrets, automation definitions.

**Design rules:**

1. Sessions are the unit of isolation. No cross-session state leakage.
2. WebSocket hibernation eliminates compute cost during idle periods.
3. Prompt queuing decouples submission from execution. Clients fire and forget.
4. The control plane never executes code. It orchestrates sandboxes that do.

### 4. Sandbox Providers

Sandbox providers are pluggable execution environments. Each provider knows how to provision a workspace runtime, start an agent process inside it, and support shell attach.

Every sandbox contains:

1. The project checkout
2. A full development environment (language runtimes, build tools, git)
3. The `lifecycle` CLI
4. `opencode` (for background agent mode)
5. tmux (for session persistence)
6. Mounted storage: project (`/workspace`), home (`/home/lifecycle`), cache

#### Provider Matrix

| Host | Provisioner | Persistence | Snapshot | Use Case |
|---|---|---|---|---|
| `local` | Direct process | Filesystem | No | Developer's machine. Fastest feedback loop. |
| `docker` | Docker API | Volume mounts | Container commits | Local isolation. Reproducible environments. |
| `remote` | SSH / Daytona | Remote filesystem | Daytona snapshots | Persistent remote devboxes. Team sharing. |
| `cloud` | Modal API | Modal volumes | Filesystem snapshots | Background agents. Fire-and-forget. Scale. |

#### Provider Interface

Every provider implements:

1. `provision(workspace)` — create the execution environment
2. `start(workspace)` — start the workspace runtime (prepare + run)
3. `stop(workspace)` — stop the workspace gracefully
4. `destroy(workspace)` — tear down and clean up
5. `attach(workspace)` — return a shell attach path (PTY)
6. `exec(workspace, command)` — run a command and return output
7. `snapshot(workspace)` — capture current state (where supported)
8. `restore(workspace, snapshot)` — restore from snapshot (where supported)

#### Sandbox Bridge Process

In background mode, a bridge process runs alongside OpenCode inside each sandbox. It:

1. Connects to the control plane SessionDO via WebSocket
2. Relays OpenCode SSE events to the control plane
3. Receives prompts from the control plane and forwards them to OpenCode
4. Sends heartbeats (30s interval) for health monitoring
5. Buffers events during disconnects and flushes on reconnect
6. Uses ACK protocol for critical events (execution complete, errors, snapshots)

This sandbox bridge is still part of the same bridge concept: it is the runtime-facing process nearest the workspace, and it relays lifecycle events upstream.

## OpenCode

OpenCode is the coding agent runtime inside workspaces. Lifecycle does not build custom agent provider integrations. OpenCode handles LLM provider routing, tool execution, session management, and plugin extensibility.

**Interactive mode:** The developer runs `opencode` directly in their tmux session. It starts a server + TUI in one process. Full interactive coding agent experience.

**Background mode:** `opencode serve` runs headlessly on port 4096. The bridge process relays events to the control plane. Clients interact through the control plane API.

### Lifecycle Integration

OpenCode gains workspace awareness through:

1. **Custom tools** — `.opencode/tools/` scripts that call `lifecycle context`, `lifecycle stack status`, `lifecycle service info`, etc. The agent understands the workspace through the same CLI a human uses.
2. **Plugins** — `.opencode/plugins/` for lifecycle-specific hooks: `tool.execute.before` for edit gating during sync, `shell.env` for workspace environment injection.
3. **Configuration** — `opencode.json` in the project root configures providers, tools, permissions, and MCP servers.

### Why OpenCode

1. Server-first architecture — decouples the agent core from any client
2. Plugin system — extensible without forking
3. Custom tools — workspace-aware without coupling
4. MCP support — composable tool ecosystem
5. Typed SDK — programmatic control from the bridge and control plane
6. Session fork/revert — first-class branching at the message level
7. Open source — the agent can read its own source to understand its behavior

## Workspace Contract

The workspace contract is the same across all hosts and modes.

### `lifecycle.json`

The project contract. Declares the environment: services, dependencies, prepare steps, health checks, ports.

### CLI Noun Model

```
project   → the durable project contract on disk
workspace → a concrete working instance of a project
stack     → the live runnable graph inside a workspace
service   → one named node inside the stack
context   → one-shot aggregate machine-readable view
```

### Workspace Lifecycle

```
provisioning → preparing → running → stopping → stopped → destroyed
                                   ↘ failed
```

All transitions are explicit and typed. No silent state drift.

### Environment

Every workspace runtime provides:

```
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
| Provider auth (Claude, etc.) | In-box, persisted in mounted home |

Provider auth (Anthropic API key, OpenAI key, etc.) lives inside the workspace home directory. Lifecycle launches the agent. The agent handles its own provider authentication. Lifecycle is agent-agnostic infrastructure.

## Key Design Decisions

### Lifecycle is infrastructure, not the agent

Lifecycle manages where agents run. OpenCode (or any agent) handles how they work. The workspace contract, service graph, and CLI tools are the integration surface — not a custom provider SDK.

### TUI is a shell, not an agent client

The TUI center panel is a tmux-backed terminal. The developer runs whatever they want inside it. Lifecycle doesn't wrap or replace the agent experience. It provides the workspace the agent operates inside.

### Control plane never executes code

The control plane orchestrates. Sandboxes execute. This keeps the control plane cheap, stateless (per-request), and horizontally scalable through Durable Objects.

### Same workspace, two access patterns

Interactive and background are access patterns, not different systems. A developer can shell into the same workspace where a background agent is working. They share the filesystem, the git state, the running services.

### Local-first, cloud as upgrade

No account required for local work. Cloud unlocks background agents, team visibility, durable workspaces, and automation triggers. Signing in does not change how local workspaces work.

## Relationship to Other Docs

1. [Vision](./vision.md) — product direction and V1 boundaries
2. [Journey](./journey.md) — narrative from local dev to background agents to cloud collaboration
3. [TUI](./tui.md) — terminal UI contract, shell attach, tmux model
4. [Local CLI](../plans/local-cli.md) — CLI command contract
5. [Kin Cloud V1](../plans/kin-cloud-v1.md) — cloud delivery plan
