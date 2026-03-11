# `lifecycle.json` Configuration (V1)

Canonical specification for the `lifecycle.json` project environment configuration file.

## Overview

1. V1 project source of truth:
   - project file `lifecycle.json` (JSONC — JSON with comments)
   - parsed with a JSONC-aware parser; comments and trailing commas are permitted
   - a published JSON Schema provides editor autocomplete and inline validation
   - target environment direction beyond this V1 split is captured in [workspace-environment-graph.md](./workspace-environment-graph.md)
2. Required top-level fields:
   - `setup`, `services`
   - optional: `secrets`, `reset`, `mcps`
   - dropped from wedge: `repository` block (VCS identity is on the `repository` table, not in config), `workspace` block (`idle_timeout_minutes` is now org-level policy)

## `setup` Contract

- Optional `services` list starts those named services, plus their transitive `depends_on` chain, before setup steps run
- List of deterministic steps (`name`, `timeout_seconds`, optional `cwd`, optional `env_vars`, optional `run_on`)
- Each setup step must define exactly one action:
  - `command`: run a shell command
  - `write_files`: materialize one or more non-secret files into the workspace
- Each `write_files` entry must define:
  - `path`
  - exactly one of `content` or `lines`
- `run_on` defaults to `create`
- `run_on=create` steps run on the first successful workspace start only
- `run_on=start` steps run on every workspace start after any `setup.services` infra is ready
- Examples: dependency install, schema/bootstrap, fixture preload
- Host-mode apps should prefer direct `env_vars` wiring from reserved `LIFECYCLE_SERVICE_*` values.
- If a toolchain requires `.env.local` or similar files, materialize them with `setup.steps[].write_files` instead of repo-local helper scripts.
- Setup must not write plaintext secrets to disk (for example `.env` copies with real values)
- Lifecycle injects reserved discovery env vars into setup steps and process services:
  - `LIFECYCLE_WORKSPACE_ID`, `LIFECYCLE_WORKSPACE_NAME`, `LIFECYCLE_WORKSPACE_SOURCE_REF`, `LIFECYCLE_WORKSPACE_PATH`, `LIFECYCLE_WORKSPACE_SLUG`
  - `LIFECYCLE_SERVICE_<SERVICE_NAME>_HOST`, `..._PORT`, and `..._ADDRESS` for every declared service with an assigned local port
- Reserved `LIFECYCLE_*` values may be referenced inside:
  - setup `write_files.content`
  - setup `write_files.lines[]`
  - setup `env_vars`
  - service `env_vars`
- Unknown `LIFECYCLE_*` template references fail workspace start with a field-level error.

## `services` Contract

- Each named service defines `runtime` (`process` or `image`)
- `process` runtime required field: `command`
- `image` runtime requires at least one of `image` or `build`
- `image.build` supports `{ "context": "<path>", "dockerfile": "<optional path>" }`
- `image.volumes` supports bind mounts via `{ "source": "<path|workspace://name>", "target": "<container path>", "read_only": true|false }`
- Shared optional fields: `cwd` (process only), `env_vars`, `depends_on`, `restart_policy`, `startup_timeout_seconds`, `health_check`, `port`, `share_default`
- `env_vars` may reference reserved `LIFECYCLE_*` values directly, which are expanded by the provider before process or container start
- `port` is the service's preferred/default local port; the local provider may assign a different stable host `effective_port` per workspace when the default would collide
- `share_default` (`true|false`) controls default `workspace_service.exposure` on workspace create (`true -> local`, omitted/`false -> internal`)
- Services are long-lived environment workloads; they are not one-shot setup commands
- `workspace://<name>` volume sources resolve to persistent workspace-local storage managed by the provider

## `health_check` Contract (Service-Level)

- Optional per-service `health_check` object with readiness criteria via `kind` (`tcp` or `http`)
- Workspace transitions to `active` only after all defined service health checks pass

## `secrets` Contract

- Optional: declarative mapping from logical keys to managed secret references
- Each key maps to `{ "ref": "<scope>/<name>", "required": true|false }`
- No `provider` field — only one provider exists (`lifecycle`); extend schema when a second provider ships
- Secret values are resolved server-side at runtime and injected into process environment only
- Secret values must never be persisted to repository files, logs, or workspace metadata

## `reset` Options

- Optional: `reseed` (rerun deterministic seed commands) or `snapshot` (restore from captured baseline)

## `mcps` Contract

- Optional: named MCP server declarations with `command`, `args`, `transport` (`stdio` or `sse`), and `env_vars`
- MCP dependencies are installed during workspace `setup` and cached in R2
- At terminal start (when harness is set), Lifecycle generates the harness-native MCP config (e.g., `.claude/settings.json`) from these declarations
- MCP secrets use the same `${secrets.*}` resolution as services

