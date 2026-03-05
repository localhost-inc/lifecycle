# Lifecycle Execution Plan

This is the build execution tracker for Lifecycle. It translates milestone intent into shippable task checklists.

## How To Use This Doc

1. Keep milestone status current (`planned`, `in_progress`, `done`, `blocked`).
2. Check tasks as they are completed.
3. Link PRs/issues beside completed tasks where relevant.
4. Update this doc in the same PR that changes milestone scope.

## Milestone Status Board

| Milestone | Status  | Depends On | Primary Outcome                                          |
| --------- | ------- | ---------- | -------------------------------------------------------- |
| M0        | done    | none       | Bun monorepo bootstrap and quality gates                 |
| M1        | done    | M0         | Add project and validate `lifecycle.json` in desktop app |
| M2        | done    | M1         | Local workspace reaches `ready` with service health      |
| M3        | planned | M2         | Terminal/agent sessions inside workspace runtime         |
| M4        | planned | M3         | Full local lifecycle (run/reset/sleep/wake/destroy)      |
| M5        | planned | M4         | First-class CLI (local)                                  |
| M6        | planned | M5         | Auth + cloud + preview + PR                              |
| M7        | planned | M6         | Cloud lifecycle production-ready (TTL, quotas)           |

## M0 - Bun Monorepo Bootstrap

Reference: [docs/milestones/m0.md](./milestones/m0.md)

### Initialize Monorepo
- [x] Create root `package.json` with Bun workspaces and unified scripts
- [x] Add `bun.lock` and pin Bun version expectations
- [x] Create root folders (`apps`, `packages`, `docs`) with starter package manifests

### Establish Shared Tooling
- [x] Add shared `packages/config/tsconfig.base.json` and package-level `tsconfig.json` inheritance
- [x] Configure lint + format tooling (OXC) and root commands
- [x] Configure test runner baseline (`bun:test`) and root `test` command
- [x] Configure `typecheck` command across all workspaces

### Seed Runtime-Oriented Packages
- [x] Add `packages/contracts` with initial shared types (`workspace`, `workspace_service`, error envelope)
- [x] Add `packages/runtime` with `WorkspaceProvider` interface placeholder
- [x] Add `packages/cli` command scaffold with no-op `lifecycle --help`
- [x] Add `apps/desktop` and `apps/worker` starter scaffolds

### Developer Experience
- [x] Add `.editorconfig`, `.gitignore`, and pre-commit hooks
- [x] Add `README` setup section for clone/install/run/test in <10 minutes
- [x] Ensure `bun run dev` starts a minimal happy-path development loop

### CI Baseline
- [x] Add CI workflow for install + lint + typecheck + test on pull requests
- [x] Ensure CI uses Bun and workspace-aware caching
- [x] Fail fast on type or lint regression

## M1 - App Opens, Project Added, Config Visible

Reference: [docs/milestones/m1.md](./milestones/m1.md)

- [x] Tauri app shell (Rust backend + React webview)
- [x] "Add project" directory picker flow
- [x] `lifecycle.json` JSONC parser + Zod schema validation with field-level errors
- [x] Project entity: SQLite persistence with unique path constraint
- [x] Project sidebar with name + config status indicators (valid/invalid/missing)
- [x] Config panel: parsed services, setup steps, secrets overview
- [x] Tests: valid/invalid/missing manifest cases + persistence across sessions

## M2 - Local Workspace Reaches Ready

Reference: [docs/milestones/m2.md](./milestones/m2.md)

### Entities and State
- [x] `workspace` entity: SQLite schema with status, mode, mode_state, failure_reason fields
- [x] `workspace_service` entity: per-service runtime state with status, exposure, ports
- [x] Workspace state machine: `creating → starting → ready → failed` transitions with implicit mutation lock

### LocalWorkspaceProvider
- [x] `createWorkspace`: git worktree checkout
- [x] Setup step execution: sequential, exactly-once, with stdout streaming
- [x] `startServices`: spawn local processes + Docker containers (bollard)
- [x] Health check gate: tcp + http probes per service
- [x] `ready` transition: gated on all service health checks passing
- [x] `stopServices`: SIGTERM process group
- [x] Typed failure reasons for setup step and health check failures

