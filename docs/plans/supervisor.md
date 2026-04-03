# Plan: Lifecycle Supervisor

> Status: active execution plan
> Plan index: [docs/plans/README.md](./README.md)

## Goal

One supervisor per host. A single background process that manages all workspace stacks on that machine. Process supervision is the first capability.

## What It Is

A long-lived background process. One per machine (or one per sandbox in cloud). It starts when you first need it, persists across shell sessions, and exposes a local control socket.

```
lifecycle supervisor start     # start the supervisor (if not already running)
lifecycle supervisor stop      # stop it
lifecycle supervisor status    # is it running, what's it managing?
```

Most users never run these directly. `lifecycle stack run` auto-starts the supervisor if it's not running. The supervisor is infrastructure — you interact with it through stack commands.

The supervisor manages N workspaces, each with their own service graph from `lifecycle.json`. The CLI resolves which workspace you mean from cwd, same as every other command.

Everything else talks to the supervisor. The CLI, the TUI, the control plane bridge — they're all clients.

## Capabilities

### Process supervision (v1)

The supervisor manages service graphs per workspace:

1. Accept workspace registrations (`stack.run` for a workspace path)
2. Read the workspace's `lifecycle.json`
3. Resolve dependency order from the `stack` section
4. Run prepare steps
5. Start services as managed child processes
6. Run health checks
7. Restart on crash (configurable per service)
8. Expose per-service status, ports, and log streams through the socket
9. Track multiple workspaces concurrently

Stack commands become thin clients:

- `lifecycle stack run [service...]` → tell the supervisor to start this workspace's stack
- `lifecycle stack stop [service...]` → tell the supervisor to stop this workspace's stack
- `lifecycle stack status` → query the supervisor for this workspace
- `lifecycle stack logs` → read from the supervisor's log streams for this workspace

### File watching (v1)

Watch `lifecycle.json` for each managed workspace. When a stack section changes:

1. Diff the declared services against the running set
2. Stop removed services
3. Start added services
4. Restart changed services (command, env, port changed)
5. Leave unchanged services alone

### Future capabilities

These don't need to exist yet, but the supervisor is where they'd live:

- Port assignment and proxy management
- OpenCode server lifecycle (for background agent mode)
- Control plane bridge (WebSocket to SessionDO)
- Health monitoring and alerting
- Log aggregation and rotation

## Host Model

One supervisor process per host. On a developer laptop, one supervisor manages all local workspaces. On a remote box, one supervisor. In a cloud sandbox, one supervisor (typically managing a single workspace since sandboxes are single-purpose).

| Host | How it starts | Where it runs | Control socket |
|---|---|---|---|
| `local` | `lifecycle supervisor start` | Background process on the machine | Unix domain socket |
| `docker` | Container entrypoint | Inside the container | Unix socket on mounted volume |
| `remote` | SSH + `lifecycle supervisor start` | Background process on the remote box | Unix socket over SSH |
| `cloud` | Sandbox entrypoint | Inside the sandbox | Unix socket, bridged to control plane |

## Socket Protocol

The supervisor exposes a Unix domain socket at:

```
~/.lifecycle/run/supervisor.sock
```

One socket, one supervisor. All workspace commands include the workspace path to scope the request.

Protocol: newline-delimited JSON request/response. Simple, debuggable, no HTTP overhead.

Request:

```json
{"id": "1", "method": "stack.status", "workspace": "/Users/kyle/dev/myapp"}
{"id": "2", "method": "stack.run", "workspace": "/Users/kyle/dev/myapp", "params": {"services": ["api"]}}
{"id": "3", "method": "stack.stop", "workspace": "/Users/kyle/dev/myapp"}
{"id": "4", "method": "stack.logs", "workspace": "/Users/kyle/dev/myapp", "params": {"service": "api", "follow": true}}
{"id": "5", "method": "supervisor.status"}
```

Response:

```json
{"id": "1", "result": {"services": [{"name": "api", "status": "ready", "port": 3000}]}}
{"id": "2", "result": {"started": ["api"]}}
{"id": "5", "result": {"workspaces": [{"path": "/Users/kyle/dev/myapp", "services": 2, "running": 2}]}}
```

