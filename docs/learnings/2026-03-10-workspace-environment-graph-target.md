# Workspace Environment Graph Target - 2026-03-10

## Context

The current manifest and startup flow separate one-shot `setup` from long-lived `services`.

That split was good enough to get an initial local environment contract in place, but it breaks down for real multi-service apps like Kin where install, bootstrap, migration, and runtime services are one connected system.

## Learning

Lifecycle should converge on an explicit workspace lifecycle plus a workspace-scoped service graph rather than keeping `setup` as a separate environment primitive.

1. Workspace lifecycle should own coarse actions:
   - `workspace.setup` for shared worktree preparation
   - environment lifecycle commands stay outside the manifest
2. The service graph should use typed nodes, not phased orchestration:
   - `task` for deterministic one-shot work
   - `service` for supervised long-lived workloads
3. `depends_on` should be the only scheduling edge inside the service graph.
4. Task success should satisfy downstream dependencies on successful completion.
5. Service success should satisfy downstream dependencies on readiness.
6. Browser-facing access should be routed through workspace ingress rather than by leaking host-port assignments into app code.
7. The manifest should stay simple:
   - no generic hook bag
   - no `targets`
   - no manifest-level `inputs` or `rerun` scheduler internals

## Milestone Impact

1. M2: clarifies that first-start setup is a transitional implementation detail, not the end-state environment model.
2. M4: keeps restart/reset behavior aligned with one environment controller and one service graph instead of a permanent two-phase startup split.
3. M5: improves CLI and observability design because workspace lifecycle state and service graph state can be reported explicitly.
4. M6: preserves provider parity because the same workspace lifecycle plus service graph can map onto local or cloud execution.

## Follow-Up Actions

1. Add an environment-graph reference doc that distinguishes target architecture from the current V1 manifest contract.
2. Refactor provider startup behind a lowering layer from current `setup` and `services` into `workspace.setup` plus `environment.services`.
3. Make workspace network, ingress, and persistent volumes first-class environment concepts before claiming durable local multi-service support.