### Desktop UI
- [x] Workspace status progression (creating → starting → ready)
- [x] Per-service health indicators (spinner → green checkmark)
- [x] Setup step progress with stdout display
- [x] Failure detail surface with typed error reasons

## M3 - Terminal and Agent Runtime

Reference: [docs/milestones/m3.md](./milestones/m3.md)

### Entity and State
- [ ] `terminal` entity: SQLite schema with harness, status, label, failure_reason fields
- [ ] Terminal state machine: active/detached/sleeping/finished/failed transitions

### PTY Architecture
- [ ] PTY spawn via `portable-pty` in workspace worktree directory
- [ ] Tauri IPC bridge: PTY output piped to xterm.js (no WebSocket)
- [ ] xterm.js integration in Tauri webview
- [ ] Detach/reattach: process continues under Tauri supervision, output buffered for replay

### Agent Harness Support
- [ ] Claude Code launch/resume with `--session-id`/`--resume`
- [ ] Codex CLI launch/resume with `--json` thread capture
- [ ] Generic harness: PTY spawn with no session capture for other agents

### Desktop UI
- [ ] Terminal tabs with label and state indicators
- [ ] "+" button with harness/shell picker
- [ ] Tab switching with detach/attach semantics
- [ ] Finished state with exit code display
- [ ] Theme foundation: `appearance` (`light|dark|system`) + named preset themes (IDE-style ready)
- [ ] Shared UI package (`@lifecycle/ui`) for tokens and shadcn-ready primitives

### Tests
- [ ] Terminal attach/detach, reattach with output replay, process exit handling

## M4 - Full Local Lifecycle

Reference: [docs/milestones/m4.md](./milestones/m4.md)

### Workspace Operations
- [ ] `run` command: restart all workspace services using manifest + workspace_service overrides
- [ ] `reset` command: restore post-setup baseline, re-seed data, restart services

### Local Sleep/Wake
- [ ] Local sleep: SIGTERM process group, worktree stays on disk
- [ ] Local wake: restart services from manifest (skip setup/clone)

### Local Destroy
- [ ] Destroy (local): kill process group, prune git worktree, clean SQLite metadata

### Local Preview
- [ ] `localhost:<effective_port>` with near-instant provisioning
- [ ] Preview state machine: provider-agnostic transitions

### Enforcement and Locking
- [ ] Terminal sleep/wake: active/detached -> sleeping on workspace sleep, resume on wake
- [ ] Mutation locking: transitional states reject new mutations with `workspace_mutation_locked`

### Desktop UI
- [ ] Run, reset, destroy buttons in operations panel
- [ ] Destroy/reset confirmation dialogs
- [ ] Sleep/wake indicators and auto-wake on click
- [ ] Terminal "suspended" state during workspace sleep
- [ ] Service share toggles and port overrides (local-scoped)
- [ ] Preview URL display (`localhost:<port>`)

### Tests
- [ ] Run/reset round-trips, sleep/wake round-trips, destroy cleanup, mutation locking, local preview

## M5 - First-Class CLI (Local)

Reference: [docs/milestones/m5.md](./milestones/m5.md)

### Context and Conventions
- [ ] Workspace context auto-detection: resolve workspace from cwd worktree path
- [ ] Output conventions: human-readable default, `--json` stable contracts, `--verbose` debug
- [ ] Error style: failed command, reason, suggested next step
- [ ] Help: `--help` with examples on every subcommand, concise root command map

### Observability Commands
- [ ] `lifecycle workspace status`: single-screen dashboard with `--json` support
- [ ] `lifecycle workspace logs <service>`: `--tail`, `--since`, `--grep`, `--follow`, `--json`
- [ ] `lifecycle workspace health`: on-demand health checks with per-service results
- [ ] `lifecycle context`: one-shot structured dump for agent consumption

### Service Commands
- [ ] `lifecycle workspace service list` and `lifecycle workspace service set`

### Local Lifecycle Commands
- [ ] `lifecycle workspace create/run/reset/destroy` (local-only, `--local` default)
- [ ] `lifecycle terminal start/status` commands