Events (pushed when follow mode is active):

```json
{"event": "service.status", "workspace": "/Users/kyle/dev/myapp", "data": {"name": "api", "status": "ready", "port": 3000}}
{"event": "service.log", "workspace": "/Users/kyle/dev/myapp", "data": {"service": "api", "stream": "stdout", "text": "listening on :3000"}}
```

## Implementation

### Supervisor process

A single `lifecycle supervisor run` process (internal foreground mode — the CLI `start` command forks this and exits):

1. Opens the control socket at `~/.lifecycle/run/supervisor.sock`
2. Accepts workspace commands
3. For each workspace: reads `lifecycle.json`, spawns and manages child processes, watches for manifest changes
4. Handles socket commands
5. Cleans up all managed processes on SIGTERM/SIGINT

### PID management

The supervisor writes its own PID to:

```
~/.lifecycle/run/supervisor.pid
```

`lifecycle supervisor start` checks if an existing supervisor is alive before starting a new one. `lifecycle supervisor stop` reads the PID file and sends SIGTERM.

### Log management

Per-workspace, per-service logs:

```
~/.lifecycle/run/workspaces/<workspace-hash>/logs/<service>.stdout.log
~/.lifecycle/run/workspaces/<workspace-hash>/logs/<service>.stderr.log
```

The supervisor also holds recent output in memory (ring buffer) for `stack.logs` follow queries.

### Workspace identity

Each workspace is identified by its root path (where `lifecycle.json` lives). The supervisor uses a stable hash of that path for filesystem scoping.

## CLI Commands

### `lifecycle supervisor start`

1. Check if a supervisor is already running (PID file + liveness check)
2. If yes, print status and exit
3. If no, fork `lifecycle supervisor run`, wait for socket, exit

### `lifecycle supervisor stop`

1. Send SIGTERM to the running supervisor
2. Wait for exit (with timeout)
3. Clean up socket and PID files

### `lifecycle supervisor status`

1. Query the socket for all managed workspaces and their service states

### `lifecycle stack run [service...]`

1. Ensure the supervisor is running (auto-start if not)
2. Send `stack.run` with the resolved workspace path
3. Stream status updates until services are ready or fail

### `lifecycle stack stop [service...]`

1. Send `stack.stop` with the resolved workspace path

### `lifecycle stack status`

1. Query the supervisor for this workspace's service state
2. If no supervisor is running, report all services as stopped

### `lifecycle stack logs [service] [--follow]`

1. Query the supervisor for log output
2. With `--follow`, keep the socket open for streaming

## What Changes

1. `packages/stack/src/supervisor.ts` — the current `ProcessSupervisor` becomes the child-process layer inside the supervisor, not the top-level API
2. New: supervisor process with socket server, workspace tracking, manifest watching
3. `packages/cli/src/commands/stack/run.ts` — becomes a thin socket client
4. `packages/cli/src/commands/supervisor/` — new command family (start, stop, status)
5. The TUI stack panel can connect to the socket directly instead of polling the CLI
6. PID/port file state in `~/.lifecycle/state/stacks/` is replaced by supervisor socket queries

## Non-Goals (v1)

1. Cluster supervision across multiple machines
2. Container orchestration (Docker host uses Docker's own supervision)
3. Auto-restart policies beyond simple crash recovery
4. Resource limits or cgroups
5. Remote supervisor discovery (SSH handles this)

## Exit Gate

1. `lifecycle supervisor start` starts one background supervisor on the machine
2. `lifecycle supervisor stop` stops it cleanly, killing all managed services
3. `lifecycle stack run` in workspace A starts that workspace's stack through the supervisor
4. `lifecycle stack run` in workspace B starts B's stack through the same supervisor
5. `lifecycle stack status` shows live service state for the current workspace
6. `lifecycle stack logs --follow` streams logs from the supervisor
7. Editing `lifecycle.json` while the supervisor is running reconciles the affected workspace's stack
8. Closing the TUI does not kill services — the supervisor persists independently
9. `lifecycle supervisor status` shows all managed workspaces and their service counts
