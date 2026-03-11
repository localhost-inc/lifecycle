# Workspace Environment Graph (Target Architecture)

This document defines the target environment architecture for workspace orchestration. It is intentionally forward-looking and does not replace the current V1 `lifecycle.json` contract in [lifecycle-json.md](./lifecycle-json.md).

## Status

1. Current checked-in manifest contract separates `setup` from long-lived `services`.
2. Current providers still execute startup as a phased flow.
3. Target architecture removes the special scheduler treatment of `setup` and converges on an explicit workspace lifecycle plus a workspace-scoped service graph.

## Goals

1. Keep worktree preparation in the workspace lifecycle rather than attaching it to any one service.
2. Explicit dependency ordering with cycle validation.
3. Workspace-scoped service isolation with internal service discovery.
4. Explicit ingress for browser and host access rather than incidental host-port coupling.
5. Durable workspace behavior through persistent volumes and a simple, readable manifest.

## Future Target Model

The environment graph stays stable even if local execution grows beyond today's host-oriented path.

1. `workspace.mode` should remain an authority boundary: `local` or `cloud`.
2. Future local environments may target:
   - `host`
   - `docker`
   - `remote_host`
3. `ssh` should be treated as transport for `remote_host`, not as a third workspace mode.
4. The manifest model does not need separate graph semantics for those targets; `workspace.setup` and `environment.services` remain the same.
5. Only the provider and target adapter should change when the environment runs on a different substrate.

## Workspace Lifecycle

The target architecture distinguishes workspace lifecycle from service lifecycle.

### Workspace-Scoped Actions

Workspace lifecycle owns coarse actions that apply to the whole worktree before the environment graph starts.

1. `workspace.setup`
   - ordered preparation steps that only need the workspace filesystem
   - examples: `bun install`, code generation, local config prep, cache prep
   - setup is not owned by any individual service
2. Environment lifecycle commands stay outside the manifest:
   - `start`
   - `stop`
   - `reset`
   - `sleep`
   - `wake`
   - `destroy`

If something needs Postgres, Redis, Pub/Sub, or any other running dependency, it does not belong in `workspace.setup`. It belongs in the environment graph as a `task`.

## Service Graph

The service graph is a DAG of typed nodes. A node is either a `task` or a `service`.

### Shared Fields

- `depends_on`: upstream node ids that must be satisfied before the node may run
- `env`: explicit environment values or runtime-expanded references
- `cwd`: working directory for process execution
- `startup_timeout_seconds`: maximum wait for completion or readiness

### `task` Nodes

Task nodes model deterministic one-shot work that depends on service availability such as schema migration, emulator bootstrap, and fixture preload.

- dependency is satisfied when the task exits `0`
- failed task blocks downstream dependents
- tasks are part of the environment graph rather than ad hoc hooks

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

There is no separate hook system in the target scheduler. The provider runs `workspace.setup` first, then realizes `environment.services` inside the workspace environment.

1. The provider builds the graph and rejects cycles before runtime work starts.
2. Nodes become runnable when all `depends_on` nodes are satisfied.
3. Independent nodes may run in parallel once their dependencies are satisfied.
4. A satisfied `task` means successful completion.
5. A satisfied `service` means readiness has passed.
6. If a required service loses readiness after dependents start, the environment degrades and the provider decides whether to restart the failed node, stop dependents, or both.

This keeps task semantics and service semantics distinct without creating two unrelated orchestration systems.

## Workspace-Scoped Networking

The service graph runs inside a workspace-scoped environment boundary.

1. Each workspace owns one isolated service network.
2. Internal service discovery is by node identity, not by host-port discovery.
3. Services should address each other by workspace-local names such as `postgres`, `redis`, or `api`.
4. Host-visible access is explicit and routed through workspace ingress.
5. `share_default` should converge from "default exposed host port" toward "default ingress route for this workspace".

This is the part where a port-abstraction approach is conceptually useful. Browser-facing clients should not need hardcoded random host ports if the environment can route by workspace and service identity.

## Ingress Contract

Browser traffic does not participate in the internal workspace network, so the environment needs a workspace ingress.

1. Internal service-to-service calls use workspace-local addresses.
2. Browser-facing apps use workspace ingress routes.
3. A default preview route points to the primary exposed service.
4. Additional exposed services may use named routes or subdomains later.
5. Frontend apps should prefer same-origin or ingress-relative routing over direct host-port wiring when possible.

This keeps web clients from baking local provider port allocations into application code.

## Execution Contract

Provider startup should converge on the following order:

1. Parse manifest and lower any compatibility syntax into workspace setup plus environment graph nodes.
2. Materialize workspace prerequisites and run `workspace.setup`:
   - workspace filesystem preparation
   - dependency caches
   - generated artifacts
3. Validate `environment.services` and materialize workspace environment prerequisites:
   - workspace network
   - persistent volumes
   - reserved env and service-discovery values
