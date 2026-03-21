---
name: reference--preview
description: Local preview proxy, service routing, port assignment, hostname and URL contracts
user-invocable: true
---

Apply the following preview and service routing contracts as context for the current task. Use these for preview proxy, port assignment, service URL, and local routing work.

---

# Local Preview Proxy & Service Routing

Canonical contracts for the Lifecycle-owned local preview proxy, service hostname routing, port assignment, and runtime URL contracts.

## Preview Proxy Architecture

Local preview URLs route through a **Lifecycle-owned Axum HTTP proxy** under `*.lifecycle.localhost`:

1. The proxy resolves `workspace_id + name` to the current `assigned_port` at request time.
2. Desktop UI treats `preview_url` as an opaque runtime value — it does not rebuild URLs from `assigned_port`.
3. The proxy's upstream target uses `127.0.0.1` (the same loopback host Lifecycle reserves and injects into runtime env), not `localhost` which is ambiguous across IPv4/IPv6.
4. `preview_url` remains stable across service restarts and port reassignments — URL stability does not depend on a process binding a particular host port.

## Hostname Contract

Local preview hostnames are **human-readable and deterministic**:

```
<service>.<workspace-label>.lifecycle.localhost
```

Rules:
1. The workspace portion derives from branch or worktree identity.
2. Hostnames use deterministic disambiguation — the workspace label keeps a short workspace suffix when needed for stability.
3. Ports are runtime plumbing. The user-facing HTTP contract stays on runtime-owned `.lifecycle.localhost` routes.
4. The same readable hostname shape applies to any future HTTPS local preview mode.

## Port Assignment

`assigned_port` is **runtime plumbing**, not durable configuration:

1. `assigned_port` exists only when Lifecycle is actually holding a runtime bind for that service.
2. Idle or stopped services do not keep pretending they own a host port — idle reconciliation and stop transitions clear `assigned_port`.
3. Start assigns `assigned_port` for the selected service graph before runtime env injection and process/container launch.
4. `preview_url` remains stable even when `assigned_port` is null.

Two distinct concerns must stay separate:
- **Runtime state**: the host port actually bound for the current run
- **Preview identity**: the stable runtime-owned `preview_url`

## Startup Boundary

Socket reservation and async runtime adoption are **separate phases**:

1. Reserve the proxy port **synchronously** with `std::net::TcpListener` during Tauri `setup` — before workspace preview URLs are refreshed.
2. Persist the chosen port while those listeners are still held open.
3. Convert listeners to Tokio types (`tokio::net::TcpListener::from_std`) only inside `tauri::async_runtime::spawn` — never during sync setup, which panics with "there is no reactor running."

Rules:
- Keep runtime-dependent IO setup out of synchronous Tauri bootstrap paths unless the runtime is explicitly available.
- Local port viability checks should treat an occupied loopback port as unavailable across both IPv4 and IPv6 loopback listeners.

## Runtime Env Vars

Lifecycle injects per-service environment variables for service-to-service discovery:

| Variable | Description |
|---|---|
| `LIFECYCLE_SERVICE_<NODE_NAME>_URL` | Stable HTTP URL via `*.lifecycle.localhost` proxy. **Primary var for HTTP clients.** |
| `LIFECYCLE_SERVICE_<NODE_NAME>_HOST` | Loopback host (`127.0.0.1`) |
| `LIFECYCLE_SERVICE_<NODE_NAME>_PORT` | Currently assigned runtime port |
| `LIFECYCLE_SERVICE_<NODE_NAME>_ADDRESS` | `host:port` for direct socket access |

Rules:
1. Use `_URL` for HTTP service-to-service traffic — it routes through the stable proxy and does not break on port reassignment.
2. Use `_HOST`/`_PORT`/`_ADDRESS` for non-HTTP protocols and direct socket clients.
3. Proxy routing readiness follows service runtime state — internal services also need stable HTTP discovery without becoming user-facing previews.
4. Apps that assume hardcoded ports (e.g. `localhost:3001`) need an explicit override input — default-only config is not compatible with workspace-level isolation.
5. For apps expecting `.env.local` patterns, workspace setup is the right place to materialize those files from `LIFECYCLE_SERVICE_*` vars.

## Preview Availability

Preview routing is derived from service/runtime facts, not a separate preview state machine.

Rules:
1. A service preview is openable when the service is `ready` and `assigned_port` is set.
2. Stopped or failed services may still keep the same `preview_url`, but opening them should fail cleanly until runtime returns.
3. `preview_url` is derived from workspace + service identity, not stored as its own lifecycle state.

Key files:
- `apps/desktop/src-tauri/src/platform/preview_proxy.rs` — Axum preview proxy
- `apps/desktop/src-tauri/src/capabilities/workspaces/environment/port_assignment.rs` — port assignment logic
- `apps/desktop/src-tauri/src/capabilities/workspaces/environment/execution.rs` — service execution
