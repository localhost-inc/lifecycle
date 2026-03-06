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

Convex is authoritative for cloud-mode workspaces and cloud-native entities. It is not the universal backing store for signed-in desktop state. A signed-in desktop app may show local and cloud workspaces together, but local-mode workspace authority remains local.

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
terminals.mintAttachToken(terminalId)    # cloud only; token payload includes `role` (viewer|editor)
workspaceInvites.create(workspaceId, role?)           # creates invite, returns { token, expiresAt }
workspaceInvites.join(token)                          # validates invite, returns { workspaceId, role }
workspaceInvites.setRole(workspaceId, userId, role)   # host sets guest role (viewer|editor)
workspaceInvites.revoke(workspaceId, userId?)         # host revokes guest(s)

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
workspaceInvites.participants(workspaceId)  # returns [{ userId, displayName, role, connectedAt }] — live from DO

# Actions (side effects / external calls)
github.listRepositories(organizationId)  # calls GitHub API
github.handleWebhook(payload, signature) # HTTP action for Worker
```

## Key Semantics

- `projects.sync`: syncs local project metadata to Convex when user signs in; creates or updates project record in org scope
- `projects.sync` is a bridge and mirror flow, not an authority handoff. Local project and local workspace runtime state remain local unless explicitly forked or created in cloud mode.
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
- Desktop clients may aggregate `local` and `cloud` workspaces into a single normalized list, but reads and mutations still dispatch by workspace `mode`
- `workspaces.run` / `workspaces.reset`: no args beyond workspace id; returns updated workspace
- `github.listRepositories`: search/list available GitHub repos for the authenticated user's org
- `terminals.create`: `workspaceId`, optional `harness`; returns `terminalId`
- `terminals.mintAttachToken`: `terminalId`; returns `{ attachToken, expiresAt, wssUrl, role }` (cloud only — local uses Tauri IPC). `role` is `editor` for workspace creator, or the role from the user's `workspace_invite` record.
- `workspaceInvites.create`: `workspaceId`, optional `role` (`viewer|editor`, default `viewer`); creates a shareable invite scoped to `{organization_id, workspace_id}`. Returns `{ token, expiresAt }`. Token expires after 24 hours or on explicit revoke. Workspace owner only.
- `workspaceInvites.join`: `token`; validates invite, checks org membership and `workspaces:read` permission. Returns `{ workspaceId, role }`. Single-use for join handshake.
- `workspaceInvites.setRole`: `workspaceId`, `userId`, `role` (`viewer|editor`); host-only. Workspace creator always retains `editor` and cannot be demoted.
- `workspaceInvites.revoke`: `workspaceId`, optional `userId`; revokes one guest or all guests. Revoked users are disconnected immediately via Durable Object.
- `workspaceInvites.participants`: `workspaceId`; returns live participant list from Durable Object. Each entry: `{ userId, displayName, role, connectedAt }`.

## Terminal Transport

- **Cloud (solo)**: Convex action mints attach token → desktop app connects WebSocket directly to Cloudflare Sandbox PTY
- **Cloud (shared)**: Convex action mints attach token with role → desktop app connects WebSocket to Durable Object session multiplexer → multiplexer fans in stdin from `editor` clients to PTY, fans out stdout to all clients. Viewer stdin is rejected at protocol level.
- **Local**: Tauri Rust backend spawns PTY directly, pipes to xterm.js via Tauri IPC (no HTTP/WS endpoint). Shared sessions are not supported in local mode.

## Terminal Auth (Cloud Only)

- Attach tokens are scoped to `{workspace_id, terminal_id, user_id, role}`
- `role` is `editor` (read-write stdin) or `viewer` (read-only). Workspace creator is always `editor`; guests inherit role from their `workspace_invite`.
- Default token TTL: 60 seconds
- Single-use token redemption preferred; reconnect requires fresh token via `mintAttachToken`
- Shared session invite tokens have separate 24-hour TTL and are single-use for the join handshake
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
