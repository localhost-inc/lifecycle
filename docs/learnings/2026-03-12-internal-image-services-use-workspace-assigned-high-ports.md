# Internal Image Services Use Workspace-Assigned High Ports

## What changed

Local internal image services now allocate their host `assigned_port` from a managed high port range at start time instead of starting from the image's canonical service port and scanning upward.

For example, Postgres may still listen on `5432` inside the container, but the host binding for a given workspace now lands on a workspace-specific high port. Process services and shared/local preview services still prefer their declared low ports.

## Why it mattered

Workspace-owned local infrastructure should behave like every other Lifecycle-managed service:

1. the provider assigns a workspace-specific host port
2. sibling services consume that host port through `LIFECYCLE_SERVICE_*`
3. manifests do not assume they own `5432`, `6379`, or `8785` on the machine

Anchoring internal image services to the canonical low ports made local stacks fragile when older dev workflows or other workspaces were already using those ports.

## Milestone impact

- M5: local workspace environments are more portable and resilient when they include their own infrastructure sidecars.

## Follow-up

1. Keep the high-port allocation deterministic enough for one start sequence, but do not treat the last boot's host bind as durable configuration.
2. Preserve explicit `port_override` as the only user-controlled escape hatch; internal image services should not require manual port picking in the common path.
