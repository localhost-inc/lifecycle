# Plan: Lifecycle Supervisor

> Status: archived on 2026-04-06
> Superseded by the bridge-first runtime authority model in [docs/reference/architecture.md](../../reference/architecture.md)

This plan proposed a separate per-host `supervisor` package and Unix-socket service for workspace stack management.

That is no longer the active direction.

Current model:

1. The bridge is the runtime authority boundary.
2. Clients address operations by workspace identity.
3. The authoritative bridge executes host-local runtime work.
4. Host-specific execution stays inside workspace clients and stack/runtime helpers.

The old `@lifecycle/supervisor` package was removed because it was unused and no longer matched the active architecture.