### Onboarding Commands (Local)
- [ ] `lifecycle setup`
- [ ] `lifecycle repo init/list`

### Tests
- [ ] Context auto-detection, each command surface, `--json` output contracts

## M6 - Auth, Cloud, Preview, and PR

Reference: [docs/milestones/m6.md](./milestones/m6.md)

### Auth and Identity
- [ ] WorkOS Device Authorization Flow: desktop sign-in via system browser
- [ ] Token storage: OS keychain via Tauri secure storage, auto-refresh on expiry

### Cloud Data Layer
- [ ] Convex connection from Tauri webview with WorkOS JWT validation
- [ ] Convex schemas: `organization`, `repository`, `activity` tables with indexes
- [ ] Local-to-cloud sync: project, workspace, workspace_service, terminal from SQLite to Convex

### GitHub Integration
- [ ] GitHub App installation flow in desktop app
- [ ] Project -> repository linking: auto-detect from git remote, manual override

### Cloud Workspace Provider
- [ ] `CloudWorkspaceProvider.createWorkspace`: cloud workspace creation with typed errors
- [ ] Fork-to-cloud: stash-commit dirty tree, push temp branch, create cloud workspace
- [ ] Fork-to-cloud UI: "Include uncommitted changes" + "Destroy local source" options
- [ ] Cloud-to-local fork: create local workspace at same ref from cloud workspace

### Cloud Preview
- [ ] `exposePort()` with deterministic tokens per {workspace_id, service_name}
- [ ] Cloudflare Worker: wildcard-edge route for `*.preview.<org>.<domain>`
- [ ] `proxyToSandbox()` routing: resolve to {sandbox_id, effective_port}
- [ ] Preview URL stability: same URL across service restarts and wake cycles
- [ ] WorkOS JWT-based preview tokens (1-hour TTL, cookie storage)

### PR Creation
- [ ] PR creation via GitHub App: control plane Convex action with head/base validation
- [ ] PR UI: "Create PR" button with no-diff and permission error handling

### Desktop UI
- [ ] Org switcher: top-left control for switching organization context
- [ ] Cloud workspace list: org-scoped, cloud-only workspace display
- [ ] Activity feed: real-time workspace state transitions via Convex reactive queries
- [ ] Service share toggles (cloud context), preview URL copy, PR button

### Cloud CLI Commands
- [ ] `lifecycle auth login` + `lifecycle org select`
- [ ] `lifecycle repo add`
- [ ] `lifecycle pr create`
- [ ] `lifecycle workspace fork --mode cloud`

### Access Control and Events
- [ ] RBAC: viewer/editor/admin permission enforcement in Convex functions
- [ ] GitHub webhook handling: branch/check updates, signature verification, dedup

### Tests
- [ ] Auth flow, fork-to-cloud, cloud preview, PR creation, org visibility

## M7 - Cloud Lifecycle Production-Ready

Reference: [docs/milestones/m7.md](./milestones/m7.md)

### Cloud Sleep/Wake
- [ ] Cloud sleep: R2 backup of worktree filesystem, terminate sandbox
- [ ] Cloud wake: provision new sandbox, restore from R2, re-run service startup (skip setup/clone)
- [ ] Sleeping workspace wake response: deterministic "waking" page instead of 404

### Cloud Destroy
- [ ] Destroy (cloud): terminate sandbox, revoke credentials, clean metadata

### TTL and Quotas
- [ ] TTL enforcement: 24-hour default, daily sweeper, audit events on expiration
- [ ] Org quotas: max active workspaces per organization

### Tests
- [ ] Cloud sleep/wake round-trips, TTL cleanup, quota enforcement

## Cross-Milestone Standards (Always On)

- [ ] Keep `workspace` naming canonical across all layers
- [ ] Keep typed errors aligned with [docs/reference/errors.md](./reference/errors.md)
- [ ] Keep transitions aligned with [docs/reference/state-machines.md](./reference/state-machines.md)
- [ ] Keep runtime provider boundaries aligned with [docs/reference/workspace-provider.md](./reference/workspace-provider.md)
- [ ] Keep SLO tracking aligned with [docs/reference/slos.md](./reference/slos.md)
