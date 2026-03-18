# Preview Proxy Startup Must Bind Ports Before Tokio Adoption

## Context

The desktop app starts the local preview proxy during Tauri `setup` so it can:

1. Reserve a stable proxy port before workspace preview URLs are refreshed.
2. Persist that port for later boots.
3. Expose the proxy route immediately through stored `preview_url` values.

The initial implementation adopted the bound sockets into `tokio::net::TcpListener` inside `setup`. On macOS, that ran before Tokio's reactor was available and caused startup to panic with `there is no reactor running`.

## Learning

Socket reservation and async runtime adoption are separate phases.

1. Reserve the port synchronously with `std::net::TcpListener` during startup.
2. Persist the chosen port while those listeners are still held open.
3. Convert the listeners to Tokio types only inside spawned async work that already runs under Tauri's runtime.

## Decision

1. `preview_proxy::bind_preview_listeners` now returns `std::net::TcpListener` handles, not Tokio listeners.
2. `start_preview_proxy` still selects and persists the stable proxy port during startup.
3. Each reserved listener is adopted with `tokio::net::TcpListener::from_std` only inside `tauri::async_runtime::spawn`.

## Milestone Impact

1. M4: keeps local preview URL reconciliation at startup without crashing the desktop app before the runtime is ready.
2. M4: preserves stable preview route ownership by Lifecycle instead of falling back to per-service direct ports.
3. M5: clarifies the boundary between sync bootstrap work and async runtime services for future desktop infrastructure.

## Follow-Up Actions

1. Keep runtime-dependent IO setup out of synchronous Tauri bootstrap paths unless the runtime is explicitly available.
2. Add regression coverage whenever startup code needs to reserve OS resources before async services begin serving.