4. Start runnable zero-dependency nodes.
5. For each completed task or ready service, unblock downstream nodes.
6. Transition the environment to `active` only after all required service health gates pass.
7. Persist workspace lifecycle metadata, task completion state, and environment metadata.

The scheduler is graph-driven, not phase-driven.

## Compatibility Plan

The current `setup` and `services` manifest structure can remain as authoring input during migration.

1. `setup.steps[]` that prepare shared worktree state lower into `workspace.setup`.
2. `setup.steps[]` that require service dependencies lower into `environment.services` task nodes.
3. `setup.services[]` lower into dependencies of those task nodes.
4. `services.{name}` lower into `environment.services` service nodes.
5. Existing service `depends_on` edges remain intact.
6. Existing provider startup code can migrate behind the lowering layer before the manifest shape changes.
7. Compatibility may exist at the manifest-input boundary, but the executor should converge on one graph path. Do not keep a second legacy scheduler alive after the lowered path ships.

This allows the environment model to move first without forcing an immediate breaking manifest rewrite.

## Graph UX Fit

This structure is also intentionally friendly to a future graph canvas.

1. `workspace.setup` can render as a simple ordered lane distinct from the environment graph.
2. `environment.services` can render as the main DAG because `depends_on` is the only edge language.
3. `task` and `service` nodes can carry different visuals and status semantics without inventing new manifest concepts.
4. Readiness, failure, and blocked-dependency state can be overlaid directly on nodes and edges.
5. A future React Flow-based surface should visualize this contract, not introduce a second graph model in the UI.

## Kin Example

Kin is the concrete proving ground for this model.

1. `workspace.setup` contains `install` because dependency preparation belongs to the workspace, not to any one service.
2. `postgres`, `redis`, and `pubsub` are services.
3. `pubsub-bootstrap` is a task depending on `pubsub`.
4. `migrate` is a task depending on `postgres`.
5. `api` depends on `migrate`, `redis`, and `pubsub`.
6. `worker` depends on `migrate`, `redis`, and `pubsub`.
7. `web` and `admin` depend on `api`.
8. No extra hooks are needed; ordering lives in `workspace.setup` and `depends_on`.
9. If Kin needs `.env.local` materialization, that should come from manifest-owned setup file writes or direct service `env_vars`, not repo-local Lifecycle helper scripts.

If Kin requires repo-specific lifecycle hooks outside this graph, the model is still too weak.

### Full Kin Manifest Example

The manifest below is intentionally concrete. It is the grounding example for the target model:

- workspace-scoped `setup`
- one service graph using only `task` and `service`
- service-to-service wiring by workspace-local identity
- browser-facing origins resolved by environment exposure rather than hardcoded host ports

