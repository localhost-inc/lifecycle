# Plan: Cloud Workspaces

> Status: planned execution plan
> Depends on: [Local CLI](./local-cli.md)
> Plan index: [docs/plans/README.md](./README.md). This document is the target contract for the first cloud delivery stream.
> Related: [Kin Cloud V1](./kin-cloud-v1.md)

## Goal

User signs in, installs GitHub App, links project to repo, forks a local workspace to cloud, shares a preview URL with teammates, and creates a PR -- all from desktop app or CLI.

## What You Build

1. Desktop and CLI auth flow suitable for local-first apps (device/browser-confirmed is acceptable).
2. Convex connection from Tauri webview.
3. GitHub App installation flow.
4. Convex schemas: `organization`, `repository`, `activity`. Selective sync and mirror logic for portable `project` and workspace metadata across local and cloud boundaries, without transferring authority for local environment state.
5. Project -> repository linking (auto-detect from git remote, manual override).
6. Cloud workspace creation via `Backend` + `CloudRuntime`.
7. Fork-to-cloud: local workspace -> push code -> create cloud workspace.
8. Cloud-to-local fork.
9. Org switcher and cloud workspace list.
10. Activity feed via Convex reactive queries.
11. RBAC enforcement.
12. GitHub webhook handling.
13. Cloud preview: Cloudflare Worker + `proxyToSandbox()` routing.
14. Preview auth with Lifecycle-issued short-lived tokens.
15. PR creation via GitHub App.
16. Shared terminal sessions: Durable Object multiplexer, native desktop attach bridge, invite flow, role-based input control, presence.
17. Cloud CLI commands: `auth login`, `org create`, `org switch`, `repo link`, `workspace create --host cloud`, `agent`, `pr create`, `pr merge`.

## Entity Contracts

### `organization` (first-class root)

1. Purpose:
   - tenancy boundary for users, projects, and policy
2. Required fields:
   - `id`
   - `name`
   - `slug`
   - `status` (`active|suspended`)
   - `default_sandbox_image_id` (nullable UUID)
   - `idle_timeout_minutes` (default 30, min 10, max 240)
   - `created_at`, `updated_at`
3. Invariants:
   - unique `slug`
   - if set, `default_sandbox_image_id` must reference a `ready` and non-`deprecated` `organization_image`
   - all user actions and resources are scoped to one `organization_id`
   - `idle_timeout_minutes` is the org-level policy ceiling for workspace auto-sleep

### `repository` (VCS identity)

1. Purpose:
   - thin VCS identity record -- provider credentials and repo metadata
   - a project links to at most one repository for GitHub push, fork-to-cloud, and PR creation
   - does NOT define runtime config -- that lives in `lifecycle.json` within the project directory
2. Required fields:
   - `id`
   - `organization_id`
   - `provider` (`github`)
   - `provider_repo_id`
   - `installation_id` -- GitHub App installation ID; required for minting short-lived clone/push tokens
   - `status` (`connected|disconnected`) -- tracks whether the GitHub App installation is active for this repo
   - `owner`
   - `name`
   - `default_branch`
   - `created_at`, `updated_at`
3. Invariants:
   - unique per organization/provider tuple: (`organization_id`, `provider`, `provider_repo_id`)
   - immutable provider identity after creation
   - `status` transitions to `disconnected` on GitHub App uninstall webhook; cloud workspace create is rejected for disconnected repositories with `repository_disconnected` error

### `activity` (append-only event log)

1. Purpose:
   - immutable projection of a state change or notable fact within a workspace or organization
   - powers the activity feed in the desktop app workspace console via Convex reactive queries
2. Required fields:
   - `id`
   - `organization_id`
   - `workspace_id` (nullable) -- set for workspace-scoped events, null for org-level events
   - `repository_id` (nullable) -- set for repository-scoped events
   - `event_type` (canonical lifecycle fact name, for example `environment.status_changed`, `service.status_changed`, `terminal.status_changed`, `workspace.created`)
   - `actor` (nullable -- user id or `system`)
   - `summary` (human-readable one-liner, e.g. "environment transitioned to ready")
   - `detail` (nullable JSONB -- structured payload, e.g. `{ from: "starting", to: "ready" }`)
   - `created_at`
