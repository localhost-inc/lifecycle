# Plan: Cloud

> Status: active plan
> Depends on: [CLI](./cli.md), [Architecture](../reference/architecture.md), [Terminals](./terminals.md)
> Plan index: [docs/plans/README.md](./README.md)

This document owns the hosted workspace contract for Lifecycle.

It defines what cloud adds beyond local:

1. hosted workspace provisioning
2. remote shell attach
3. optional routed `opencode serve`
4. organization, repository, and PR authority through the control plane

It does not turn Lifecycle into a first-party chat surface or require the public product loop to expose provider-specific setup on every developer path.

## Goal

Cloud should feel like the same workspace contract with three additions:

1. the workspace can be provisioned remotely
2. the shell can be attached remotely
3. a compatible remote harness can optionally route through a hosted `opencode serve` endpoint

The terminal remains the primary interface. Routed endpoint access is additive.

## Product Loop

1. `lifecycle auth login`
2. `lifecycle org create <name>` or use `Personal`
3. `lifecycle org switch <name|id>`
4. `lifecycle project init --org-id <id>`
5. `lifecycle repo link --project-id <id>`
6. `lifecycle workspace create <name> --host cloud`
7. `lifecycle workspace status --json`
8. `lifecycle workspace shell <workspace>`
9. optional routed `opencode serve` endpoint exposed through workspace status/context when enabled
10. `lifecycle pr create --workspace-id <id>`
11. `lifecycle pr merge --workspace-id <id>`

## Principles

1. Cloud is the same workspace contract, not a different product.
2. Terminal first, routed endpoint second.
3. The control plane orchestrates; the workspace runtime executes.
4. The user-facing cloud loop should stay provider-neutral.
5. Local work remains usable without auth or network.
6. Lifecycle does not grow a first-party transcript or chat surface in order to ship cloud.

## Public CLI Surface

### Auth and organization

1. `lifecycle auth login`
2. `lifecycle auth status`
3. `lifecycle org create <name>`
4. `lifecycle org switch <name|id>`
5. `lifecycle org status`

### Project and repository

1. `lifecycle project init --org-id <id>`
2. `lifecycle repo link --project-id <id>`
3. `lifecycle repo status [--json]`

### Cloud workspace lifecycle

1. `lifecycle workspace create <name> --host cloud`
2. `lifecycle workspace list --host cloud [--json]`
3. `lifecycle workspace status [--workspace <id>] [--json]`
4. `lifecycle workspace shell <workspace>`
5. `lifecycle workspace destroy <workspace>`

### PR workflow

1. `lifecycle pr create --workspace-id <id>`
2. `lifecycle pr merge --workspace-id <id>`

Rules:

1. `workspace status --json` should surface routed endpoint metadata when `opencode serve` is enabled.
2. The day-to-day developer loop should not require a provider-specific command before `workspace create --host cloud`.
3. If admin/provider configuration exists, it is an org-admin concern and should stay out of the common developer loop.

## Control Plane Contract

The control plane runs on Cloudflare Workers with Durable Objects and D1.

It owns:

1. WorkOS-backed auth and organization membership
2. repository authority through the GitHub App
3. cloud workspace lifecycle orchestration
4. remote shell attach routing
5. routed `opencode serve` endpoint coordination
6. PR create and merge through backend authority
7. shared metadata, policy, and audit state

Rules:

1. The control plane never executes the workspace workload directly.
2. D1 stores control-plane metadata, not high-volume terminal or log streams.
3. Cloud routing should preserve bridge-first runtime authority.

## Runtime and Provider Contract

Cloud workspaces run behind provider adapters.

Provider choice is an implementation detail unless and until the product intentionally exposes it as a user-facing concern.

Rules:

1. The public cloud product loop stays provider-neutral.
2. The control plane may start with a single provider adapter.
3. Additional adapters can be added later without changing the main developer loop.
4. If BYOC or admin provider configuration is required, it must remain an org/admin workflow rather than a per-workspace developer ritual.

Every cloud runtime must be able to:

1. clone or hydrate the repository checkout
2. mount `/workspace`
3. mount `/home/lifecycle`
4. mount `/home/lifecycle/.cache`
5. start a login shell
6. run project prepare/start work
7. accept PTY attach
8. optionally run `opencode serve` when routed access is enabled

Required shell environment:

1. `PWD=/workspace`
2. `HOME=/home/lifecycle`
3. `LIFECYCLE_WORKSPACE_ID`
4. `LIFECYCLE_PROJECT_ID`
5. `LIFECYCLE_WORKSPACE_HOST=cloud`
6. `LIFECYCLE_WORKSPACE_PATH=/workspace`

Required tools on `PATH`:

1. `lifecycle`
2. `git`
3. project runtime tools required by the repo
4. optional developer tools such as `opencode`, `claude`, or `codex`

## In-Workspace Tool Auth

Provider auth for tools such as Claude, Codex, or OpenCode happens inside the workspace.

Rules:

1. tool login flows run in the workspace shell
2. tool auth state persists in the mounted home directory
3. tool auth material must not be written under `/workspace`
4. org/control-plane secrets must never be injected into the workspace shell

## Repository and PR Contract

GitHub remains the authority for repository and PR operations.

Required capabilities:

1. link repos through GitHub App installation
2. mint short-lived repo credentials for clone and push
3. create PRs through backend authority
4. merge PRs through backend authority

Rules:

1. shell-local user auth is not the source of truth for PR create or merge
2. GitHub branch protection remains authoritative
3. mergeability must be checked before merge

## Records and States

Cloud needs only the records required for the hosted workspace loop:

1. `user`
2. `organization`
3. `organization_membership`
4. `project`
5. `repository`
6. `workspace`
7. optional org-level cloud runtime configuration or provider binding

Workspace lifecycle should stay aligned with the core runtime model:

```text
provisioning -> preparing -> running -> stopping -> stopped -> destroyed
                                 ↘ failed
```

## Typed Errors

Minimum error set:

1. `unauthenticated`
2. `organization_not_found`
3. `organization_access_denied`
4. `organization_membership_missing`
5. `cloud_runtime_unavailable`
6. `repository_not_linked`
7. `repository_disconnected`
8. `workspace_provision_failed`
9. `workspace_attach_failed`
10. `workspace_route_unavailable`
11. `workspace_not_found`
12. `provider_auth_missing`
13. `pull_request_not_found`
14. `pull_request_not_mergeable`
15. `branch_protection_blocked`

Every command should surface:

1. `code`
2. `message`
3. `details`
4. `suggestedAction`
5. `retryable`

## Explicit Non-Goals

This plan does not require:

1. first-party transcript UX
2. first-party chat or agent session orchestration
3. service previews as the core cloud loop
4. shared multi-user typing in the same terminal
5. customer-facing provider complexity in the common developer flow
6. cloud-only usage at the expense of local-first workflows

## Exit Gate

This plan is successful when all of the following are true:

1. a user can authenticate, select an organization, and provision a cloud workspace from a linked repo
2. `workspace shell` attaches to the hosted workspace with the same shell contract as local
3. in-workspace tool auth persists in the mounted home directory
4. routed `opencode serve` can be exposed without changing the workspace contract
5. PR create and merge work through backend authority, not shell-local credentials

## Test Scenarios

```text
auth login -> establishes a usable cloud session and activates Personal when needed
org create acme -> org exists and caller is an admin/member
org switch acme -> later cloud commands use acme by default
project init --org-id <org> -> lifecycle.json exists and project record binds to org
repo link --project-id <project> -> repo is linked through GitHub App authority
workspace create --host cloud -> valid prerequisites -> workspace reaches running
workspace status --json -> returns workspace state plus routed endpoint metadata when enabled
workspace shell -> PTY opens in /workspace with HOME=/home/lifecycle
workspace shell -> tool login persists under mounted home
workspace shell -> run opencode/claude/codex/plain shell commands inside the same workspace runtime
pr create --workspace-id <workspace> -> PR is created against the linked repo
pr merge --workspace-id <workspace> -> merge succeeds only when GitHub reports mergeable
workspace destroy -> later shell attach fails with workspace_not_found
```