```jsonc
{
  "workspace": {
    "setup": [
      {
        "name": "install",
        "command": "bun install",
        "when": "create",
        "timeout_seconds": 900
      }
    ]
  },
  "environment": {
    "services": {
      "postgres": {
        "kind": "service",
        "runtime": "image",
        "image": "postgres:16-alpine",
        "port": 5432,
        "volumes": [
          {
            "source": "workspace://postgres",
            "target": "/var/lib/postgresql/data"
          }
        ],
        "env_vars": {
          "POSTGRES_DB": "kin",
          "POSTGRES_USER": "root",
          "POSTGRES_PASSWORD": "root"
        },
        "startup_timeout_seconds": 60,
        "health_check": {
          "kind": "tcp",
          "host": "postgres",
          "port": 5432,
          "timeout_seconds": 60
        }
      },
      "redis": {
        "kind": "service",
        "runtime": "image",
        "image": "redis:7-alpine",
        "command": "redis-server",
        "args": ["--appendonly", "yes"],
        "port": 6379,
        "volumes": [
          {
            "source": "workspace://redis",
            "target": "/data"
          }
        ],
        "startup_timeout_seconds": 45,
        "health_check": {
          "kind": "tcp",
          "host": "redis",
          "port": 6379,
          "timeout_seconds": 45
        }
      },
      "pubsub": {
        "kind": "service",
        "runtime": "image",
        "image": "gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators",
        "command": "gcloud",
        "args": [
          "beta",
          "emulators",
          "pubsub",
          "start",
          "--host-port=0.0.0.0:8785",
          "--project=kin-svc-stg"
        ],
        "port": 8785,
        "startup_timeout_seconds": 60,
        "health_check": {
          "kind": "tcp",
          "host": "pubsub",
          "port": 8785,
          "timeout_seconds": 60
        }
      },
      "pubsub-bootstrap": {
        "kind": "task",
        "runtime": "process",
        "cwd": ".",
        "depends_on": ["pubsub"],
        "timeout_seconds": 120,
        "env_vars": {
          "GCP_PROJECT": "kin-svc-stg"
        },
        "command": "bunx kin ops pubsub create --emulator --emulator-host=pubsub:8785 --project=kin-svc-stg --topic=jobs --subscription=jobs-sub --dlq-topic=jobs-dlq"
      },
      "migrate": {
        "kind": "task",
        "runtime": "process",
        "cwd": "apps/api",
        "depends_on": ["postgres", "redis", "pubsub-bootstrap"],
        "timeout_seconds": 600,
        "env_vars": {
          "SVC_ENV": "dev",
          "DATABASE_URL": "postgresql://root:root@postgres:5432/kin",
          "REDIS_URL": "redis://redis:6379",
          "PUBSUB_EMULATOR_HOST": "pubsub:8785",
          "GCP_PROJECT": "kin-svc-stg",
          "WEB_ORIGIN": "${service.web.origin}",
          "ADMIN_ORIGIN": "${service.admin.origin}",
          "API_ORIGIN": "${service.api.origin}"
        },
        "command": "bun run db:migrate"
      },
      "api": {
        "kind": "service",
        "runtime": "process",
        "cwd": "apps/api",
        "depends_on": ["migrate", "redis", "pubsub-bootstrap"],
        "command": "bun run dev:server",
        "port": 3001,
        "expose": {
          "name": "api"
        },
        "startup_timeout_seconds": 120,
        "health_check": {
          "kind": "http",
          "url": "http://api:3001/health",
          "timeout_seconds": 120
        },
        "env_vars": {
          "SVC_ENV": "dev",
          "SVC_TYPE": "server",
          "PORT": "3001",
          "DATABASE_URL": "postgresql://root:root@postgres:5432/kin",
          "REDIS_URL": "redis://redis:6379",
          "PUBSUB_EMULATOR_HOST": "pubsub:8785",
          "GCP_PROJECT": "kin-svc-stg",
          "WEB_ORIGIN": "${service.web.origin}",
          "ADMIN_ORIGIN": "${service.admin.origin}",
          "API_ORIGIN": "${service.api.origin}"
        }
      },
      "worker": {
        "kind": "service",
        "runtime": "process",
        "cwd": "apps/api",
        "depends_on": ["migrate", "redis", "pubsub-bootstrap"],
        "command": "bun run dev:worker",
        "startup_timeout_seconds": 120,
        "env_vars": {
          "SVC_ENV": "dev",
          "SVC_TYPE": "worker",
          "DATABASE_URL": "postgresql://root:root@postgres:5432/kin",
          "REDIS_URL": "redis://redis:6379",
          "PUBSUB_EMULATOR_HOST": "pubsub:8785",
          "GCP_PROJECT": "kin-svc-stg",
          "WEB_ORIGIN": "${service.web.origin}",
          "ADMIN_ORIGIN": "${service.admin.origin}",
          "API_ORIGIN": "${service.api.origin}"
        }
      },
      "admin": {
        "kind": "service",
        "runtime": "process",
        "cwd": "apps/admin",
        "depends_on": ["api"],
        "command": "bun run dev",
        "port": 3002,
        "expose": {
          "name": "admin"
        },
        "startup_timeout_seconds": 60,
        "health_check": {
          "kind": "tcp",
          "host": "admin",
          "port": 3002,
          "timeout_seconds": 60
        },
        "env_vars": {
          "ADMIN_PORT": "3002",
          "VITE_SVC_ENV": "dev",
          "VITE_API_ORIGIN": "${service.api.origin}"
        }
      },
      "web": {
        "kind": "service",
        "runtime": "process",
        "cwd": "apps/web",
        "depends_on": ["api"],
        "command": "bun run dev",
        "port": 3000,
        "expose": {
          "default": true
        },
        "startup_timeout_seconds": 60,
        "health_check": {
          "kind": "tcp",
          "host": "web",
          "port": 3000,
          "timeout_seconds": 60
        },
        "env_vars": {
          "WEB_PORT": "3000",
          "VITE_SVC_ENV": "dev",
          "VITE_API_ORIGIN": "${service.api.origin}"
        }
      }
    }
  }
}
```

## Durability Requirements

Graph execution alone is not enough to make local workspaces durable.

1. Stateful services need per-workspace persistent volumes.
2. Workspace setup needs clear cadence rules, but the manifest should stay declarative rather than exposing scheduler internals.
3. The environment must surface typed failures rather than silently falling back to ad hoc host behavior.
4. Workspace restart must restore workspace lifecycle state and graph state from durable metadata rather than guessing from process leftovers.

## Non-Goals

1. This document does not change the current V1 `lifecycle.json` schema on its own.
2. This document does not require all process services to run in containers.
3. This document intentionally does not add generic manifest hooks such as `before|after|success|failure` at the workspace or service level.
4. This document does not define every cadence nuance for future setup/task execution yet.
