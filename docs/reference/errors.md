# Typed Error Catalog

Normative error codes, failure reason enums, and mutation concurrency rules.

## Error Envelope

All non-2xx responses include: `code`, `message`, `details`, `request_id`, `suggested_action`, `retryable`.

## Canonical API Codes

| `code`                           | HTTP | Trigger                              |
| -------------------------------- | ---: | ------------------------------------ |
| `invalid_request`                |  400 | malformed input                      |
| `validation_failed`              |  422 | schema/field validation failure      |
| `unauthenticated`                |  401 | missing or expired auth              |
| `forbidden`                      |  403 | RBAC/secret access denied            |
| `not_found`                      |  404 | unknown resource                     |
| `resource_conflict`              |  409 | uniqueness/idempotency conflict      |
| `invalid_state_transition`       |  409 | forbidden state transition           |
| `workspace_mutation_locked`      |  409 | workspace in transitional lock state |
| `workspace_capacity_unavailable` |  503 | provider cannot allocate capacity    |
| `provider_api_error`             |  502 | upstream provider API failure        |
| `setup_step_failed`              |  500 | setup command failed                 |
| `service_start_failed`           |  500 | service startup failed               |
| `service_healthcheck_failed`     |  500 | service health gate failed           |
| `preview_route_failed`           |  502 | preview route bind/reconcile failed  |
| `local_docker_unavailable`       |  503 | Docker Desktop not running (local)   |
| `local_port_conflict`            |  409 | requested port already in use        |
| `local_app_not_running`          |  503 | Tauri desktop app not running         |
| `local_pty_spawn_failed`         |  500 | local PTY process spawn failed       |
| `repository_disconnected`        |  409 | GitHub App uninstalled or repo access revoked |
| `internal_error`                 |  500 | unexpected server failure            |

## Canonical Failure Reason Enums

### `workspace.failure_reason` (V1 field carrying environment failure in current implementation)

`capacity_unavailable`, `manifest_invalid`, `manifest_secret_unresolved`, `repo_clone_failed`, `repository_disconnected`, `setup_step_failed`, `service_start_failed`, `service_healthcheck_failed`, `sandbox_unreachable`, `local_docker_unavailable`, `local_port_conflict`, `local_app_not_running`, `operation_timeout`, `unknown`

Failed start attempts return the environment to `workspace.status = idle`; the last failure remains visible through `workspace.failure_reason` and `workspace.failed_at`.

### `workspace_service.status_reason`

`service_process_exited`, `service_dependency_failed`, `service_port_unreachable`, `unknown`

### `workspace_service.preview_failure_reason`

`route_bind_failed`, `route_reconcile_failed`, `service_unreachable`, `policy_denied`, `unknown`

### `terminal.failure_reason`

`pty_spawn_failed`, `local_pty_spawn_failed`, `harness_process_exit_nonzero`, `attach_failed`, `workspace_destroyed`, `unknown`

## Mutation Concurrency

1. Workspace environment status is the concurrency lock:
   - transitional environment states (`starting`, `stopping`) reject new mutations with `workspace_mutation_locked` error
   - only `idle` and `active` states accept mutation requests
   - V1 still stores that environment status on `workspace.status`
2. Concurrency guardrails:
   - Convex OCC handles serialization natively — mutations on the same document are serialized automatically
   - global quotas by organization (max active workspaces)
3. Metering emission (expansion-scope, see billing.md):
   - environment state transitions emit usage events when billing is enabled
