---
name: reference--infra
description: Backend infrastructure contracts — Convex API, migrations, errors, SLOs, tunnel, cloud terminal
user-invocable: true
---

Apply the following infrastructure contracts as context for the current task. Use these for backend implementation, API design, error handling, migration authoring, and infrastructure decisions.

---

# Convex API Contract (Control Plane)

> **Decision: Convex-only, no REST layer.** Desktop app and CLI both use the Convex SDK directly. No REST endpoints. The thin Cloudflare Worker only handles GitHub webhook signature verification and preview URL gateway.

## Conventions

1. Mutations for state changes, queries for reads, actions for side effects / external API calls
2. All functions enforce auth via `ctx.auth.getUserIdentity()` and RBAC via `identity.permissions`
3. Convex OCC handles idempotency natively
4. Mutations return the updated resource directly

## Wedge Convex Functions

Cloud-only — local operations use Tauri IPC commands.

```
# Mutations
organizations.create(name, slug)
organizations.update(id, settings)
projects.sync(projectData)
projects.linkRepository(projectId, repositoryId)
repositories.connect(organizationId, provider, owner, name)
workspaces.create(projectId, sourceRef, mode?)
workspaces.run(id)
workspaces.reset(id)
workspaces.destroy(id)
terminals.create(workspaceId, harness?)
terminals.mintAttachToken(terminalId)
workspaceInvites.create(workspaceId, role?)
workspaceInvites.join(token)
workspaceInvites.setRole(workspaceId, userId, role)
workspaceInvites.revoke(workspaceId, userId?)

# Queries
organizations.list()
projects.list(organizationId)
repositories.list(organizationId)
repositories.get(id)
workspaces.list(projectId, filters?)
workspaces.get(id)
workspaceServices.list(workspaceId)
workspaceServices.get(workspaceId, serviceName)
terminals.list(workspaceId)
workspaceInvites.participants(workspaceId)

# Actions
github.listRepositories(organizationId)
github.handleWebhook(payload, signature)
```

## Key Semantics

- `projects.sync`: bridge/mirror flow, not authority handoff
- `workspaces.create`: `projectId`, `sourceRef`, optional `mode` (default `cloud`)
- `workspaces.fork`: `workspaceId`, `mode`, optional `destroySource`, `includeUncommitted`
- `terminals.mintAttachToken`: returns `{ attachToken, expiresAt, wssUrl, role }`

## Terminal Transport

- **Cloud (solo)**: Convex action mints token → desktop attaches to Cloudflare Sandbox PTY
- **Cloud (shared)**: token with role → Durable Object multiplexer → fan in/out
- **Local**: native Ghostty surface via Tauri IPC

## Terminal Auth (Cloud Only)

- Tokens scoped to `{workspace_id, terminal_id, user_id, role}`
- Role: `editor` (read-write) or `viewer` (read-only)
- Default TTL: 60 seconds, single-use preferred

## Error Model

- Functions throw typed errors with: `code`, `message`, `details`, `suggestedAction`, `retryable`
- `code` is a closed enum (see errors section below)

---

# Database Migrations

Desktop SQLite schema as a versioned contract.

## Rules

1. Every schema change → numbered SQL migration in `apps/desktop/src-tauri/src/platform/migrations`
2. `schema_migration` is the only migration source of truth
3. No startup-time `ALTER TABLE` helpers or ad hoc schema mutations
4. Before launch: prefer squashing baseline
5. After launch: additive and forward-only

## Runtime Contract

`run_migrations` in `apps/desktop/src-tauri/src/platform/db.rs`:
1. Creates `schema_migration` if missing
2. Applies numbered migrations in order

## Change Checklist

1. Add next numbered SQL file under migrations
2. Register in `MIGRATIONS` in `db.rs`
3. Add/update migration tests in `db.rs`
4. Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
5. Update docs if persisted contract changed

---

# Typed Error Catalog

## Error Envelope

All non-2xx responses include: `code`, `message`, `details`, `request_id`, `suggested_action`, `retryable`.

## Canonical API Codes

| `code` | HTTP | Trigger |
|---|---:|---|
| `invalid_request` | 400 | malformed input |
| `validation_failed` | 422 | schema/field validation failure |
| `unauthenticated` | 401 | missing or expired auth |
| `forbidden` | 403 | RBAC/secret access denied |
| `not_found` | 404 | unknown resource |
| `resource_conflict` | 409 | uniqueness/idempotency conflict |
| `invalid_state_transition` | 409 | forbidden state transition |
| `workspace_mutation_locked` | 409 | workspace in transitional lock state |
| `workspace_capacity_unavailable` | 503 | provider cannot allocate capacity |
| `provider_api_error` | 502 | upstream provider API failure |
| `setup_step_failed` | 500 | setup command failed |
| `environment_task_failed` | 500 | environment task failed during boot |
| `service_start_failed` | 500 | service startup failed |
| `service_healthcheck_failed` | 500 | service health gate failed |
| `preview_route_failed` | 502 | preview route bind/reconcile failed |
| `local_docker_unavailable` | 503 | Docker Desktop not running |
| `local_port_conflict` | 409 | requested port already in use |
| `local_app_not_running` | 503 | Tauri desktop app not running |
| `repository_disconnected` | 409 | GitHub App uninstalled or repo access revoked |
| `internal_error` | 500 | unexpected server failure |