## Execution Portability

- `lifecycle.json` defines WHAT to run, not WHERE — the same manifest is consumed by any `WorkspaceProvider`
- `process` runtime: portable (child process in any provider)
- `image` runtime: requires Docker-compatible image execution (cloud: DinD in sandbox, local: Docker Desktop)
- `image.build` and `image.volumes` are part of the local-first contract because real projects often need custom images and persistent state, not just public registry pulls
- Secrets: resolved via control plane for both providers. Cloud: server-side injection. Local: fetched via CLI auth, injected as env vars.
- Privileged Docker assumptions are out of scope for the V1 cloud environment
- Service networking contract is localhost/port readiness, not custom bridge/iptables authoring

## Out-of-Scope for V1 Config

- Compose file import/normalization

## Canonical Config Example (Postgres + Redis Baseline)

```jsonc
{
  // Setup infra plus create-time and every-start setup steps
  "setup": {
    "services": ["postgres", "redis"],
    "steps": [
      { "name": "install", "command": "bun install --frozen-lockfile", "timeout_seconds": 300 },
      {
        "name": "write-web-env",
        "write_files": [
          {
            "path": "apps/web/.env.local",
            "lines": [
              "VITE_API_ORIGIN=http://${LIFECYCLE_SERVICE_API_ADDRESS}",
            ],
          },
        ],
        "timeout_seconds": 10,
        "run_on": "start",
      },
      { "name": "migrate", "command": "bun run db:migrate", "timeout_seconds": 120, "run_on": "start" },
    ],
  },

  // Managed secrets (resolved server-side, injected as env vars)
  "secrets": {
    "POSTGRES_PASSWORD": { "ref": "acme/dev/postgres_password", "required": true },
    "REDIS_PASSWORD": { "ref": "acme/dev/redis_password", "required": true },
    "NOTION_API_KEY": { "ref": "acme/dev/notion_api_key", "required": false },
  },

  // Long-running services
  "services": {
    "postgres": {
      "runtime": "image",
      "build": { "context": "docker", "dockerfile": "docker/Dockerfile.pg.dev" },
      "startup_timeout_seconds": 45,
      "volumes": [
        { "source": "workspace://postgres", "target": "/var/lib/postgresql/data" },
        { "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true },
      ],
      "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 5432, "timeout_seconds": 45 },
      "env_vars": {
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "${secrets.POSTGRES_PASSWORD}",
        "POSTGRES_DB": "app",
      },
    },
    "redis": {
      "runtime": "image",
      "image": "redis:7-alpine",
      "command": "redis-server",
      "args": ["--save", "", "--appendonly", "no", "--requirepass", "${secrets.REDIS_PASSWORD}"],
      "startup_timeout_seconds": 30,
      "health_check": { "kind": "tcp", "host": "127.0.0.1", "port": 6379, "timeout_seconds": 30 },
    },
    "api": {
      "runtime": "process",
      "command": "bun run dev:api",
      "cwd": "apps/api",
      "depends_on": ["postgres", "redis"],
      "port": 3001,
      "share_default": true,
      "health_check": {
        "kind": "http",
        "url": "http://127.0.0.1:3001/health",
        "timeout_seconds": 45,
      },
      "env_vars": {
        "DATABASE_URL": "postgres://app:${secrets.POSTGRES_PASSWORD}@127.0.0.1:5432/app",
        "REDIS_URL": "redis://:${secrets.REDIS_PASSWORD}@127.0.0.1:6379",
        "WEBHOOK_BASE_URL": "http://${LIFECYCLE_WORKSPACE_SLUG}.local",
      },
    },
    "web": {
      "runtime": "process",
      "command": "bun run dev",
      "cwd": "apps/web",
      "depends_on": ["api"],
      "port": 3000,
      "share_default": true,
      "env_vars": {
        "VITE_API_ORIGIN": "http://${LIFECYCLE_SERVICE_API_ADDRESS}",
      },
    },
  },

  // MCP servers (available to agents during sessions)
  "mcps": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "transport": "stdio",
      "env_vars": {
        "NOTION_API_KEY": "${secrets.NOTION_API_KEY}",
      },
    },
  },
}
```

## Validation Rules

- `lifecycle.json` must pass JSON Schema validation before workspace creation
- When `secrets` is present, all `${secrets.*}` references must resolve to declared secret keys and authorized organization scopes
- Unresolved or unauthorized secret references fail workspace creation before process startup
- Unsupported runtime/tooling versions are rejected with explicit field-level errors
