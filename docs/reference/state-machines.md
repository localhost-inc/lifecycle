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
- `active -> starting|stopping`
- `stopping -> idle`

### Workspace Environment Invariants

1. Allowed states: `idle`, `starting`, `active`, `stopping`
2. Transitional environment status acts as implicit mutation lock for environment/service mutations (`starting|stopping`). Terminal create/attach is governed by interactive workspace context instead of service readiness.
3. V1 `setup` follows each step's declared cadence; ordinary environment stop/start does not replay create-scoped setup work.
4. Cold starts and additive service boots both use `starting`; the environment returns to `active` once the current boot target is healthy.
5. Full cold starts require all targeted services to pass health checks before transition to `active`.
6. Failed cold starts land back in `idle`; failed additive service boots return to `active` when the workspace was already running. Service-level failures still surface on the affected `workspace_service` rows.
7. Workspace creation and deletion are workspace-lifecycle concerns, not environment-status values.

### Environment State Semantics by Mode

| State | `CloudWorkspaceProvider` | `LocalWorkspaceProvider` |
|-------|-------------------|-------------------|
| `idle` | No active sandbox services; workspace record persists | No running services; worktree persists |
| `starting` | Provisioning or starting sandbox services | Running any required workspace setup and starting the current local service target, including additive boots from an already-active environment |
| `active` | Health checks pass in sandbox | Health checks pass on localhost |
| `stopping` | Sandbox services are shutting down | Processes and containers are shutting down |

- Failed cold starts record typed `failure_reason` and `failed_at` while returning the workspace to `idle`
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

## Workspace Git Action State

Workspace Git actions use a derived state machine rather than imperative transition commands. The machine is computed from:

1. `GitStatusResult`
2. current-branch pull request context
3. query loading state for the current branch

This derived state powers the workspace Git split button and any future workspace-scoped Git action surfaces.

### Workspace Git Action States

- `loading`
- `provider_unavailable`
- `detached`
- `needs_stage`
- `needs_commit`
- `needs_push`
- `blocked_behind`
- `blocked_diverged`
- `no_pull_request_changes`
- `ready_to_create_pull_request`
- `view_pull_request`
- `ready_to_merge`

### Workspace Git Action Derivation Order

1. `loading`
   - use when the current branch is known to be clean/synced enough for PR actions, but the current-branch PR context is still loading
2. `provider_unavailable`
   - use when PR support reports unavailable either before branch resolution or after the branch is clean and synced
3. `detached`
   - use when no current branch is checked out
4. `needs_stage`
   - use when local changes exist but none are staged
5. `needs_commit`
   - use when staged changes exist
6. `needs_push`
   - use when the branch has no upstream yet or local commits are ahead of upstream
7. `blocked_behind`
   - use when the branch is behind its upstream
8. `blocked_diverged`
   - use when the branch is both ahead of and behind its upstream
9. `no_pull_request_changes`
   - use when the branch is clean, synced, pushed, PR support is available, no open PR exists for the branch, and the current branch has no committed diff against its base branch
10. `ready_to_create_pull_request`
   - use when the branch is clean, synced, pushed, PR support is available, no open PR exists for the branch, and the current branch has committed diff against its base branch
11. `ready_to_merge`
   - use when the branch has an open non-draft PR that is currently mergeable
12. `view_pull_request`
   - use when the branch has an open PR that should be reviewed/opened rather than merged directly

### Workspace Git Action Invariants

1. Local composition work takes precedence over PR work:
   - `needs_stage` and `needs_commit` suppress push/create/merge PR primary actions
2. Remote sync blockers take precedence over PR work on clean branches:
   - `blocked_behind` and `blocked_diverged` must suppress push/create/merge PR primary actions
3. `commit_and_push` is only valid when the branch exists and remote sync is not blocked by `behind` or `diverged`
4. Clean synced branches must not surface PR actions until current-branch PR support/state is known
5. `ready_to_create_pull_request` requires committed branch diff against the resolved base branch
6. Pull request actions are branch-scoped:
   - they derive from the current branch's open PR, not the repository-wide PR list
