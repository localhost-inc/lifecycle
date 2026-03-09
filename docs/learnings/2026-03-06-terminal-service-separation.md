# Terminal and Service Runtime Separation - 2026-03-06

## Context

Local workspaces now create a worktree before any services are started. The terminal surface is still an important programming entry point, but it is no longer the intended primary agent UX once the Lifecycle-native center panel lands.

## Learning

Terminal interactivity and service runtime readiness are separate concerns:

1. Terminal create/attach should key off interactive workspace context, not `workspace.status === ready`.
2. For local workspaces, interactive context means the worktree exists and the workspace is not in create/destroy teardown.
3. Service `sleeping` should mean "services are stopped" rather than "the workspace is not programmable."

## Milestone Impact

1. M3: newly created workspaces can open directly into a harness terminal without waiting for service startup.
2. M4: run/sleep/wake controls must only manage service/runtime state; they should not implicitly suspend agent terminals.
3. M6: cloud terminal access should keep the same high-level contract by resolving interactive context provider-side instead of hardcoding local-ready assumptions.

## Follow-Up Actions

1. Add a user-facing default harness preference once multiple harness providers become first-class choices in workspace creation.
2. Revisit whether `terminal.status = sleeping` is still needed for any local provider path, or whether it should be reserved for explicit terminal suspension semantics.