3. Invariants:
   - append-only -- activities are never updated or deleted by application code
   - activity rows are projections over canonical lifecycle facts and selected command outcomes, not the event foundation itself
   - retention policy may truncate old records (expansion-scope)

## Implementation Contracts

### Auth and Identity

M6 needs one org-scoped auth contract across desktop, CLI, preview, and cloud actions. The repo should stay explicit about the required shape without hard-wiring provider-specific implementation detail into the milestone.

#### Auth contract

1. Desktop and CLI sign-in must share one identity system and one org-scoped permission model.
2. Browser-confirmed auth is acceptable for both desktop and CLI as long as the local clients receive renewable credentials without requiring a web session shell.
3. Desktop stores credentials in OS-managed secure storage. CLI stores credentials in a user-scoped credential file or secure store with equivalent protections.
4. Cloud API calls and reactive queries must carry a validated user identity plus `organization_id`.
5. Preview access must use Lifecycle-issued short-lived tokens instead of public unauthenticated URLs.
6. Org switching changes the active `organization_id` used by desktop views, CLI commands, and cloud mutations.
7. `lifecycle auth login` should use the v1 GitHub-backed sign-in path and activate a default `Personal` organization when the user has not yet selected a shared org.

#### RBAC

| Lifecycle role | Permissions                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| `viewer`       | `workspaces:read`, `terminals:read`, `services:read`                                                     |
| `editor`       | viewer + `workspaces:create`, `workspaces:run`, `workspaces:reset`, `terminals:create`, `services:update` |
| `admin`        | editor + `workspaces:destroy`, `org:settings`, `org:members`                                             |

Permission enforcement must happen at the authoritative cloud boundary. Multiple assigned roles may combine by union if the auth system supports that shape.

#### Preview URL Auth

1. Control plane mints short-lived preview tokens (JWT, 1-hour TTL) when a user requests preview access via an authenticated Lifecycle session.
2. Vanity Worker on `*.preview.lifecycle.dev` validates the JWT on each request (signature + expiry + org membership claim).
3. Token stored as cookie on `*.preview.lifecycle.dev` domain after first validation; unauthenticated requests redirect to backend for token issuance.

#### Risks

| Risk                                         | Mitigation                                                           |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Auth provider fit changes during implementation | Keep the milestone contract provider-agnostic; bind vendor choice in reference docs once shipped |
| Hosted auth UX tradeoffs                     | Keep the auth UI separate from core workspace surfaces and verify the browser-confirmed flow early |
| Preview JWT issuance and Worker validation drift | Keep one Lifecycle-owned token contract; add integration tests for mint, expiry, org mismatch, and cookie bootstrap |
| Tauri secure storage cross-platform behavior | Test keychain integration on macOS/Windows/Linux early               |

#### Secrets

1. Secrets resolved at runtime from managed secret store.
2. Secrets are injected as environment variables; file-based secret materialization is disallowed by default.
3. Log streaming must redact values for known secret keys and managed secret refs.
4. Never persisted in plaintext in run logs or workspace metadata.

#### Auditability

1. Every mutation includes `requested_by`, `source` (`desktop|cli|github`), and timestamp.
2. Slack/Linear sources added with thread ingress (expansion-scope).

### Convex API

Full API contract: [reference/convex-api.md](../reference/convex-api.md)

M6-relevant functions:

```
# Mutations
organizations.create(name, slug)
organizations.update(id, settings)
projects.sync(projectData)
projects.linkRepository(projectId, repositoryId)
repositories.connect(organizationId, provider, owner, name)
workspaces.create(projectId, sourceRef, mode?)
workspaces.fork(workspaceId, mode, destroySource?, includeUncommitted?)

# Queries
organizations.list()
projects.list(organizationId)
repositories.list(organizationId)
repositories.get(id)
workspaces.list(projectId, filters?)
workspaces.get(id)

# Actions
github.listRepositories(organizationId)
github.handleWebhook(payload, signature)
```

### Authority and Mixed-Mode Aggregation

`workspace.mode` remains the authority boundary in M6.

