# Workspace vs Environment Lifecycle Split - 2026-03-09

## Context

Lifecycle has been overloading `workspace.status` to mean both:

1. the durable thing that exists, can later be archived, and can eventually be destroyed
2. the runnable service/process/container layer that starts, stops, sleeps, wakes, resets, and fails

That overload is manageable for early local execution, but it becomes confusing once we want explicit environment start/stop controls, workspace archive semantics, and a clean event model.

## Learning

The correct boundary is:

1. `workspace` is the durable shell.
   - identity
   - worktree ownership
   - provider mode
   - archive metadata
2. `environment` is the singleton execution layer attached to a workspace.
   - start
   - stop
   - sleep
   - wake
   - reset
   - fail
3. `workspace_service` is per-service runtime state inside that environment.

The environment is a first-class concept, but it does not need a separate table while there is exactly one environment per workspace. The clean representation is:

1. workspace lifecycle metadata on `workspace`
2. environment lifecycle fields on `workspace`
3. per-service lifecycle on `workspace_service`

## Milestone Impact

1. M4: local environment controls should target the environment lifecycle, not durable workspace existence.
2. M4: archive/destroy semantics must be modeled as workspace-lifecycle actions that drive the environment down as part of their flow.
3. M5: CLI commands should distinguish workspace management from environment control instead of extending the overloaded `workspace.status` model.
4. M6: cloud workspace lifecycle can reuse the same workspace/environment/service split without creating a second vocabulary for sandbox state.

## Follow-Up Actions

1. Split the overloaded `workspace.status` contract into workspace lifecycle metadata plus `environment_status` on the workspace record.
2. Migrate canonical lifecycle facts from workspace execution-state wording toward explicit environment facts.
3. Keep environment as a singleton concept on `workspace` unless a real multi-environment-per-workspace requirement emerges.
4. Avoid introducing new product behavior that treats ordinary start/stop as durable workspace lifecycle transitions.
