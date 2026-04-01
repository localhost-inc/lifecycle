# Plan: Kin Cloud V1

> Status: canonical build target
> Depends on: [Local CLI](./local-cli.md)
> Plan index: [docs/plans/README.md](./README.md). This is the one document to build against for the Kin cloud delivery.

## Goal

Ship one opinionated product loop for Kin:

1. `lifecycle auth login`
2. `lifecycle org create <name>`
3. `lifecycle org switch <name|id>`
4. `lifecycle org cloud connect cloudflare`
5. `lifecycle project init --org-id <id>`
6. `lifecycle repo link --project-id <id>`
7. `lifecycle workspace create <name> --host cloud`
8. `lifecycle workspace shell <workspace>`
9. `lifecycle agent --workspace-id <id> --provider <claude|codex>`
10. `lifecycle pr create --workspace-id <id>`
11. `lifecycle pr merge --workspace-id <id>`

The user outcome is simple:

1. Kin provides its own Cloudflare account
2. Lifecycle creates a cloud workspace for this repo
3. the developer uses a native terminal and provider harnesses
4. the developer creates and merges a PR

## Build Rule

Build only what is required to make the loop above work.

Do not expand scope for V1 into:

1. preview URLs
2. shared terminals
3. multi-user shell collaboration
4. customer-managed runtime packages or Worker installation UX unless Cloudflare makes them unavoidable
5. first-party Lifecycle cloud `agent_session` orchestration
6. desktop-only surfaces

If something is not necessary for the loop above, it is out of scope.

## Product Shape

The V1 product is:

1. CLI-first
2. native-terminal-first
3. shell-first for Claude and Codex
4. WorkOS-backed for auth, organizations, sessions, and RBAC
5. GitHub-backed for repo link, PR create, and PR merge
6. customer-owned Cloudflare-backed for cloud runtime execution
7. Cloudflare Workers-backed for the Lifecycle control plane
8. D1 + Drizzle-backed for control-plane data

The V1 product is not:

1. a desktop-first cloud IDE
2. a generic remote devbox platform
3. a managed multi-user terminal product
4. a preview platform

## Implementation Stack

Lock the stack for V1:

1. WorkOS AuthKit for auth and organizations
2. GitHub as the only enabled social OAuth provider in WorkOS
3. WorkOS RBAC for org-level roles
4. Cloudflare Workers for the Lifecycle API and runtime control plane
5. Wrangler for local development and deployment
6. D1 as the control-plane database
7. Drizzle ORM with `drizzle-orm/d1` for database access and migrations
8. GitHub App for repository linking, PR create, and PR merge
9. customer-provided Cloudflare API token for workspace runtime lifecycle only

Design rules:

1. WorkOS is the auth system
2. GitHub OAuth is only used through WorkOS AuthKit
3. GitHub App is separate from GitHub OAuth and remains the repo/PR authority
4. D1 stores control-plane records only, not terminal stream data
5. Workers + D1 replace the previous generic control-plane assumption for this delivery

## Primary User Flow

### 1. Sign in

```bash
lifecycle auth login
```

Behavior:

1. uses WorkOS AuthKit
2. GitHub is the only enabled social OAuth provider
3. establishes a WorkOS session
4. stores renewable local credentials or session material suitable for the CLI
5. activates a default `Personal` organization if no shared org is active

### 2. Create or switch to Kin

```bash
lifecycle org create kin
lifecycle org switch kin
```

Behavior:

1. `org create` creates a shared organization in WorkOS and mirrors it into D1
2. `org switch` makes that organization authoritative for later cloud actions
3. org role enforcement follows WorkOS org membership and role state

### 3. Connect Kin's Cloudflare account

```bash
lifecycle org cloud connect cloudflare
```

Inputs:

1. `account_id`
2. Cloudflare API token

Behavior:

1. verify the token is active
2. verify it is valid for the supplied `account_id`
3. verify it has the minimum required permissions for workspace runtime lifecycle
4. store the raw token in Worker-managed secret storage only
5. persist only the metadata record in D1

### 4. Initialize the project

```bash
lifecycle project init --org-id <kin-org-id>
```

Behavior:

1. creates or repairs `lifecycle.json`
2. creates or syncs a project record in D1
3. binds the project to the target organization

### 5. Link the GitHub repository

```bash
lifecycle repo link --project-id <project-id>
```

Behavior:

1. detects the current git remote when possible
2. requires a valid GitHub App installation for the target repo
3. creates the repository link in D1 used for clone, push, PR create, and PR merge

### 6. Create the cloud workspace

```bash
lifecycle workspace create feature-name --host cloud
```

Behavior:

1. resolves the active org
2. resolves the current project
3. resolves the linked repository
4. resolves the connected organization Cloudflare account
5. provisions a cloud workspace runtime through the Lifecycle Worker control plane
6. checks out the repo at the requested base ref or current default
7. mounts project, home, and cache storage
8. runs prepare/start according to the project contract
9. returns workspace metadata and attach instructions

### 7. Open a shell

```bash
lifecycle workspace shell <workspace>
```

Behavior:

1. attaches a PTY to the workspace runtime
2. starts in `/workspace`
3. sets `HOME=/home/lifecycle`
4. gives the user a normal shell in the box

### 8. Launch Claude or Codex

```bash
lifecycle agent --workspace-id <workspace> --provider claude
lifecycle agent --workspace-id <workspace> --provider codex
```

Behavior:

1. attaches to the same workspace shell path as `workspace shell`
2. launches `claude` or `codex` as the entry command
3. relies on in-box provider auth persisted in the mounted home directory
4. does not create a Lifecycle-owned cloud `agent_session` in V1

### 9. Create and merge the PR

```bash
lifecycle pr create --workspace-id <workspace>
lifecycle pr merge --workspace-id <workspace>
```

Behavior:

1. `pr create` derives the current branch from the workspace checkout
2. PR creation goes through the Lifecycle Worker backend using GitHub App authority
3. `pr merge` checks mergeability first
4. GitHub branch protection remains authoritative
5. merge goes through the Lifecycle Worker backend, not through shell-local credentials

## Exact Scope

### Must build

1. WorkOS-backed `auth login`
2. org create and switch
3. org-scoped Cloudflare account connection
4. `project init --org-id`
5. `repo link`
6. cloud workspace provisioning
7. shell attach
8. mounted persistent home for provider auth
9. `agent` as a shell-entry convenience command
10. PR create
11. PR merge
12. typed errors across all commands

### Explicitly out of scope

1. service previews
2. preview auth and preview URLs
3. workspace sharing and invites
4. viewer/editor terminal roles
5. first-party transcript UX
6. cloud-side provider token delegation
7. customer-facing Worker/runtime package management UI
8. arbitrary cloud providers beyond Cloudflare

## Data Model

Only add the records required for the loop.

### `user`

Needed fields:

1. `id`
2. `workos_user_id`
3. `email`
4. `display_name`
5. `created_at`, `updated_at`

### `organization`

Needed fields:

1. `id`
2. `workos_organization_id`
3. `name`
4. `slug`
5. `created_at`, `updated_at`

### `organization_membership`

Needed fields:

1. `id`
2. `organization_id`
3. `user_id`
4. `workos_membership_id`
5. `role`
6. `created_at`, `updated_at`

Rules:

1. membership and role state are mirrored from WorkOS
2. CLI authorization uses mirrored membership data and active WorkOS session context

### `project`

Needed fields:

1. `id`
2. `organization_id`
3. `name`
4. `path`
5. `created_at`, `updated_at`

### `repository`

Needed fields:

1. `id`
2. `organization_id`
3. `project_id`
4. `provider` (`github`)
5. `provider_repo_id`
6. `installation_id`
7. `owner`
8. `name`
9. `default_branch`
10. `status` (`connected|disconnected`)
11. `created_at`, `updated_at`

### `organization_cloud_account`

Needed fields:

1. `id`
2. `organization_id`
3. `provider` (`cloudflare`)
4. `account_id`
5. `token_kind` (`account|user`)
6. `token_secret_ref`
7. `status` (`connected|invalid|revoked`)
8. `last_verified_at` (nullable)
9. `last_error_code` (nullable)
10. `created_by`
11. `created_at`, `updated_at`

Rules:

1. one active Cloudflare account binding per org in V1
2. raw token never lives in Convex or SQLite plaintext

### `workspace`

Needed fields:

1. `id`
2. `organization_id`
3. `project_id`
4. `repository_id`
5. `name`
6. `host` (`cloud`)
7. `source_ref`
8. `status` (`provisioning|active|failed|archived`)
9. `environment_status` (`idle|starting|running|stopping|failed`)
10. `worktree_path`
11. `prepared_at`
12. `created_by`
13. `created_at`, `updated_at`
14. `failure_reason` (nullable)