1. `local` workspaces continue to use the local provider, local persistence, and local environment authority even when the user is signed in.
2. `cloud` workspaces use the cloud runtime and Convex-backed backend as the authoritative administration boundary.
3. Signing in adds cloud capabilities; it does not convert existing local workspaces into cloud-authoritative workspaces.
4. Desktop views may show local and cloud workspaces together, but aggregation happens after both sources are normalized into shared workspace records.
5. UI code must not compose raw SQLite rows and raw Convex results directly. Aggregation belongs in a domain-layer adapter or hook.
6. Sync from local to Convex is for linkage, handoff, and selected mirrored metadata. It is not a mandate to replicate all local environment state into Convex.

### Cross-Mode Collaboration

Local workspaces are private to the machine. They are NOT visible to teammates in the organization workspace list. Only cloud workspaces appear in the org workspace list. Fork-to-cloud is the only way to make local work visible to the organization.

#### Fork-to-Cloud (the bridge)

Fork-to-cloud is the bridge between local and cloud. A user working locally can fork their workspace to cloud to share it with teammates. The forked workspace runs full `create -> prepare -> start` lifecycle -- it's a fresh cloud workspace at the same ref, not a migration.

- Fork flow: stash-commits dirty working tree to a temporary branch (`lifecycle/fork/<short-id>`), pushes it, and creates a cloud workspace at that branch via Convex mutation. The `includeUncommitted` option is especially important here -- local work may have significant uncommitted state.
- Desktop app: "Fork to cloud" action on any local workspace (requires sign-in and GitHub App). Checkboxes: "Destroy local source after fork" and "Include uncommitted changes" (hidden when working tree is clean).
- Activity row (cloud): `event_type=workspace.forked` with `{ source_mode: "local", target_workspace_id, target_mode: "cloud", source_destroyed, included_uncommitted }`
- Common flow: you've been iterating locally -> sign in -> fork to cloud so teammate gets a shareable preview URL. Optionally include uncommitted changes and/or destroy local source.

#### Cloud-to-Local Fork

Any org member can also fork a cloud workspace locally for faster iteration with instant terminal, no provisioning latency. This creates a local workspace at the same ref.

- Desktop app: "Fork locally" action on any cloud workspace.
- The local workspace is private -- it does not appear in the org workspace list.

### Shared Terminal Sessions

Cloud workspaces support real-time shared terminal sessions for pair and mob programming. Two or more org members connect to the same PTY process in a sandbox, seeing the same output and (optionally) typing into the same input stream.

#### Terminal Surface Direction

Cloud terminals should extend the native-first desktop terminal model established in M3 rather than reviving a browser terminal client inside the main app shell.

1. Terminal tabs remain provider-backed runtime tabs with the same detach/hide/kill semantics as local terminals.
2. On desktop platforms with a native terminal host, cloud terminal tabs should use that same native-host lane.
3. The cloud-specific difference is the attach transport: token minting, WebSocket redemption, and shared-session multiplexing live behind the provider boundary.
4. PTY output is the authoritative shared terminal state. Collaborator key events are not mirrored into peer renderers; only the controlling client's input is forwarded to the remote PTY.
5. Browser join pages are for auth, invite redemption, and desktop deep-link bootstrap. They are not a second primary terminal client in M6.
6. Detailed desktop attach-helper rules live in [reference/cloud-terminal-attach.md](../reference/cloud-terminal-attach.md).

#### Architecture

```
┌────────────────────┐      ┌────────────────────┐
│  Kyle's Desktop    │      │ Hurshal's Desktop  │
│  native terminal   │      │ native terminal    │
│  host + workspace  │      │ host + workspace   │
│  tab surface       │      │ tab surface        │
└─────────┬──────────┘      └─────────┬──────────┘
          │ attach/proxy + WebSocket stdin/stdout
          └──────────────┬──────────────────────┘
                         ▼
               ┌────────────────────┐
               │   Durable Object:  │
               │ session multiplexer│
               └─────────┬──────────┘
                         │ PTY stream
                         ▼
               ┌────────────────────┐
               │ Cloudflare Sandbox │
               │ PTY process        │
               │ (bash/zsh/CLI)     │
               └────────────────────┘
```