## Failure Reason Enums

### `environment.failure_reason`

`capacity_unavailable`, `environment_task_failed`, `manifest_invalid`, `repo_clone_failed`, `repository_disconnected`, `prepare_step_failed`, `service_start_failed`, `service_healthcheck_failed`, `sandbox_unreachable`, `local_docker_unavailable`, `local_port_conflict`, `local_app_not_running`, `operation_timeout`, `unknown`

### `service.status_reason`

`service_start_failed`, `service_process_exited`, `service_dependency_failed`, `service_port_unreachable`, `unknown`

### `terminal.failure_reason`

`harness_process_exit_nonzero`, `attach_failed`, `workspace_destroyed`, `unknown`

## Mutation Concurrency

1. Transitional states (`starting`, `stopping`) reject new mutations with `workspace_mutation_locked`
2. Only `idle` and `running` accept mutation requests
3. Convex OCC handles serialization natively

---

# SLOs and Operational Limits

## Cloud SLOs

- p95 workspace create to `ready`: <= 60s
- p95 workspace wake: <= 15s
- p95 prepare phase: <= 30s
- p95 service startup to healthy: <= 45s
- Log stream latency: <= 2s p95
- Control-plane availability: 99.9% monthly
- p95 preview route reconcile: <= 5s

## Local SLOs

- p95 workspace create to `ready`: <= 30s
- p95 workspace wake: <= 5s
- p95 service startup: <= 45s
- Desktop responsiveness: p95 local update <= 100ms, p95 Convex sync <= 3s

## Desktop Interaction Budgets

- Workspace route ready: under one perceived loading beat
- Bootstrap from direct workspace, environment, and service reads
- Heavy documents fetch without keeping siblings mounted
- Git polling only while relevant surface is active and visible

## Limits

- Max active workspaces per user: 5 (default)
- TTL default: 24 hours
- Raw usage event retention: 13 months

## Cold-Start Budget (Cloud)

| Step | First-ever p95 | Warm-cache p95 |
|---|---|---|
| Sandbox provisioning | 15s | 6s |
| Git clone + Docker pulls + setup | 45s | 12s |
| Service startup + health checks | 12s | 12s |
| **Total with 30% margin** | **~94s** | **~39s** |

Required for launch: dependency caching (R2, lockfile hash key) and pre-baked Docker images.

## Cold-Start Budget (Local)

| Step | First-ever p95 | Warm-cache p95 |
|---|---|---|
| Git worktree create | 2s | 2s |
| Docker pulls + setup | 30s | 5s |
| Service startup + health checks | 12s | 12s |
| **Total with 30% margin** | **~57s** | **~25s** |

---

# Tunnel and Preview Transport

## Recommended Split

1. **Transport**: `local` (Lifecycle proxy URL) or `shared` (tunnel-backed URL)
2. **Access policy**: local-only, authenticated share link, team/org membership, public

## Local-Mode Direction

1. Local workspaces work with no network/auth.
2. Tunnels are optional and additive.
3. First concept is `shared`, not `organization`.

## Lifecycle Integration

- `run`/`wake`: reconcile tunnel state, restore preview URL
- `sleep`: suspend tunnel
- `destroy`: revoke tunnel
- Service restart: preserve stable URL

## Provider Boundary

Dedicated adapter boundary for: provision share URL, health-gate publication, suspend/resume/reconcile/revoke previews.

---

# Cloud Terminal Attach Transport

Desktop-side attach contract for cloud terminals on native terminal host platforms.

## Authority Boundary

1. **Remote terminal session** — authoritative PTY in Cloudflare Sandbox
2. **Terminal domain record** — runtime-owned metadata and lifecycle
3. **Desktop attach helper** — ephemeral local process bridging to remote transport
4. **Desktop surface state** — local UI state (not authoritative)

## Launch Contract

1. User opens cloud terminal tab.
2. Desktop fetches terminal metadata.
3. Desktop calls `terminals.mintAttachToken(terminalId)`.
4. Desktop launches native surface with `lifecycle terminal attach`.
5. Helper redeems token and bridges stdin/stdout.

## Helper Input

Pass via environment variables (not argv):

```
LIFECYCLE_WORKSPACE_ID
LIFECYCLE_TERMINAL_ID
LIFECYCLE_ATTACH_ROLE
LIFECYCLE_ATTACH_TARGET_KIND
LIFECYCLE_ATTACH_URL
LIFECYCLE_ATTACH_TOKEN
LIFECYCLE_ATTACH_EXPIRES_AT
```

## Detach and Kill

- `detachTerminal`: tears down helper, leaves remote PTY running
- `killTerminal`: terminates remote PTY, helper exits naturally
- Tab close/switch: detach, not kill

## Reconnect

Desktop may remint token and relaunch helper targeting same `terminalId`. No new terminal record created.

## Failure Handling

**Not terminal failures** (surface as attach errors): helper launch failure, expired token, transient disconnect, viewer stdin rejection

**Terminal failures** (provider-authoritative): remote PTY exits normally (`finished`), exits with failure (`failed`), workspace destroy/sleep
