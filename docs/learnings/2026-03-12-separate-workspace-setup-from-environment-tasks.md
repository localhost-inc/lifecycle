# Separate Workspace Setup From Environment Tasks

## Context

While wiring Kin onto Lifecycle, the desktop UI treated `workspace.setup` progress and environment task progress as the same thing. That made `migrate` and other one-shot environment tasks show up in the `Setup` tab and surface as `setup_step_failed`, even though they are part of the environment graph rather than workspace preparation.

## Decision

Lifecycle now treats these as separate domains:

1. `workspace.setup` emits `workspace.setup_progress`.
2. Environment task nodes emit `environment.task_progress`.
3. Workspace failures caused by environment tasks record `workspace.failure_reason = environment_task_failed`.
4. The desktop `Environment` panel no longer has a separate `Setup` tab. `Overview` contains distinct sections for workspace setup, environment tasks, and services/topology.

## Why

1. `workspace.setup` is worktree preparation.
2. Environment task nodes are part of the executable environment graph.
3. Conflating them makes failures harder to understand and pushes the UI toward misleading band-aids like step scopes inside setup state.

## Milestone Impact

1. M5 lifecycle controls now present startup phases more honestly.
2. Kin boot failures can distinguish setup issues from environment task issues without inventing service-specific exceptions in the manifest.

## Follow-up

1. Add first-class docs for `workspace.setup_progress` and `environment.task_progress` in the event reference instead of relying on reducer code as the clearest contract.
2. Consider whether the `Overview` list should show task history after boot or only active/failed tasks.