- **Single PTY, multiple clients**: one PTY process per terminal, one Durable Object per terminal session acting as the multiplexer
- **Native-host-first desktop UX**: the desktop app keeps one terminal presentation model. Cloud sessions attach through provider transport under the existing native host when the platform supports it.
- **Attach bridge**: on native-hosted platforms, the terminal surface may launch a local attach/proxy helper that redeems the attach token and bridges remote stdin/stdout to the shared-session Durable Object or, in solo mode, directly to the sandbox PTY.
- **Helper is attachment-only**: the local helper is not the terminal runtime. Restarting it should reconnect presentation to the same provider-owned `terminalId`, not create a new terminal session.
- **Fan-in**: keystrokes from all connected clients are fed into the single PTY stdin
- **Fan-out**: PTY stdout is broadcast as text to all connected WebSocket clients
- **Text-over-wire**: terminal data is transmitted as PTY text, not video — low-latency through the Durable Object
- **No peer key mirroring**: shared state comes from the authoritative PTY output stream, not from replaying one participant's abstract key events into another participant's renderer

#### Invite Model — `workspace_invite`

Sharing is scoped to the **workspace**, not individual terminals. A `workspace_invite` grants access to all collaborative surfaces within the workspace (terminals now, file editing / logs / preview later).

```
workspace_invite (new table)
  id
  organization_id
  workspace_id
  created_by            # host user_id
  token (unique, indexed)
  role: viewer|editor   # aligns with org RBAC roles
  redeemed_by (nullable user_id)
  expires_at
  revoked_at (nullable)
  created_at
```

- `editor` — read-write, keystrokes forwarded to PTY stdin
- `viewer` — read-only, receives PTY stdout but input is rejected at protocol level

The `terminal` record gains an `is_shared` boolean (default false) to control which terminals are visible to invited guests.

#### Session Flow

1. **Share flow**: host clicks "Share workspace" → creates a `workspace_invite` → copies invite link
2. **Join flow**: guest opens invite → desktop app calls `workspaceInvites.join(token)` → gets workspace access with role → can attach to any shared terminal
3. **Terminal attach**: `terminals.mintAttachToken` looks up the user's invite role and embeds it in the token. Host (workspace creator) is always `editor`. Desktop app redeems the token through the cloud terminal attach bridge and mounts the session inside the existing terminal host lane.
4. **Role change**: host can upgrade/downgrade a guest's role mid-session
5. **Presence**: each connected client is tracked by the Durable Object; presence list (user avatar, role, typing indicator) is broadcast to all participants
6. **Disconnect**: client disconnect removes from presence list; PTY continues running. Last client disconnect does NOT terminate the PTY (existing detach behavior)

#### API Extensions

```
# Mutations
workspaceInvites.create(workspaceId, role?)           # creates invite, returns { token, expiresAt }. Default role: viewer.
workspaceInvites.join(token)                          # validates invite, returns { workspaceId, role }
workspaceInvites.setRole(workspaceId, userId, role)   # host sets guest role (viewer|editor)
workspaceInvites.revoke(workspaceId, userId?)         # host revokes one or all guests

# Queries
workspaceInvites.participants(workspaceId)            # returns [{ userId, displayName, role, connectedAt }] — live from Durable Object
```

`terminals.mintAttachToken` is extended: token payload gains a `role` field (`viewer|editor`). The Durable Object enforces role on each incoming WebSocket message — viewer connections that send stdin data receive a protocol-level rejection, not a silent drop.

#### Invite Scoping and Auth

- Invite tokens are scoped to `{organization_id, workspace_id}` and expire after 24 hours or on explicit revoke
- Only org members with `workspaces:read` permission can join; workspace owner required to create invites
- Session host is the workspace creator; host always has `editor` role and cannot be demoted
- Invite token is single-use for join handshake; after join, the participant's identity is tracked by the Durable Object and subsequent reconnects use standard `mintAttachToken` with role from invite

#### Invite Flow — End to End

The share experience must feel effortless — one click to share, one click to join.

**Kyle (host):**
1. Kyle has a cloud workspace in `ready` state with a terminal open
2. Clicks "Share" button in workspace header → `workspaceInvites.create(workspaceId)` → gets invite token
3. App copies link to clipboard: `https://lifecycle.dev/join/<token>`
4. Kyle pastes link in Slack/iMessage/wherever to Hurshal

