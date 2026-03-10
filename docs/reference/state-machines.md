# State Machines

Canonical transition rules for all Lifecycle state machines. This is the single source of truth for transition guards and implementation tests.

Lifecycle has three related but distinct machines:

1. workspace lifecycle
   - durable shell existence and archive state
2. workspace environment status
   - the singleton runnable environment attached to a workspace
3. workspace service status
   - per-service runtime inside that environment

Implementation note:

1. V1 still stores environment state on `workspace.status`.
2. The target contract is `workspace.archived_at` (or equivalent workspace-lifecycle metadata) plus `workspace.environment_status`.
3. Do not add new product behavior that deepens the overloaded meaning of `workspace.status`.

## Workspace Lifecycle

Workspace lifecycle is about the durable shell, not whether services are currently running.

- `created -> active`
- `active -> archived`
- `archived -> active`
- `active|archived -> destroyed` (terminal)

### Workspace Lifecycle Invariants

1. Archiving or destroying a workspace must first drive the environment down.
2. Starting or stopping the environment does not create, archive, unarchive, or destroy the workspace.
3. Archived workspaces remain durable records; destroy is the terminal workspace removal path.

## Workspace Environment `status` Allowed Transitions

- `idle -> starting`
- `starting -> active|stopping|idle`
- `active -> stopping`
- `stopping -> idle`

### Workspace Environment Invariants

1. Allowed states: `idle`, `starting`, `active`, `stopping`
2. Transitional environment status acts as implicit mutation lock for environment/service mutations (`starting|stopping`). Terminal create/attach is governed by interactive workspace context instead of service readiness.
3. Project `setup` executes exactly once per workspace create; ordinary environment start/stop does not rerun setup.
4. All defined services must pass health checks before transition to `active`
5. Failed start attempts land back in `idle`; the failure is carried by `failure_reason` and `failed_at` instead of a terminal `failed` status.
6. Workspace creation and deletion are workspace-lifecycle concerns, not environment-status values.

### Environment State Semantics by Mode

| State | `CloudWorkspaceProvider` | `LocalWorkspaceProvider` |
|-------|-------------------|-------------------|
| `idle` | No active sandbox services; workspace record persists | No running services; worktree persists |
| `starting` | Provisioning or starting sandbox services | Running first-boot setup (if needed) and starting local processes + containers |
| `active` | Health checks pass in sandbox | Health checks pass on localhost |
| `stopping` | Sandbox services are shutting down | Processes and containers are shutting down |

- Failed start attempts record typed `failure_reason` and `failed_at` while returning the workspace to `idle`
- All forbidden transitions must throw `invalid_state_transition` error with current/target state in `details`

## Workspace Service `status` Allowed Transitions

- `stopped -> starting`
- `starting -> ready|failed|stopped`
- `ready -> starting|failed|stopped`
- `failed -> starting|stopped`

### Workspace Service State Invariants

1. Allowed states: `stopped`, `starting`, `ready`, `failed`
2. Service status is subordinate to the environment: an `idle` or `stopping` environment cannot have `ready` services.
3. Individual service failure may drive the environment back to `idle` with `failure_reason` when the health gate requires all declared services.

## Terminal `status` Allowed Transitions

- `active -> detached|sleeping|finished|failed`
- `detached -> active|sleeping|finished|failed`
- `sleeping -> detached|active|failed`
- `finished` and `failed` are terminal

### Terminal State Invariants

1. Allowed states: `active`, `detached`, `sleeping`, `finished`, `failed`
2. `create` and `attach` are allowed whenever the workspace has interactive context (the worktree exists); terminal access is not gated on service readiness.
3. `sleeping` terminals must not accept input when the terminal itself is suspended.
4. Workspace `destroy` hard-terminates any non-finished/non-failed terminal.

## Preview `preview_status` Allowed Transitions

- `disabled -> provisioning|expired`
- `provisioning -> ready|failed|disabled|expired`
- `ready -> provisioning|sleeping|failed|disabled|expired`
- `sleeping -> provisioning|ready|failed|disabled|expired`
- `failed -> provisioning|disabled|expired`
- `expired` is terminal

### Preview Trigger Conditions

- `disabled -> provisioning` on `share on` or `share_default=true`
- `provisioning -> ready|failed` after route bind + health confirmation
- `ready -> provisioning` during service restart/rebind (URL remains stable)
- `ready -> sleeping` when the workspace environment becomes `idle` or `stopping`
- `sleeping -> provisioning|ready` on the next start and route reconcile
- `* -> expired` when workspace is destroyed or TTL-cleaned
- Health check must pass before `preview_status=ready` for all providers

## Enforcement

Everything not listed above is forbidden and must throw `invalid_state_transition` error with `machine`, `from_state`, `to_state`, and `cause`.
