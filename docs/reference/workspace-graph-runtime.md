# Workspace Graph Runtime (Target Architecture)

This document defines the target runtime architecture for workspace orchestration. It is intentionally forward-looking and does not replace the current V1 `lifecycle.json` contract in [lifecycle-json.md](./lifecycle-json.md).

## Status

1. Current checked-in manifest contract separates `setup` from long-lived `services`.
2. Current providers still execute startup as a phased flow.
3. Target architecture removes the special scheduler treatment of `setup` and converges on one workspace-scoped execution graph.

## Goals

1. One scheduler model for install, bootstrap, migrations, and long-lived services.
2. Explicit dependency ordering with cycle validation.
3. Workspace-scoped service isolation with internal service discovery.
4. Explicit ingress for browser and host access rather than incidental host-port coupling.
5. Durable workspace behavior through persistent volumes and explicit task rerun policy.

## Graph Model

The runtime graph is a DAG of typed nodes. A node is either a one-shot `task` or a long-lived `service`.

### Shared Fields

- `depends_on`: upstream node ids that must be satisfied before the node may run
- `env`: explicit environment values or runtime-expanded references
- `cwd`: working directory for process execution
- `startup_timeout_seconds`: maximum wait for completion or readiness

### `task` Nodes

Task nodes model deterministic one-shot work such as dependency install, schema migration, and fixture bootstrap.

- dependency is satisfied when the task exits `0`
- failed task blocks downstream dependents
- task rerun policy is explicit:
  - `once`
  - `always`
  - future: `on_input_change`

### `service` Nodes

Service nodes model supervised long-lived workloads.

- dependency is satisfied when the service becomes `ready`
- runtime may be `process` or `image`
- readiness is explicit:
  - `tcp`
  - `http`
  - future: `command`, `log`
- restart policy remains service-scoped

## Dependency Semantics

There is no separate setup phase in the target scheduler.

1. The provider builds the graph and rejects cycles before runtime work starts.
2. Nodes become runnable when all `depends_on` nodes are satisfied.
3. Independent nodes may run in parallel once their dependencies are satisfied.
4. A satisfied `task` means successful completion.
5. A satisfied `service` means readiness has passed.
6. If a required service loses readiness after dependents start, the environment degrades and the provider decides whether to restart the failed node, stop dependents, or both.

This keeps task semantics and service semantics distinct without creating two unrelated orchestration systems.

## Workspace-Scoped Networking

The graph runs inside a workspace-scoped runtime boundary.

1. Each workspace owns one isolated service network.
2. Internal service discovery is by node identity, not by host-port discovery.
3. Services should address each other by workspace-local names such as `postgres`, `redis`, or `api`.
4. Host-visible access is explicit and routed through workspace ingress.
5. `share_default` should converge from "default exposed host port" toward "default ingress route for this workspace".

This is the part where a port-abstraction approach is conceptually useful. Browser-facing clients should not need hardcoded random host ports if the runtime can route by workspace and service identity.

## Ingress Contract

Browser traffic does not participate in the internal workspace network, so the runtime needs a workspace ingress.

1. Internal service-to-service calls use workspace-local addresses.
2. Browser-facing apps use workspace ingress routes.
3. A default preview route points to the primary exposed service.
4. Additional exposed services may use named routes or subdomains later.
5. Frontend apps should prefer same-origin or ingress-relative routing over direct host-port wiring when possible.

This keeps web clients from baking local provider port allocations into application code.

## Execution Contract

Provider startup should converge on the following order:

1. Parse manifest and lower any compatibility syntax into graph nodes.
2. Validate the graph and materialize workspace runtime prerequisites:
   - workspace network
   - persistent volumes
   - reserved env and service-discovery values
3. Start runnable zero-dependency nodes.
4. For each completed task or ready service, unblock downstream nodes.
5. Transition the environment to `active` only after all required service health gates pass.
6. Persist task completion state and workspace runtime metadata.

The scheduler is graph-driven, not phase-driven.

## Compatibility Plan

The current `setup` and `services` manifest structure can remain as authoring input during migration.

1. `setup.steps[]` lower into synthetic `task` nodes.
2. `setup.services[]` lower into dependencies of those task nodes.
3. `services.{name}` lower into `service` nodes.
4. Existing service `depends_on` edges remain intact.
5. Existing provider startup code can migrate behind the lowering layer before the manifest shape changes.

This allows the runtime to move first without forcing an immediate breaking manifest rewrite.

## Kin Example

Kin is the concrete proving ground for this model.

1. `install` is a task.
2. `postgres`, `redis`, and `pubsub` are services.
3. `pubsub-bootstrap` is a task depending on `pubsub`.
4. `migrate` is a task depending on `install` and `postgres`.
5. `api` depends on `migrate`, `redis`, and `pubsub`.
6. `worker` depends on `migrate`, `redis`, and `pubsub`.
7. `web` and `admin` depend on `api`.

If Kin requires repo-specific lifecycle hooks outside this graph, the model is still too weak.

## Durability Requirements

Graph execution alone is not enough to make local workspaces durable.

1. Stateful services need per-workspace persistent volumes.
2. Task rerun policy needs explicit invalidation rules.
3. The runtime must surface typed failures rather than silently falling back to ad hoc host behavior.
4. Workspace restart must restore graph state from durable metadata rather than guessing from process leftovers.

## Non-Goals

1. This document does not change the current V1 `lifecycle.json` schema on its own.
2. This document does not require all process services to run in containers.
3. This document does not define the final public manifest names for a post-V1 graph-native schema.