Do not add extra runtime deployment tables unless implementation proves they are required.

## Secrets

### Stored by Lifecycle

1. WorkOS configuration secrets
2. WorkOS session/cookie signing material
3. GitHub App credentials
4. Cloudflare API token

### Never stored in plaintext app state

1. Cloudflare API token
2. GitHub App private material
3. WorkOS secret material

### Never injected into the workspace shell

1. organization Cloudflare API token
2. control-plane signing secrets
3. WorkOS secret material

## Cloudflare Contract

The V1 contract is intentionally minimal.

Lifecycle must be able to use the org's Cloudflare API token to:

1. provision a workspace runtime
2. wake it
3. stop it
4. destroy it
5. support shell attach

Implementation rule:

1. do not assume a customer-installed Worker package on day one
2. if Cloudflare requires a minimal helper runtime to make attach or long-lived workspace control work, Lifecycle should install and manage it automatically after `org cloud connect cloudflare`
3. that helper must remain an implementation detail, not a separate customer workflow

What the developer should never have to do:

1. deploy a Worker manually
2. create Durable Object namespaces manually
3. paste runtime URLs into Lifecycle

## Workspace Runtime Contract

The runtime only needs these capabilities in V1:

1. clone or hydrate the repository checkout
2. mount `/workspace`
3. mount `/home/lifecycle`
4. mount `/home/lifecycle/.cache`
5. start a login shell
6. run project prepare/start work
7. accept PTY attach

Required shell environment:

1. `PWD=/workspace`
2. `HOME=/home/lifecycle`
3. `LIFECYCLE_WORKSPACE_ID`
4. `LIFECYCLE_PROJECT_ID`
5. `LIFECYCLE_WORKSPACE_HOST=cloud`
6. `LIFECYCLE_WORKSPACE_PATH=/workspace`

Required binaries on `PATH`:

1. `lifecycle`
2. `git`
3. `claude`
4. `codex`
5. project runtime tools as required by the repo

## Provider Auth Contract

Claude and Codex auth happen inside the box.

Rules:

1. `claude auth login` runs in the workspace shell
2. `codex login` runs in the workspace shell
3. auth state persists in the mounted home directory
4. `~/.claude` and `~/.codex` must never live under `/workspace`

`lifecycle agent` is only a launcher. It is not a separate auth model.

## GitHub Contract

GitHub remains the authority for repository and PR operations.

Required capabilities:

1. link repo through GitHub App installation
2. mint short-lived repo credentials for clone and push
3. create PR through backend
4. merge PR through backend

Rules:

1. shell-local user auth is not the source of truth for PR create/merge
2. GitHub branch protection must be honored
3. mergeability must be checked before merge

## Control Plane Contract

The Lifecycle control plane for V1 runs on Cloudflare Workers.

Responsibilities:

1. validate WorkOS sessions for CLI and app requests
2. persist control-plane records in D1
3. use Drizzle for all typed DB access
4. hold GitHub App and Cloudflare secret access
5. orchestrate workspace lifecycle
6. create and merge PRs through GitHub App authority

Rules:

1. Wrangler is the required local dev and deployment path
2. D1 is used for transactional control-plane data only
3. PTY byte streams, provider logs, and other high-volume runtime output do not use D1 as their primary transport

## Command-Level Implementation Requirements

### `lifecycle auth login`

Must implement:

1. WorkOS AuthKit login flow
2. GitHub as the only enabled social OAuth provider
3. local credential/session persistence
4. default `Personal` org activation

### `lifecycle org create`

Must implement:

1. create organization in WorkOS
2. mirror the organization into D1
3. assign caller as org admin/member according to the WorkOS role model

### `lifecycle org switch`

Must implement:

1. local active-org selection
2. use that org by default in later cloud commands
3. verify the active session has membership in the selected org

### `lifecycle org cloud connect cloudflare`

Must implement:

1. prompt for `account_id`
2. prompt for API token
3. verify token
4. store secret in Worker-managed secret storage
5. persist metadata record in D1

### `lifecycle project init --org-id`

Must implement:

1. create or repair `lifecycle.json`
2. create or sync project record in D1
3. bind project to org

### `lifecycle repo link --project-id`

Must implement:

1. detect git remote
2. verify GitHub App install
3. create repository link in D1