**Hurshal (guest):**
1. Hurshal clicks the link → opens in browser → landing page shows workspace name, host name, and "Join" button
2. If not signed in: "Sign in" → Lifecycle auth flow → redirected back to join page
3. Clicks "Join" → `workspaceInvites.join(token)` validates org membership → success
4. If Hurshal has the desktop app: deep link opens Lifecycle desktop → attaches to workspace as viewer
5. If Hurshal doesn't have the desktop app: landing page prompts download instead of becoming a second primary terminal client
6. Hurshal sees Kyle's terminal, output streaming live. Kyle sees Hurshal's avatar appear in the presence bar.
7. Kyle clicks Hurshal's avatar → "Grant editor" → Hurshal can now type

**That's it. Two people, same terminal, same sandbox.**

#### Desktop App Surface

- **"Share" button** on workspace header → mints invite, copies link to clipboard, shows toast "Link copied"
- **Participant avatars** in terminal header bar showing connected users and their roles
- **Role toggle**: host can click a participant avatar to switch between viewer/editor
- **"Stop sharing"**: host revokes all guests and returns to private workspace
- **Join deep link**: `lifecycle://join/<token>` registered as app protocol handler; falls back to `https://lifecycle.dev/join/<token>` web landing
- **Cloud terminal tabs**: desktop attaches cloud sessions into the same runtime-tab lane and native terminal host model used for local terminals on supported platforms

#### Constraints

- Shared terminals are cloud-only. Local terminals use Tauri IPC with no multiplexing layer.
- Maximum 10 concurrent participants per workspace session (Durable Object WebSocket limit consideration)
- Shared terminal sessions do not survive workspace sleep — participants are disconnected on sleep, can reconnect after wake
- Web landing pages do not become a second primary terminal client in M6

### Cloud Preview

#### `CloudRuntime` Preview

1. **Cloudflare routing model**:
   - when a previewable service is running, runtime provisions an HTTP preview route for the current `assigned_port`
   - token is deterministic per `{workspace_id, name}` to keep preview URL stable across restarts
   - canonical URL shape: `https://<workspace-slug>--<service>.preview.<organization-slug>.<domain>`
   - incoming requests are handled by a wildcard-edge Worker route and proxied via `proxyToSandbox(...)` to the target sandbox session
   - route target resolves through cloud environment metadata to `{sandbox_id, assigned_port}` and is reconciled on service restart/wake

2. **Access control**:
   - default audience is organization members only
   - auth is enforced at preview gateway using Lifecycle-issued preview tokens (see Auth > Preview URL Auth)
   - raw preview tokens are treated as routing identifiers, not as sufficient authentication
   - optional external reviewer links are tokenized, scoped to one preview URL, and time-bound

3. **Deployment requirements**:
   - production preview requires a custom domain with wildcard DNS and wildcard Worker route mapping
   - `.workers.dev` hostnames are not a production preview surface
   - TLS/certificate setup must cover the wildcard preview host pattern in use

4. **Operational constraints**:
   - Cloudflare platform limits and beta constraints are treated as product guardrails, not implementation details
   - portability fallback criteria are tracked in Open Decisions and must be reviewed before GA

5. **UX and collaboration guarantees**:
   - preview URL remains stable for the life of the workspace (including hot reload and wake cycles)
   - users opening a sleeping workspace preview get a deterministic "waking workspace" response rather than a generic 404
   - route updates are near-real-time so teammates can watch endpoint changes while development is in progress

#### Rollout Phases

1. Milestone 6 (wedge): stable org-only preview URLs backed by workspace service share state -- cloud via wildcard Worker + `proxyToSandbox()`
2. Expansion: route reconciliation hardening for hot reload/websocket-heavy frameworks
3. Expansion: controlled external reviewer links + audit trails for preview access
4. Expansion: tunnel integration for sharing local workspaces

### PR Creation

- PR is created via GitHub App permissions through backend (Convex action)
- PR merge is also performed through backend after an explicit mergeability check
- Control plane validates head/base refs and commit diff
- Returns PR URL, number, and status context
- No-diff and permission failures return typed errors with suggested next action
- `lifecycle pr create` and `lifecycle pr merge` always target the backend; `gh` CLI is optional and not required

### Event Ingress

1. GitHub:
   - branch/check updates to refresh workspace SHA and status context
2. All ingress events must be:
   - signature verified
   - deduplicated by delivery ID
   - acknowledged quickly and processed async
