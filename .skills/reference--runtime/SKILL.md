---
name: reference--runtime
description: Runtime domains, state machines, lifecycle.json, and events specs
user-invocable: true
---

Apply the following runtime contracts as context for the current task. Use these for state machine implementation, lifecycle management, event handling, and runtime domain boundaries.

---

# Runtime Domains

Canonical runtime/backend domain taxonomy for Lifecycle backend and CLI work.

## Core Rule

If a new runtime concern does not clearly fit one of the domains below, the design is not ready yet.

## Domain Map

### `contracts`

Shared type contracts and schemas, normalized command inputs and query outputs, event/error/state-machine shapes, manifest parsing and validation.

Does not own: process supervision, transport clients, platform SDK calls, workflow orchestration.

### `backend`

Authority boundary for projects, workspaces, auth, ownership, and workspace-mode routing.

Decision rule: If the concern lists records, changes workspace authority, or decides who owns a workspace, it belongs here.

### `runtime`

Workspace-scoped execution boundary once a workspace already exists.

Subdomains: environment, service, terminal, process, preview, sources, git, activity, attachments.

Decision rule: If it supervises or inspects a live workspace runtime, it belongs here.

### `execution`

Live runtime behavior inside the authoritative workspace runtime.

Subdomains: environment, service, terminal, process, preview, sources, git, activity, attachments.

Decision rule: If it supervises or inspects a live workspace runtime, it belongs here.

### `transport`

Move bytes, tokens, streams, or requests between surfaces and the authoritative runtime.

Subdomains: attach, preview-proxy, tunnel, streaming/subscription adapters.

Decision rule: If the concern is about how a caller reaches the runtime, it belongs here.

### `integrations`

Isolate platform-specific identity, API, and SDK glue.

Subdomains: github, workos, cloudflare, mcp.

Decision rule: If the noun is the name of an external platform, it belongs here.

### `workflows`

Compose multiple domains into user-visible verbs.

Subdomains: fork, share, pr, deploy, snapshot, status.

Decision rule: If the feature is a verb that composes several domains, it belongs here.

## Domain Interaction Rules

1. `contracts` may be imported by every other domain.
2. `backend` may assemble `runtime`, `execution`, `transport`, `integrations`, `workflows`.
3. `runtime` may assemble `execution`, `transport`, and narrow `integrations`.
4. `execution` depends on `contracts` and narrow `integrations`.
5. `transport` depends on `contracts` and narrow `integrations`.
6. `workflows` may compose all other domains but keeps boundaries visible.
7. Frontend code calls backend, runtime, or workflow surfaces, not low-level execution/integration modules.

## Naming Guardrails

Prefer: `backend`, `runtime`, `execution`, `transport`, `integration`, `workflow`, concrete domain names.
Avoid: `manager`, `helpers`, `misc`, `common`, `internal` as catch-all.

## Mapping to Current Repo

1. `packages/contracts` — shared contracts and schemas
2. `packages/backend` — centralized backend interfaces for auth, projects, workspace records, and authority routing
3. `packages/runtime` — workspace development runtime interfaces plus local/cloud runtime adapters
4. `apps/desktop/src-tauri/src/platform/*` — backend, runtime, execution, local transport
5. Future remote services — centralized backend, cloud runtime, transport, workflows, integrations
6. `apps/desktop/src/features/*` — frontend feature ownership

---

# State Machines

Canonical transition rules for all Lifecycle state machines. Single source of truth for transition guards.

## Workspace Lifecycle

Durable shell existence and archive state.

- `created -> active`
- `active -> archived`
- `archived -> active`
- `active|archived -> destroyed` (terminal)

Invariants:
1. Archiving or destroying must first drive the environment down.
2. Starting/stopping the environment does not create/archive/destroy the workspace.

## Workspace Environment `status`

- `idle -> starting`
- `starting -> running|stopping|idle`
- `running -> starting|stopping`
- `stopping -> idle`

Invariants:
1. Allowed states: `idle`, `starting`, `running`, `stopping`
2. Transitional states act as implicit mutation lock.
3. Failed starts land in `idle` with a typed environment failure reason.

| State | Cloud | Local |
|-------|-------|-------|
| `idle` | No active sandbox services | No running services; worktree persists |
| `starting` | Provisioning sandbox services | Running workspace preparation and starting services |
| `running` | Health checks pass in sandbox | Health checks pass on localhost |
| `stopping` | Sandbox shutting down | Processes/containers shutting down |

## Service `status`

- `stopped -> starting`
- `starting -> ready|failed|stopped`
- `ready -> starting|failed|stopped`
- `failed -> starting|stopped`

Invariants:
1. Service status is subordinate to environment.
2. `idle`/`stopping` environment cannot have `ready` services.

## Terminal `status`

- `active -> detached|sleeping|finished|failed`
- `detached -> active|sleeping|finished|failed`
- `sleeping -> detached|active|failed`
- `finished` and `failed` are terminal

Invariants:
1. `create`/`attach` allowed when workspace has interactive context.
2. `sleeping` terminals reject input.
3. Workspace `destroy` hard-terminates non-finished/non-failed terminals.

## Preview Routing

Preview availability is derived from environment + service runtime facts.

Invariants:
1. There is no separate preview state machine in the backend contract.
2. `preview_url` is stable runtime-owned routing identity.
3. `assigned_port` and `service.status` determine whether a preview is actually openable.

## Workspace Git Action State

Derived state machine computed from `GitStatusResult`, current-branch PR context, and query loading state.