### `lifecycle workspace create --host cloud`

Must implement:

1. resolve org/project/repo/cloud-account preconditions
2. provision runtime through the Worker control plane
3. hydrate checkout
4. mount storage
5. start prepare/run path
6. persist workspace state transitions in D1

### `lifecycle workspace shell`

Must implement:

1. mint attach session
2. attach PTY
3. forward stdin/stdout
4. handle reconnect cleanly after transient attach failure

### `lifecycle agent --workspace-id --provider`

Must implement:

1. reuse `workspace shell` attach path
2. launch provider command after attach
3. return provider exit code cleanly

### `lifecycle pr create`

Must implement:

1. derive current branch from workspace
2. create PR through Worker backend
3. return PR URL and number

### `lifecycle pr merge`

Must implement:

1. resolve current or target PR
2. verify mergeability
3. call Worker backend merge action
4. return merged PR metadata

## Typed Errors

Minimum error set:

1. `unauthenticated`
2. `organization_not_found`
3. `organization_access_denied`
4. `organization_membership_missing`
5. `cloud_account_missing`
6. `cloud_token_invalid`
7. `cloud_token_expired`
8. `cloud_account_mismatch`
9. `cloud_permission_missing`
10. `repository_not_linked`
11. `repository_disconnected`
12. `workspace_provision_failed`
13. `workspace_attach_failed`
14. `workspace_not_found`
15. `provider_not_installed`
16. `provider_auth_missing`
17. `pull_request_not_found`
18. `pull_request_not_mergeable`
19. `branch_protection_blocked`

Every command must map failures into a typed error with:

1. `code`
2. `message`
3. `details`
4. `suggestedAction`
5. `retryable`

## Implementation Order

Build in this order:

1. WorkOS AuthKit login with GitHub as the only enabled OAuth provider, plus `Personal` org activation
2. org create and switch
3. project init + project/org binding
4. repo link + GitHub App install checks
5. Cloudflare account connect + secret storage + verification
6. cloud workspace create/destroy lifecycle
7. shell attach
8. provider auth persistence in mounted home
9. `agent` launcher
10. PR create
11. PR merge

Do not build preview or shared terminal work before step 11 is complete.

## Exit Gate

This effort is done only when all of the following work end to end:

1. `lifecycle auth login`
2. `lifecycle org create kin`
3. `lifecycle org switch kin`
4. `lifecycle org cloud connect cloudflare`
5. `lifecycle project init --org-id <kin>`
6. `lifecycle repo link --project-id <project>`
7. `lifecycle workspace create feature-name --host cloud`
8. `lifecycle workspace shell <workspace>`
9. `claude auth login` or `codex login` inside the box
10. `lifecycle agent --workspace-id <workspace> --provider claude`
11. code change committed and pushed from the workspace
12. `lifecycle pr create --workspace-id <workspace>`
13. `lifecycle pr merge --workspace-id <workspace>`

## Test Scenarios

```text
auth login -> Personal org becomes active
auth login -> session established through WorkOS GitHub social login only
org create kin -> org exists and caller is admin
org switch kin -> later cloud commands use kin by default
org switch unknown-org -> organization_membership_missing or organization_not_found
org cloud connect cloudflare -> valid account_id + token -> connected
org cloud connect cloudflare -> invalid token -> cloud_token_invalid
project init --org-id <kin> -> lifecycle.json created and project record bound to kin
repo link --project-id <project> -> GitHub repo linked through app install
workspace create --host cloud -> missing cloud account -> cloud_account_missing
workspace create --host cloud -> missing repo link -> repository_not_linked
workspace create --host cloud -> valid prerequisites -> workspace reaches active
workspace shell -> PTY opens in /workspace with HOME=/home/lifecycle
workspace shell -> claude auth login -> ~/.claude appears under mounted home
workspace shell -> codex login -> ~/.codex appears under mounted home
agent --workspace-id <workspace> --provider claude -> reuses shell attach and launches claude
agent --workspace-id <workspace> --provider codex -> reuses shell attach and launches codex
git push from workspace -> succeeds with repo-scoped credentials
pr create --workspace-id <workspace> -> PR created against default branch
pr merge --workspace-id <workspace> -> merge succeeds when GitHub reports mergeable
pr merge --workspace-id <workspace> -> branch protection blocked -> branch_protection_blocked
workspace destroy -> future shell attach fails with workspace_not_found
```