3. Slack and Linear ingress are expansion-scope (see `docs/expansion`).

### GitHub Integration and PR Permissions

1. GitHub App installation is required for repository onboarding and automation.
2. Workspace git permissions are fetch/push only using short-lived credentials minted by backend.
3. Workspace git credentials are repo-scoped and branch-scoped to lifecycle workspace branches.
4. Pull request creation is performed by backend via GitHub App permissions, not by workspace user tokens.
5. Pull request merge is performed by backend and must honor GitHub mergeability and branch protection.
6. `lifecycle pr create` and `lifecycle pr merge` always target the backend (Convex actions); `gh` CLI is optional and not required.
7. Git credentials are rotated and revoked on workspace sleep/destroy.
8. Token mint, token redemption, push, PR create, and PR merge actions are all audit logged.

### Cloud CLI Commands

Commands added to the CLI in this milestone (extending M5's local CLI):

1. `lifecycle auth login`
2. `lifecycle org create <name>`
3. `lifecycle org switch <name|id>`
4. `lifecycle org cloud connect cloudflare`
5. `lifecycle project init [--org-id <id>]`
6. `lifecycle repo link [--project-id <id>]`
7. `lifecycle workspace create <name> --host cloud`
8. `lifecycle workspace fork --host cloud|local [--destroy-source] [--include-uncommitted]`
9. `lifecycle workspace shell <workspace>`
10. `lifecycle agent --workspace-id <id> --provider <claude|codex>`
11. `lifecycle pr create --workspace-id <id>`
12. `lifecycle pr merge --workspace-id <id>`

Command semantics:

1. `auth login` establishes the user session and activates a default personal org when needed.
2. `org create` creates a shared organization.
3. `org switch` selects the active organization for subsequent cloud commands.
4. `org cloud connect cloudflare` stores and verifies the organization-scoped Cloudflare credential.
5. `project init --org-id` still creates `lifecycle.json`; when signed in, it may also bind the current project to the target org record.
6. `repo link` links the current project to its GitHub repository, auto-detecting from git remote when possible.
7. `workspace create <name> --host cloud` uses the active project, linked repo, and active organization cloud account.
8. `agent --workspace-id --provider` is a thin launcher into the workspace shell for the selected provider CLI, not a Lifecycle-owned cloud agent session model.
9. `pr create` and `pr merge` operate on repository authority, not on the workspace shell identity.

### Relationship Cardinality

1. One `organization` has many `project` and user records.
2. One `project` has at most one `repository` link and many `workspace` records.
3. One `workspace` has many `terminal`, `activity`, `workspace_service`, and `workspace_invite` records.

### Key Indexes and Uniqueness

Local indexes (Tauri SQLite):

1. `project`: unique (`path`)
2. `workspace`: index (`project_id`, `status`), index (`source_workspace_id`)
3. `workspace_service`: unique (`workspace_id`, `name`)
4. `terminal`: index (`workspace_id`, `status`)

Cloud indexes (Convex `defineTable().index()` syntax):

1. `organization`: unique (`slug`)
2. `project`: index (`organization_id`), index (`repository_id`)
3. `repository`: unique (`organization_id`, `provider`, `provider_repo_id`), index (`organization_id`, `status`)
4. `workspace`: index (`project_id`, `source_ref`, `status`), index (`project_id`, `mode`, `status`), index (`created_by`, `status`), index (`source_workspace_id`)
5. `workspace_service`: unique (`workspace_id`, `name`), index (`workspace_id`)
6. `terminal`: index (`workspace_id`, `status`, `last_active_at`)
7. `activity`: index (`workspace_id`, `created_at`), index (`organization_id`, `created_at`), index (`organization_id`, `type`, `created_at`)
8. `workspace_invite`: unique (`token`), index (`workspace_id`, `revoked_at`), index (`workspace_id`, `redeemed_by`)

Index rationale:
- **Dashboard filtering**: `(project_id, mode, status)` for workspace list with mode/status filters
- **My workspaces**: `(created_by, status)` for "show my workspaces" view
- **Fork lineage**: `(source_workspace_id)` for "what was forked from this?"
- **Repo health**: `(organization_id, status)` on repository for filtering connected/disconnected
- **Service lookup**: `(workspace_id)` on workspace_service for loading all services for a workspace
- **Activity by type**: `(organization_id, event_type, created_at)` for filtering activity feed by event type

## Desktop App Surface

- **Sign-in button**: triggers the chosen browser-confirmed auth flow in the system browser
- **Org switcher**: top-left, Linear-style compact control (org mark, org name, chevron)
- **Org create/switch parity**: desktop and CLI expose the same auth and org selection model
- **GitHub App install**: in-app flow to install and connect repos
- **Project -> repo linking**: auto-detect from git remote with manual override
- **Cloud workspace list**: org-scoped, shows only cloud workspaces
- **Fork-to-cloud action**: on local workspace detail, with "Include uncommitted changes" and "Destroy local source" options
- **Activity feed**: real-time workspace and environment transitions via Convex reactive queries
- **Service share toggles** (cloud context): per-service on/off toggle
- **Preview URL display + copy**: one-click copy when cloud preview is ready
- **Preview state indicators**: disabled/provisioning/ready badges per service
- **PR button**: "Create PR" action in the workspace Git extension

## Exit Gate

- Click "Sign in" -> browser opens -> auth completes -> app shows your org
- Install GitHub App -> repos appear -> link project to repo
- Click "Fork to cloud" on a local workspace -> code pushes -> cloud workspace creates -> reaches ready
- Cloud workspace visible in org workspace list (local workspaces are NOT listed here)
- Toggle "Share" on a cloud workspace service -> preview URL generated -> copy -> teammate opens -> sees running app
- Click "Create PR" -> PR created on GitHub -> link shown in app
- Click "Merge PR" -> PR merged when GitHub reports mergeable and branch protection allows it
- Cloud workspace -> click "Share" -> invite link copied -> teammate joins as viewer -> both see same terminal output
- Host grants teammate editor role -> teammate can type into shared terminal
- `lifecycle auth login` -> default personal org active
- `lifecycle org create kin` -> shared org created
- `lifecycle org switch kin` -> active org set
- `lifecycle project init --org-id <org>` -> project contract created and org-bound
- `lifecycle repo link --project-id <project>` -> repository linked
- `lifecycle workspace create feature-branch --host cloud` -> cloud workspace created
- `lifecycle agent --workspace-id <workspace> --provider claude` -> attached provider session starts in the workspace shell
- `lifecycle pr create --workspace-id <workspace>` -> PR created from CLI
- `lifecycle pr merge --workspace-id <workspace>` -> PR merged from CLI when allowed

## Test Scenarios

```
sign in -> see org dashboard with cloud workspace list (empty initially)
install GitHub App -> repos appear -> link project to repository
local workspace ready -> fork to cloud -> cloud workspace reaches ready
cloud workspace appears in org list -> local workspace does NOT appear in org list
fork with includeUncommitted -> dirty state pushed to temp branch -> cloud workspace has changes
teammate signs in -> sees cloud workspace -> does NOT see your local workspaces
cloud workspace ready -> share service -> preview URL generated -> opens in browser
teammate opens preview URL -> sees running app (org-scoped auth)
service restarts -> same preview URL still works
create PR -> PR appears on GitHub with correct branch and title
lifecycle auth login -> default personal org active
lifecycle org create kin -> lifecycle org switch kin
lifecycle project init --org-id <org> -> lifecycle.json created and project bound to org
lifecycle repo link --project-id <project> -> repository link succeeds
lifecycle workspace create feature-branch --host cloud -> cloud workspace created
lifecycle agent --workspace-id <workspace> --provider claude -> provider CLI launched in workspace shell
lifecycle pr create --workspace-id <workspace> -> PR created
lifecycle pr merge --workspace-id <workspace> -> merge succeeds when allowed
lifecycle workspace fork --host cloud -> cloud workspace created
cloud workspace -> share -> teammate joins as viewer -> sees terminal output -> host grants editor -> teammate types -> both see result
shared workspace -> workspace sleeps -> all participants disconnected -> wake -> reconnect -> session resumes
shared workspace -> host revokes guest -> guest disconnected immediately
shared workspace -> 3 participants connected -> presence shows all three with correct roles
shared workspace -> viewer tries to type -> input rejected at protocol level -> no effect on PTY
```
