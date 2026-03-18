# Local Preview URLs Must Be Stable Provider Routes, Not Bound Ports

## Context

The local provider had been using one field for two different jobs:

1. `workspace_service.assigned_port` as the actual host port a service binds
2. `workspace_service.preview_url` as the user-facing address the desktop app opens

That coupling made preview identity depend on whichever port happened to be bound. It also made the desktop UI reconstruct local preview URLs from `assigned_port`, which meant a port reassignment changed the user-facing address instead of just changing internal routing.

## Learning

Local preview should be modeled as a provider-owned stable route that resolves to the current service port.

1. `assigned_port` is runtime plumbing, not preview identity.
2. `preview_url` should remain stable across service restarts and future port reassignments.
3. The provider should own a local proxy layer so preview URL stability does not depend on a process binding a particular host port forever.
4. Preview status still needs to track lifecycle truth independently of URL stability; a stable route can legitimately be `provisioning`, `sleeping`, or `failed`.

## Decision

1. Local preview URLs now route through a Lifecycle-owned proxy under `*.lifecycle.localhost`.
2. The proxy resolves `workspace_id + service_name` to the current `assigned_port` at request time.
3. Desktop UI should treat `preview_url` as an opaque provider value instead of rebuilding it from `assigned_port`.
4. Migration/startup reconciliation should refresh stored preview URLs after the proxy binds its local port.

## Milestone Impact

1. M4: keeps local preview URLs stable while preserving honest per-service preview status.
2. M4: removes direct user-facing coupling between preview identity and runtime port assignment.
3. M5: establishes the routing boundary needed if local preview later becomes fully port-agnostic from the user's perspective.

## Follow-Up Actions

1. Keep local service start on per-boot host port discovery and avoid drifting back toward durable host-port identity.
2. Decide whether the preview proxy port itself should become fully reserved/persisted in a more explicit runtime record.
3. Reuse the same provider-owned preview contract when optional shared/tunnel transport is introduced.
