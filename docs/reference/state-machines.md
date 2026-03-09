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
2. Starting, stopping, resetting, sleeping, or waking the environment does not create, archive, unarchive, or destroy the workspace.
3. Archived workspaces remain durable records; destroy is the terminal workspace removal path.

## Workspace Environment `status` Allowed Transitions

- `creating -> starting|sleeping|failed`
- `starting -> ready|failed`
- `ready -> starting|resetting|sleeping|destroying|failed` (`ready -> sleeping` only for idle-timeout cause)
- `resetting -> starting|failed`
- `sleeping -> starting|destroying|failed`
- `failed -> starting|resetting|destroying`
- `destroying -> deleted` (terminal)

### Workspace Environment Invariants

1. Allowed states: `creating`, `starting`, `ready`, `resetting`, `sleeping`, `destroying`, `failed`
2. Transitional environment status acts as implicit mutation lock for environment/service mutations (`creating|starting|resetting|sleeping|destroying`). Terminal create/attach is governed by interactive workspace context instead of service readiness.
3. Project `setup` executes exactly once per workspace create; ordinary environment start/stop does not rerun setup.
4. All defined services must pass health checks before transition to `ready`

### Environment State Semantics by Mode

| State | `CloudWorkspaceProvider` | `LocalWorkspaceProvider` |
|-------|-------------------|-------------------|
| `creating` | Provisioning sandbox + clone + setup | Creating git worktree and persisting workspace metadata |
| `starting` | Starting services in sandbox | Running first-boot setup (if needed) and starting local processes + containers |
| `ready` | Health checks pass in sandbox | Health checks pass on localhost |
| `sleeping` | R2 backup, sandbox terminated | Processes stopped, worktree preserved |
| `destroying` | Sandbox terminated, metadata cleaned | Processes killed, worktree pruned |

- All failed transitions include typed `failure_reason` and `failed_at`
- All forbidden transitions must throw `invalid_state_transition` error with current/target state in `details`

## Workspace Service `status` Allowed Transitions

- `stopped -> starting`
- `starting -> ready|failed|stopped`
- `ready -> starting|failed|stopped`
- `failed -> starting|stopped`

### Workspace Service State Invariants

1. Allowed states: `stopped`, `starting`, `ready`, `failed`
2. Service status is subordinate to the environment: a sleeping or destroying environment cannot have `ready` services.
3. Individual service failure may drive the environment to `failed` when the health gate requires all declared services.

## Terminal `status` Allowed Transitions

- `active -> detached|sleeping|finished|failed`
- `detached -> active|sleeping|finished|failed`
- `sleeping -> detached|active|failed`
- `finished` and `failed` are terminal

### Terminal State Invariants

1. Allowed states: `active`, `detached`, `sleeping`, `finished`, `failed`
2. `create` and `attach` are allowed whenever the workspace has interactive context (worktree exists and the workspace is not `creating` or `destroying`); terminal access is not gated on service readiness.
3. `sleeping` terminals must not accept input when the terminal itself is suspended.
4. Workspace `destroy` hard-terminates any non-finished/non-failed terminal.

## Preview `preview_state` Allowed Transitions

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
- `ready -> sleeping` when the workspace environment sleeps
- `sleeping -> provisioning|ready` on wake and route reconcile
- `* -> expired` when workspace is destroyed or TTL-cleaned
- Health check must pass before `preview_state=ready` for all providers

## Enforcement

Everything not listed above is forbidden and must throw `invalid_state_transition` error with `machine`, `from_state`, `to_state`, and `cause`.
