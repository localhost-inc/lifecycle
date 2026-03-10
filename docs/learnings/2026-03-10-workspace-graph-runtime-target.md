# Workspace Graph Runtime Target - 2026-03-10

## Context

The current manifest and startup flow separate one-shot `setup` from long-lived `services`.

That split was good enough to get an initial local runtime contract in place, but it breaks down for real multi-service apps like Kin where install, bootstrap, migration, and runtime services are one connected system.

## Learning

Lifecycle should converge on one workspace-scoped execution DAG rather than keeping `setup` as a separate runtime primitive.

1. The runtime needs typed nodes, not phased orchestration:
   - `task` for deterministic one-shot work
   - `service` for supervised long-lived workloads
2. `depends_on` should be the only scheduling edge.
3. Task success should satisfy downstream dependencies on successful completion.
4. Service success should satisfy downstream dependencies on readiness.
5. Browser-facing access should be routed through workspace ingress rather than by leaking host-port assignments into app code.

## Milestone Impact

1. M2: clarifies that first-start setup is an implementation detail of graph execution, not the end-state runtime model.
2. M4: keeps restart/reset behavior aligned with one environment scheduler instead of a permanent two-phase startup split.
3. M5: improves CLI and observability design because workspace state can be reported from one graph model.
4. M6: preserves provider parity because the same DAG can map onto local or cloud execution.

## Follow-Up Actions

1. Add a graph-runtime reference doc that distinguishes target architecture from the current V1 manifest contract.
2. Refactor provider startup behind a lowering layer from `setup` and `services` into graph nodes.
3. Make workspace network, ingress, and persistent volumes first-class runtime concepts before claiming durable local multi-service support.
