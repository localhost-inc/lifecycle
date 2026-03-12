# Workspace Environment Graph

This document describes the current workspace execution model behind `lifecycle.json`.

## Status

1. The authoring boundary is now graph-native:
   - `workspace`
   - `environment`
2. `environment` is intentionally a flat node map.
3. The node map is not named `services` because some nodes are `task` nodes and some are `service` nodes.

## Goals

1. Keep filesystem preparation in workspace lifecycle, not attached to a single service.
2. Keep runtime ordering explicit through one dependency language: `depends_on`.
3. Keep long-lived service persistence scoped only to real services, not one-shot tasks.
4. Keep the manifest simple enough to read and edit without introducing scheduler-only concepts.

## Lifecycle Split

### `workspace`

`workspace` owns coarse worktree-scoped steps.

- `workspace.setup`
- `workspace.teardown`

`workspace.setup` is for workspace filesystem work only.

- install dependencies
- generate code
- materialize local config files

If something needs a running dependency, it does not belong in `workspace.setup`. It belongs in `environment` as a `task`.

Current local-provider note:

- `workspace.teardown` is part of the manifest contract
- local stop/destroy execution has not been wired yet

### `environment`

`environment` is a DAG of typed nodes keyed by node id.

Node kinds:

- `task`
- `service`

This flattening is intentional:

- the key already identifies the node
- tasks and services share the same dependency language
- a second nested `services` bag would mislabel part of the graph

## Node Semantics

### `task`

One-shot deterministic work.

- dependency is satisfied when the task exits `0`
- failures block downstream dependents
- task cadence can be controlled with `run_on`

Examples:

- migrations
- fixture preload
- emulator bootstrap
- service-dependent env file writes

### `service`

Supervised long-lived workload.

- dependency is satisfied when the service becomes ready
- runtime may be `process` or `image`
- readiness is explicit through `health_check`

Only `kind: "service"` nodes seed `workspace_service` rows, previews, exposure settings, and port overrides.

## Execution Order

Workspace startup currently runs in this order:

1. Parse and validate `lifecycle.json`.
2. Run eligible `workspace.setup` steps.
3. Build the environment graph from `environment`.
4. Drop create-scoped task nodes after the first successful start.
5. Topologically sort the graph and reject missing dependencies or cycles.
6. Execute task nodes and start service nodes in dependency order.
7. Transition the workspace to `active` after all required service readiness checks pass.

There is no `setup.services` bootstrap phase anymore. Service-dependent setup work must be expressed as task nodes in the graph.

## Dependency Rules

1. `depends_on` is the only scheduling edge.
2. Nodes can depend on either tasks or services.
3. Service nodes may depend on task nodes.
4. Task nodes may depend on service nodes or other task nodes.
5. Missing dependencies fail startup before runtime work begins.
6. Cycles fail startup before runtime work begins.

## Networking and Exposure

1. Services discover one another by manifest identity and reserved `LIFECYCLE_SERVICE_*` env vars.
2. Browser-facing apps should prefer provider-managed exposure over hardcoding random local ports into app code.
3. `share_default` still controls default preview exposure for long-lived service nodes.

## UX Fit

The current graph model maps cleanly onto the Environment rail and future graph surfaces.

1. `workspace.setup` can render as a separate ordered lane.
2. `environment` can render as the main DAG.
3. `task` and `service` nodes can carry different status semantics without inventing new manifest concepts.

## Kin Shape

Kin is still the proving ground for this model.

1. `workspace.setup` should only contain filesystem preparation such as dependency install or local env materialization that does not require running infra.
2. `postgres`, `redis`, and `pubsub` are service nodes.
3. `migrate` and `pubsub-bootstrap` are task nodes.
4. `api`, `worker`, `web`, and `admin` depend on those graph nodes directly.

That keeps all runtime ordering in one place instead of splitting it between setup phases and service bootstraps.
