# Plan: Cloud Shell Provider Auth

> Status: planned execution plan
> Depends on: [Cloud Workspaces](./cloud-workspaces.md)
> Plan index: [docs/plans/README.md](./README.md). This document is the target contract for shell-first Claude/Codex authentication in cloud workspaces.

## Goal

A user creates or opens a cloud workspace, attaches a shell, authenticates Claude or Codex directly inside that box, and keeps that auth state across shell detach, workspace restart, and workspace wake through mounted persistent home volumes.

Lifecycle should treat the cloud workspace as a real development box:

1. attach to the box
2. run provider CLIs normally
3. persist provider state in the mounted home directory
4. do not invent a separate Lifecycle-managed provider session system for V1

## Why This Exists

If Lifecycle only provisions a cloud box and opens a shell, it risks becoming indistinguishable from other remote dev-box tools.

If Lifecycle immediately tries to own Claude and Codex as first-class cloud-side agent runtimes, it takes on a large amount of auth, transcript, approval, and provider-lifecycle complexity before the cloud shell path is solid.

This plan takes the pragmatic middle path:

1. Lifecycle still differentiates on the repo/workspace/stack contract.
2. Cloud workspaces still feel like real boxes developers can shell into.
3. Claude and Codex work immediately as in-box tools.
4. Provider auth is persisted and practical without a new provider-credential control plane.

## Core Decision

For V1 cloud workspaces, Claude and Codex authentication should happen inside the workspace shell and persist in mounted home volumes.

That means:

1. `claude auth login` runs inside the cloud box.
2. `codex login` runs inside the cloud box.
3. `~/.claude` and `~/.codex` live on mounted persistent storage.
4. Lifecycle may help the user reach those commands, but it does not become the source of truth for provider auth state.

## Non-Goals

This plan does not introduce:

1. Lifecycle-owned cloud `agent_session` orchestration for Claude or Codex
2. cloud-side provider transcript persistence as first-class Lifecycle state
3. delegated provider credentials stored in Lifecycle and injected into sandboxes
4. provider-native approval or elicitation UIs outside the shell
5. multi-user shared shells with one shared provider identity

Those can come later if needed. They are not prerequisites for a useful cloud coding workflow.

## User Journey

Starting state:

1. user is signed into Lifecycle
2. project is linked to a repository
3. cloud workspace exists or is being created

Flow:

1. user creates a cloud workspace from the CLI
2. user attaches a shell to the workspace
3. shell starts in the mounted project directory with the persistent home volume attached
4. user runs `claude auth login` or `codex login`
5. provider CLI stores auth state in `~/.claude` or `~/.codex`
6. user runs `claude`, `codex`, `bun`, `git`, or any other tools directly in the box
7. user detaches and later reattaches
8. provider auth remains available because the home directory is persistent

## Filesystem and Mount Contract

The cloud workspace needs at least three storage zones.

### 1. Project mount

Purpose:

1. checked-out repository contents
2. generated project files
3. workspace-local runtime state that belongs with the project

Recommended mount:

1. `/workspace`

Rules:

1. shell `cwd` starts here by default
2. this mount is workspace-scoped
3. provider auth material must never be stored here

### 2. User home mount

Purpose:

1. shell home directory
2. provider login state
3. editor and CLI config
4. user-scoped caches that should survive workspace restarts

Recommended mount:

1. `/home/lifecycle`

Expected provider paths:

1. `/home/lifecycle/.claude`
2. `/home/lifecycle/.codex`
3. `/home/lifecycle/.config/...` when providers store config there

Rules:

1. this mount is user-scoped, not project-scoped
2. this mount persists across workspace stop/start and wake cycles
3. destroying a workspace does not necessarily destroy the user home mount
4. shell access to this mount is equivalent to access to the provider identity stored there

Current Daytona note:

1. the mounted home volume currently behaves like a permissive sync mount rather than a normal Unix home filesystem
2. Codex's interactive CLI expects to chmod and create `0600` files under its state directory and fails when pointed directly at that mount
3. Lifecycle should therefore persist Codex state under `/home/lifecycle/.codex` but stage it into a normal writable runtime directory via `CODEX_HOME` only when Codex is launched, then sync the durable subset back after Codex exits

