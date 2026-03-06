# State Machines

Canonical transition rules for all Lifecycle state machines. This is the single source of truth for transition guards and implementation tests.

## Workspace `status` Allowed Transitions

- `creating -> starting|sleeping|failed`
- `starting -> ready|failed`
- `ready -> starting|resetting|sleeping|destroying|failed` (`ready -> sleeping` only for idle-timeout cause)
- `resetting -> starting|failed`
- `sleeping -> starting|destroying|failed`
- `failed -> starting|resetting|destroying`
- `destroying -> deleted` (terminal)

### Workspace State Invariants

1. Allowed states: `creating`, `starting`, `ready`, `resetting`, `sleeping`, `destroying`, `failed`
2. Transitional status acts as implicit mutation lock for workspace/service mutations (`creating|starting|resetting|sleeping|destroying`). Terminal create/attach is governed by interactive workspace context instead of service readiness.
3. Project `setup` executes exactly once per workspace create
4. All defined services must pass health checks before transition to `ready`

### State Semantics by Mode

| State | `CloudWorkspaceProvider` | `LocalWorkspaceProvider` |
|-------|-------------------|-------------------|
| `creating` | Provisioning sandbox + clone + setup | Creating git worktree and persisting workspace metadata |
| `starting` | Starting services in sandbox | Running first-boot setup (if needed) and starting local processes + containers |
| `ready` | Health checks pass in sandbox | Health checks pass on localhost |
| `sleeping` | R2 backup, sandbox terminated | Processes stopped, worktree preserved |
| `destroying` | Sandbox terminated, metadata cleaned | Processes killed, worktree pruned |

- All failed transitions include typed `failure_reason` and `failed_at`
- All forbidden transitions must throw `invalid_state_transition` error with current/target state in `details`

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
- `ready -> sleeping` when workspace sleeps
- `sleeping -> provisioning|ready` on wake and route reconcile
- `* -> expired` when workspace is destroyed or TTL-cleaned
- Health check must pass before `preview_state=ready` for all providers

## Enforcement

Everything not listed above is forbidden and must throw `invalid_state_transition` error with `machine`, `from_state`, `to_state`, and `cause`.
