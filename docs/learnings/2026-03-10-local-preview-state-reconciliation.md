# Local Preview State Must Follow Workspace and Service Lifecycle

Date: 2026-03-10

## Context

We already stored `workspace_service.preview_status` and `preview_failure_reason`, but the local environment layer mostly treated them as dead fields. `preview_url` was present, while the actual state transitions were not being reconciled on create, run, stop, manifest sync, or service mutation.

## Learning

For local services, preview state cannot be derived from service status alone. It has to consider both:

1. workspace environment state
2. per-service runtime state

That combination matters because the same local service can be:

1. `sleeping` when the workspace is asleep even though the port is still the intended stable URL
2. `provisioning` during wake/start before the service is ready
3. `failed` when the service is unhealthy, with a typed preview failure reason

If we only persist `preview_url`, the service rail can show a link without accurately communicating whether that route should work right now.

## Decision

- Recompute local preview metadata whenever workspace status changes.
- Recompute local preview metadata whenever service status changes.
- Recompute local preview metadata during manifest reconciliation and service override edits.
- Keep local preview URLs stable when possible, but gate `Open` behavior in the UI on `preview_status=ready`.

## Milestone Impact

- M4: makes local preview lifecycle honest across sleep/wake/start/failure instead of treating preview as a static port string.
- M4: gives the desktop services rail enough state to distinguish ready localhost access from sleeping or failed local services.

## Follow-up

- Decide whether `organization` exposure should remain selectable before tunnel-backed sharing exists.
- Reuse the same preview contract when a future `shared` tunnel transport is added.
