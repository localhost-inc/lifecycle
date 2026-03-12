# `lifecycle.json` Configuration

Canonical specification for the checked-in workspace manifest.

## Overview

1. `lifecycle.json` is JSONC. Comments and trailing commas are allowed.
2. Required top-level fields:
   - `workspace`
   - `environment`
3. The manifest is graph-native. There is no `setup.services` compatibility layer and no separate top-level `services` bag.
4. The manifest intentionally omits future `reset` and `mcps` config until those contracts are actually implemented.

## Top-Level Shape

```jsonc
{
  "workspace": {
    "setup": [],
    "teardown": []
  },
  "environment": {}
}
```

## `workspace` Contract

### `workspace.setup`

Ordered filesystem-scoped preparation steps.

- Each step must define:
  - `name`
  - `timeout_seconds`
  - exactly one of `command` or `write_files`
- Optional step fields:
  - `cwd`
  - `env`
  - `run_on` (`create` or `start`)
- `run_on` defaults to `create`
- `run_on=create` steps run only before the first successful workspace start
- `run_on=start` steps run on every workspace start
- `workspace.setup` must not declare `depends_on`

Use `workspace.setup` for work that only needs the workspace filesystem:

- dependency installation
- code generation
- local config materialization
- cache priming

If a step needs Postgres, Redis, Pub/Sub, or any other running workload, it belongs in `environment` as a `kind: "task"` node instead.

### `workspace.teardown`

Ordered workspace teardown steps.

- Uses the same step shape as `workspace.setup`
- Must not declare `depends_on`
- Must not declare `run_on`

Current local-provider status:

- `workspace.teardown` is accepted by the manifest contract
- local stop/destroy execution is not wired yet

That field exists to preserve the intended authoring boundary without reintroducing ad hoc hooks later.

## Step Actions

### `command`

Run a shell command inside the workspace.

### `write_files`

Materialize one or more files inside the workspace.

- Each entry must define `path`
- Each entry must define exactly one of:
  - `content`
  - `lines`
- Relative paths resolve from the step `cwd` when present, otherwise from the workspace root
- Paths must stay inside the workspace worktree

## Reserved Runtime Env

Lifecycle injects reserved discovery env vars into workspace steps and service processes:

- `LIFECYCLE_WORKSPACE_ID`
- `LIFECYCLE_WORKSPACE_NAME`
- `LIFECYCLE_WORKSPACE_SOURCE_REF`
- `LIFECYCLE_WORKSPACE_PATH`
- `LIFECYCLE_WORKSPACE_SLUG`
- `LIFECYCLE_SERVICE_<NODE_NAME>_HOST`
- `LIFECYCLE_SERVICE_<NODE_NAME>_PORT`
- `LIFECYCLE_SERVICE_<NODE_NAME>_ADDRESS`

Reserved `LIFECYCLE_*` values may be referenced inside:

- workspace step `write_files.content`
- workspace step `write_files.lines[]`
- workspace step `env`
- environment node `env`

Unknown `LIFECYCLE_*` references fail workspace start with a field-level error.

## `environment` Contract

`environment` is a flat map of typed graph nodes. The map key is the node identity.

Node kinds:

- `kind: "task"`
- `kind: "service"`

Shared graph field:

- `depends_on`: upstream environment node ids

### `task` Nodes

Deterministic one-shot work that runs inside the environment graph.

Required fields:

- `kind: "task"`
- `timeout_seconds`
- exactly one of `command` or `write_files`

Optional fields:

- `cwd`
- `env`
- `depends_on`
- `run_on` (`create` or `start`)

Task nodes derive their identity from the `environment` map key, so they do not need a second `name` field.

Examples:

- migrations
- emulator bootstrap
- fixture preload
- repo-local env writes that require service ports or readiness

### `service` Nodes

Supervised long-lived workloads.

Required fields:

- `kind: "service"`
- `runtime`

`runtime: "process"`:

- required: `command`
- optional: `cwd`, `env`, `depends_on`, `startup_timeout_seconds`, `health_check`, `port`, `share_default`

`runtime: "image"`:

- required: at least one of `image` or `build`
- optional: `command`, `args`, `env`, `depends_on`, `startup_timeout_seconds`, `health_check`, `port`, `share_default`, `volumes`

Additional service fields:

- `image.build`: `{ "context": "<path>", "dockerfile": "<optional path>" }`
- `volumes`: `{ "source": "<path|workspace://name>", "target": "<container path>", "read_only": true|false }`
- `port`: preferred/default local port; provider may assign a different stable `effective_port` when needed
- `share_default`: default `workspace_service.exposure` on create (`true -> local`, omitted/`false -> internal`)
- `workspace://<name>` volume sources resolve to provider-managed persistent workspace storage

### `health_check`

Optional service readiness gate.

- `kind: "tcp"`
- `kind: "http"`

Workspace start transitions to `active` only after all declared service health checks pass.

## Secret Handling

Local manifests do not support managed secrets.

- top-level `secrets` is invalid
- `${secrets.*}` references are invalid

Materialize local env files in workspace setup instead.

## Canonical Example

```jsonc
{
  "workspace": {
    "setup": [
      { "name": "install", "command": "bun install --frozen-lockfile", "timeout_seconds": 300 }
    ],
    "teardown": [
      { "name": "cleanup", "command": "rm -f .env.local", "timeout_seconds": 10 }
    ]
  },

  "environment": {
    "postgres": {
      "kind": "service",
      "runtime": "image",
      "build": { "context": "docker", "dockerfile": "docker/Dockerfile.pg.dev" },
      "startup_timeout_seconds": 45,
      "volumes": [
        { "source": "workspace://postgres", "target": "/var/lib/postgresql/data" },
        { "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true }
      ],
      "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 5432, "timeout_seconds": 45 },
      "env": {
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "app",
        "POSTGRES_DB": "app"
      }
    },
    "redis": {
      "kind": "service",
      "runtime": "image",
      "image": "redis:7-alpine",
      "command": "redis-server",
      "args": ["--save", "", "--appendonly", "no"],
      "startup_timeout_seconds": 30,
      "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 6379, "timeout_seconds": 30 }
    },
    "migrate": {
      "kind": "task",
      "command": "bun run db:migrate",
      "depends_on": ["postgres"],
      "timeout_seconds": 120,
      "run_on": "start"
    },
    "api": {
      "kind": "service",
      "runtime": "process",
      "command": "bun run dev:api",
      "cwd": "apps/api",
      "depends_on": ["migrate", "redis"],
      "port": 3001,
      "share_default": true,
      "health_check": {
        "kind": "http",
        "url": "http://127.0.0.1:3001/health",
        "timeout_seconds": 45
      },
      "env": {
        "DATABASE_URL": "postgres://app:app@127.0.0.1:${LIFECYCLE_SERVICE_POSTGRES_PORT}/app",
        "REDIS_URL": "redis://127.0.0.1:${LIFECYCLE_SERVICE_REDIS_PORT}"
      }
    },
    "web": {
      "kind": "service",
      "runtime": "process",
      "command": "bun run dev",
      "cwd": "apps/web",
      "depends_on": ["api"],
      "port": 3000,
      "share_default": true,
      "env": {
        "VITE_API_ORIGIN": "http://${LIFECYCLE_SERVICE_API_ADDRESS}"
      }
    }
  }
}
```