### 3. Cache mount

Purpose:

1. package caches
2. tool caches
3. language or model caches that are expensive to rebuild

Recommended mount:

1. `/home/lifecycle/.cache`
2. or a separate mounted cache path bound into that location

Rules:

1. cache persistence is useful but secondary
2. auth persistence must not depend on cache persistence

## Identity and Ownership Model

The simplest safe V1 model is owner-scoped shell access.

Rules:

1. each cloud workspace has one owning Lifecycle user for shell access
2. that owner gets one mounted home volume when attaching a shell
3. preview sharing and org visibility do not imply shell access
4. shell access implies access to the provider auth state stored in the mounted home

Implication:

1. viewers may inspect previews or metadata without receiving shell access
2. editors/admins may still need explicit shell permission before getting attach rights

## Future Multi-User Model

If shared cloud shells ship later, each collaborator must get a distinct Unix/home identity.

Do not share one mounted `~/.claude` or `~/.codex` directory between collaborators.

Future shape:

1. shared `/workspace`
2. separate `/home/<user>` per collaborator
3. shell attach resolves the caller's own home volume
4. provider auth remains user-specific even when the project files are shared

## Shell Launch Contract

`lifecycle workspace shell <workspace>` should:

1. resolve the target cloud workspace
2. request an attach token from the control plane
3. open a plain PTY shell to the sandbox
4. let the sandbox image's shell profile set `HOME`, prompt state, and `cwd`, while preparing `CODEX_HOME` lazily on Codex launch
5. land in the project worktree with the mounted home volume attached
6. expose Lifecycle context env vars

Recommended environment variables:

1. `LIFECYCLE_WORKSPACE_ID`
2. `LIFECYCLE_PROJECT_ID`
3. `LIFECYCLE_WORKSPACE_HOST=cloud`
4. `LIFECYCLE_WORKSPACE_PATH=/workspace`
5. `HOME=/home/lifecycle`
6. `CODEX_HOME` should point at a normal writable runtime directory outside the mounted home when Codex is launched in Daytona-backed shells. Today that resolves to `/root/.lifecycle-codex` in root-backed shells and `/tmp/lifecycle-codex` otherwise.
7. Shell attach must not block on copying large persisted Codex state; staging should happen on first `codex` invocation, not before the prompt appears.
8. Daytona-backed shells should keep npm cache writes off the mounted home as well, because provider self-update flows may otherwise fail on rename-heavy cache operations. Today that cache resolves to `/root/.npm` in root-backed shells and `/tmp/lifecycle-npm-cache` otherwise.

Implementation note:

1. the CLI should prefer a plain SSH attach for `workspace shell`
2. shell/profile setup belongs in the sandbox image rather than a nested `ssh ... bash -lc` wrapper
3. `agent launch` should reuse the same plain shell attach and inject a short provider launcher function name over stdin instead of relying on SSH remote-command mode, which has proven unreliable in Daytona-backed shells

The image should also ensure:

1. `lifecycle` is on `PATH`
2. `claude` is on `PATH`
3. `codex` is on `PATH`
4. common development tools are available for the workspace image

## CLI Contract

The core cloud-shell commands should be:

```bash
lifecycle workspace shell <workspace>
lifecycle workspace exec <workspace> -- <command...>
lifecycle workspace status <workspace>
lifecycle workspace stop <workspace>
lifecycle workspace wake <workspace>
lifecycle agent --workspace-id <id> --provider <claude|codex>
```

`lifecycle agent --workspace-id <id> --provider <claude|codex>` is a convenience launcher. It should attach to the target workspace and execute the selected provider CLI inside the box. It should not create a Lifecycle-owned cloud `agent_session` record in V1.

Provider auth should work through normal in-box commands:

```bash
lifecycle workspace exec <workspace> -- claude auth status
lifecycle workspace exec <workspace> -- claude auth login --console
lifecycle workspace exec <workspace> -- codex login
```

Optional sugar may be added later:

```bash
lifecycle agent auth status --provider claude --workspace <workspace>
lifecycle agent auth login --provider claude --workspace <workspace>
```

But those wrapper commands should simply delegate to in-box provider CLI commands rather than introducing a second auth model.

Recommended launch mapping:

