# Runtime Ports Must Be Assigned At Start, Not Preserved As Durable Config

## Context

The local provider had been carrying `workspace_service.assigned_port` through idle state, manifest reconciliation, and service setting edits as if it were durable configuration.

That blurred three different concerns:

1. desired settings: `default_port` and `port_override`
2. runtime state: the host port actually bound for the current run
3. preview identity: the stable provider-owned `preview_url`

## Learning

`assigned_port` should exist only when Lifecycle is actually holding a runtime bind for that service.

1. Idle or stopped services should not keep pretending they own a host port.
2. Start should perform host port discovery, assign the viable runtime port, and then launch.
3. Service setting edits should change desired configuration, not silently mutate idle runtime state.
4. Stable preview URLs make this possible because user-facing routing no longer depends on preserving a specific host port forever.

## Decision

1. Idle reconciliation now clears `assigned_port`.
2. Stop transitions clear `assigned_port`.
3. Start assigns `assigned_port` for the selected service graph before runtime env injection and process/container launch.
4. `preview_url` remains stable for local services even when `assigned_port` is null and `preview_status` is `sleeping` or `failed`.

## Milestone Impact

1. M4: makes local service runtime state honest instead of leaking stale bind metadata across boots.
2. M4: aligns service discovery, preview routing, and process startup around one start-time port assignment boundary.
3. M5: gives the CLI a clearer contract by separating desired configuration from current runtime state.

## Follow-Up Actions

1. Decide whether the desktop service rail should show desired port hints separately from current runtime ports when a service is idle.
2. Keep cloud/shared preview work aligned with the same separation: stable route, runtime target discovered independently.