States: `loading`, `provider_unavailable`, `detached`, `needs_stage`, `needs_commit`, `needs_push`, `blocked_behind`, `blocked_diverged`, `no_pull_request_changes`, `ready_to_create_pull_request`, `view_pull_request`, `ready_to_merge`

Invariants:
1. Local composition (`needs_stage`, `needs_commit`) suppresses PR actions.
2. Remote sync blockers suppress PR actions on clean branches.
3. Clean synced branches must wait for PR state before surfacing PR actions.

## Enforcement

Everything not listed above is forbidden and must throw `invalid_state_transition` error with `machine`, `from_state`, `to_state`, and `cause`.

---

# `lifecycle.json` Configuration

Canonical specification for the checked-in workspace manifest.

## Overview

1. `lifecycle.json` is JSONC. Comments and trailing commas allowed.
2. Required top-level: `workspace`, `environment`
3. Graph-native. No `prepare.services` compatibility layer.

## Top-Level Shape

```jsonc
{
  "workspace": {
    "prepare": [],
    "teardown": []
  },
  "environment": {}
}
```

## `workspace` Contract

### `workspace.prepare`

Ordered filesystem-scoped preparation steps.

- Each step: `name`, `timeout_seconds`, one of `command` or `write_files`
- Optional: `cwd`, `env`, `run_on` (`create` or `start`, default `create`)
- Must not declare `depends_on`

### `workspace.teardown`

Ordered workspace teardown steps. Same shape as prepare but no `run_on`.

## Step Actions

- `command`: shell command inside workspace
- `write_files`: materialize files; each entry has `path` plus one of `content` or `lines`

## Reserved Runtime Env

Lifecycle injects:
- `LIFECYCLE_WORKSPACE_ID`, `_NAME`, `_SOURCE_REF`, `_PATH`, `_SLUG`
- `LIFECYCLE_SERVICE_<NODE_NAME>_URL` — stable HTTP URL via `*.lifecycle.localhost` proxy (**primary var for HTTP clients**)
- `LIFECYCLE_SERVICE_<NODE_NAME>_HOST`, `_PORT`, `_ADDRESS`

Use `_URL` for HTTP service-to-service traffic — it routes through the stable Lifecycle-owned proxy and does not break on port reassignment. Use `_HOST`/`_PORT`/`_ADDRESS` for non-HTTP protocols and direct socket clients. See `/reference--preview` for the full proxy and routing contract.

## `environment` Contract

Flat map of typed graph nodes. Node kinds: `task`, `service`.

### `task` Nodes

Required: `kind: "task"`, `timeout_seconds`, one of `command` or `write_files`
Optional: `cwd`, `env`, `depends_on`, `run_on`

### `service` Nodes

Required: `kind: "service"`, `runtime`

`runtime: "process"`: required `command`; optional `cwd`, `env`, `depends_on`, `startup_timeout_seconds`, `health_check`

`runtime: "image"`: required at least one of `image` or `build`; optional `command`, `args`, `env`, `depends_on`, `startup_timeout_seconds`, `health_check`, `port`, `volumes`

### `health_check`

- `kind: "tcp"` — fields: `host`, `port`, `timeout_seconds`
- `kind: "http"` — fields: `url`, `timeout_seconds`
- `kind: "container"` — fields: `timeout_seconds`; waits for Docker `HEALTHCHECK` status

## Secret Handling

Local manifests do not support managed secrets. `secrets` and `${secrets.*}` are invalid. Materialize env files in workspace prepare instead.

---

# Event Foundation

Canonical contract for Lifecycle's internal event foundation.

## Mental Model

Five concerns:
1. `commands` — imperative requests
2. `fact events` — statements about what already happened
3. `streams` — high-volume data (PTY output, logs)
4. `hooks` — command-scoped observation (`before`, `after`, `failed`)
5. `projections` — derived read models (activity, audit, metrics)

## Authority Boundary

1. Backend/runtime code is authoritative for facts.
2. UI/query code is delivery, not canonical.
3. Recovery from missed events: refetch authoritative state.

## Canonical Event Envelope

```ts
interface LifecycleEvent<TPayload = unknown> {
  id: string;
  kind: string;
  version: number;
  occurred_at: string;
  source: {
    layer: "runtime" | "backend" | "desktop" | "cli" | "system";
    component: string;
    runtime: "local" | "cloud" | "system";
    provider?: string;
  };
  workspace_id?: string;
  project_id?: string;
  terminal_id?: string;
  name?: string;
  correlation_id?: string;
  causation_id?: string;
  payload: TPayload;
}
```

## Domain Catalog

### Workspace Facts

`workspace.created`, `workspace.forked`, `workspace.archived`, `workspace.unarchived`, `workspace.renamed`, `workspace.destroyed`

### Environment Facts

`environment.status_changed`

### Service Facts

`service.status_changed`, `service.exposure_changed`

### Terminal Facts

`terminal.created`, `terminal.status_changed`, `terminal.renamed`, `terminal.removed`, `terminal.harness_prompt_submitted`, `terminal.harness_turn_completed`

### Git Facts

`git.status_changed`, `git.head_changed`, `git.log_changed`

## Naming

- Commands: `<domain>.<verb>` (e.g. `workspace.start`, `terminal.create`)
- Facts: `<domain>.<fact>` (e.g. `environment.status_changed`, `git.head_changed`)
- Hooks: fixed phases `before`, `after`, `failed`

## Consumer Rules

1. Tolerate duplicate delivery, dedupe by `id`.
2. Be idempotent.
3. Unknown `kind` or unsupported `version` → refetch authoritative state.

## Anti-Patterns

Do not: catch-all facts (`workspace.updated`), PTY bytes as facts, projection rows as canonical facts, UI-local names as cross-layer contracts.