1. `lifecycle agent --workspace-id ws_123 --provider claude` -> attach shell and launch `claude`
2. `lifecycle agent --workspace-id ws_123 --provider codex` -> attach shell and launch `codex`
3. plain `lifecycle workspace shell` remains the lower-level primitive for users who want a normal shell first

## Provider Auth Rules

### Claude

1. `claude auth login` runs inside the cloud shell
2. provider state persists in the mounted home directory
3. Lifecycle may inspect auth state with `claude auth status`
4. Lifecycle must not assume local desktop Claude auth applies to the cloud box

### Codex

1. `codex login` runs inside the cloud shell
2. provider state persists in the mounted home directory
3. Lifecycle may inspect auth state with provider-supported status commands
4. Lifecycle must not assume local desktop Codex auth applies to the cloud box

## Security and Risk Model

This design is intentionally simple, but it has one unavoidable truth:

shell access implies access to the auth state stored in the mounted home directory.

Rules:

1. provider auth directories must never be stored in the shared project mount
2. home volumes must be encrypted at rest if the platform supports it
3. attach tokens must be short-lived and scoped to one workspace shell session
4. owner-only shell access is the default safe V1 policy
5. shell permission must be explicit in the control plane and auditable

Operational consequences:

1. granting shell access is effectively granting use of the in-box provider identity for that home volume
2. if that is too permissive for a workspace, the collaborator should not receive shell access in V1
3. if multi-user shell collaboration is required, the platform must move to separate homes per user before broad rollout

## Lifecycle Responsibilities

Lifecycle should own:

1. provisioning the cloud workspace
2. mounting project, home, and cache volumes
3. attaching/detaching shell sessions
4. setting workspace env vars
5. ensuring provider CLIs are installed in the image
6. exposing typed workspace lifecycle commands
7. optionally surfacing provider auth status by invoking provider status commands in the box

Lifecycle should not own in V1:

1. provider token issuance for cloud shells
2. provider transcript normalization
3. Claude or Codex approval UX outside the shell
4. provider-native session persistence as Lifecycle records

## Relationship to First-Party Agent Sessions

This plan is intentionally shell-first.

It does not block a future Lifecycle-owned cloud `agent_session` model, but it does remove that work from the critical path for cloud coding.

If first-party cloud agent sessions are added later, they can build on one of two models:

1. reuse in-box provider auth from the mounted home directory
2. introduce a new delegated provider-credential system for managed agent runtimes

That later decision should not block shell-based cloud workspaces now.

## Exit Gate

- create a cloud workspace and attach a shell with `cwd=/workspace`
- run `claude auth login` inside the box and observe provider state persisted under the mounted home directory
- detach, reattach, and verify `claude auth status` still succeeds
- run `codex login` inside the box and observe provider state persisted under the mounted home directory
- stop and wake the workspace; provider auth remains available after wake
- provider auth files never appear under `/workspace`
- a user without shell permission cannot access the mounted home directory or provider auth state
- `lifecycle agent --workspace-id <workspace> --provider claude` launches Claude using the persisted in-box auth state
- `lifecycle agent --workspace-id <workspace> --provider codex` launches Codex using the persisted in-box auth state

## Test Scenarios

```text
create cloud workspace -> workspace shell -> shell opens in /workspace with HOME=/home/lifecycle
workspace shell -> claude auth login -> browser/device flow completes -> ~/.claude created on mounted home volume
detach shell -> reattach shell -> claude auth status -> authenticated
workspace exec -- claude auth status -> returns authenticated without interactive shell
workspace shell -> codex login -> Codex uses `CODEX_HOME=/root/.lifecycle-codex` at runtime and syncs the durable persisted subset back into `~/.codex` on the mounted home volume
workspace stop -> workspace wake -> workspace exec -- claude auth status -> still authenticated
workspace destroy -> recreate workspace for same user with same mounted home strategy -> provider auth policy behaves as designed
list files under /workspace -> no provider auth files present
viewer without shell permission -> attach denied with typed authorization error
agent --workspace-id <workspace> --provider claude -> claude starts without re-auth when ~/.claude already exists
agent --workspace-id <workspace> --provider codex -> codex starts without re-auth when the persisted `~/.codex` auth/config subset is staged back into `CODEX_HOME`
```
