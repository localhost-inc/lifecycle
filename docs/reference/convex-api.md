# Convex API Contract (Control Plane)

> **Decision: Convex-only, no REST layer.** Desktop app and CLI both use the Convex SDK directly. No REST endpoints. The thin Cloudflare Worker only handles GitHub webhook signature verification (forwarding to Convex HTTP actions) and preview URL gateway.

## Conventions

1. Convex function conventions:
   - mutations for state changes, queries for reads, actions for side effects / external API calls
   - all functions enforce auth via `ctx.auth.getUserIdentity()` and RBAC via `identity.permissions`
   - Convex OCC handles idempotency natively — no `Idempotency-Key` header needed
   - mutations return the updated resource directly; workspace `status` tracks in-flight operations

## Wedge Convex Functions

Cloud-only — local operations use Tauri IPC commands.

```
# Mutations
organizations.create(name, slug)
organizations.update(id, settings)
projects.sync(projectData)               # sync local project to Convex
projects.linkRepository(projectId, repositoryId)
repositories.connect(organizationId, provider, owner, name)
workspaces.create(projectId, sourceRef, mode?)
workspaces.run(id)
workspaces.reset(id)
workspaces.destroy(id)
workspaceServices.update(workspaceId, serviceName, { exposure?, portOverride? })
terminals.create(workspaceId, harness?)
terminals.mintAttachToken(terminalId)    # cloud only

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

# Actions (side effects / external calls)
github.listRepositories(organizationId)  # calls GitHub API
github.handleWebhook(payload, signature) # HTTP action for Worker
```

## Key Semantics

- `projects.sync`: syncs local project metadata to Convex when user signs in; creates or updates project record in org scope
- `projects.linkRepository`: links a project to a repository for VCS integration
- `repositories.connect`: accepts (`organizationId`, `provider`, `owner`, `name`)
- `repositories.get`: returns repository VCS identity record
- `workspaces.create`: `projectId`, `sourceRef`, optional `mode` (`cloud|local`, default `cloud`). Project must have `repository_id` set for cloud mode.
- `workspaces.fork`: accepts `workspaceId`, `mode` (`cloud|local`), optional `destroySource` (boolean, default false), optional `includeUncommitted` (boolean, default false). Validates source workspace exists. When `includeUncommitted`, stash-commits dirty working tree to temporary branch (`lifecycle/fork/<short-id>`), pushes, and creates target at that branch; otherwise creates at current committed `sourceRef`. Optionally destroys source after target reaches `ready`. Returns new workspace ID. Records `workspace_forked` activity on both source and target.
- `organizations.update`: mutable org settings including `default_sandbox_image_id` (UUID, nullable), `idle_timeout_minutes`
- `workspaceServices.update`: patches the `workspace_service` record. Accepts only writable fields: `exposure` (`internal|organization|local`), `portOverride` (nullable). Returns full service record including computed fields (`status`, `previewState`, `previewUrl`, `effectivePort`).
- `workspaceServices.list`: returns all `workspace_service` records for a workspace with computed preview state inline
- `workspaceServices.get`: returns a single `workspace_service` record by workspace and service name
- `workspaces.get`: response includes `mode` field
- `workspaces.run` / `workspaces.reset`: no args beyond workspace id; returns updated workspace
- `github.listRepositories`: search/list available GitHub repos for the authenticated user's org
- `terminals.create`: `workspaceId`, optional `harness`; returns `terminalId`
- `terminals.mintAttachToken`: `terminalId`; returns `{ attachToken, expiresAt, wssUrl }` (cloud only — local uses Tauri IPC)

## Terminal Transport

- **Cloud**: Convex action mints attach token → desktop app connects WebSocket directly to Cloudflare Sandbox
- **Local**: Tauri Rust backend spawns PTY directly, pipes to xterm.js via Tauri IPC (no HTTP/WS endpoint)

## Terminal Auth (Cloud Only)

- Attach tokens are scoped to `{workspace_id, terminal_id, user_id}`
- Default token TTL: 60 seconds
- Single-use token redemption preferred; reconnect requires fresh token
- Token mint + redemption recorded in audit log

## Streaming and Real-Time

- Workspace state changes, activity feeds, and service status are all push-based via Convex reactive queries (`useQuery`) — no polling
- Terminal PTY attach uses WebSocket to execution environment (cloud: Cloudflare Sandbox with attach token) or Tauri IPC (local)
- Test execution streaming is expansion-scope (testing.md)

## Error Model

- Convex functions throw typed errors with: `code`, `message`, `details`, `suggestedAction`, `retryable`
- `code` is a closed enum (see [errors.md](errors.md))
- Invalid state transitions and lock conflicts throw `ConvexError` with appropriate codes

## Expansion-Scope Functions

See `docs/plans/lifecycle/expansion/`:
- Usage + budget (billing.md)
- Thread + message CRUD (threads.md)
- Organization image registry (images.md)
- Workspace test execution + event streaming (testing.md)
- PR creation (pr.md)
