# Workspace Service Overrides Need Runtime Reapplication

Date: 2026-03-10

## Context

We already had `workspace_service.exposure`, `port_override`, and `assigned_port` in the local schema, but the runtime still treated `lifecycle.json` as the only source of truth when starting services.

## Learning

Persisting service overrides is not enough. Local environment controls only stay honest if the same overrides are re-applied in three places:

1. during manifest reconciliation, so service rows survive `lifecycle.json` edits without losing local overrides
2. in preview and environment projection, so the desktop surface reflects the same runtime-assigned port and exposure state the runtime will use
3. at runtime startup, so `run` uses the workspace-level override state instead of silently booting the manifest defaults

Without that third step, the Environment rail can show one port while the supervisor actually starts another.

## Decision

- Keep `workspace_service` as the durable source for local service exposure and port overrides.
- Recompute preview metadata from exposure, preview transport, and current runtime state whenever service rows are reconciled or edited.
- Clone manifest service config at start time and apply workspace overrides before launching processes or containers.
- For process services, inject the start-assigned port through `PORT` env vars in addition to updating the stored runtime port field.

## Milestone Impact

- M4: makes service exposure and port controls real local environment mutations instead of cosmetic rail state.
- M4: keeps preview metadata aligned with the service configuration that will actually boot on the next `Run`.

## Follow-up

- Add preview-state transitions (`ready`, `sleeping`, `failed`) beyond the current preview URL/effective port alignment.
- Decide whether `organization` exposure should stay selectable before tunnel-backed preview routing exists.
