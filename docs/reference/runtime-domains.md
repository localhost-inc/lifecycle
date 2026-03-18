# Runtime Domains

This document defines the **canonical runtime/control-plane domain taxonomy** for Lifecycle backend and CLI work.

The goal is to keep ownership boundaries stable as local and cloud execution grow, without turning the codebase into a generic `manager`/`util` bucket.

This document is intentionally about:

1. domain ownership
2. cross-domain boundaries
3. local-vs-cloud placement rules
4. backend and CLI taxonomy
5. decision rules for where new runtime work belongs

It is intentionally **not**:

1. a milestone scope checklist
2. a file-by-file migration plan
3. a replacement for provider, shell, or manifest contracts

## Status

1. This is a **cross-milestone reference contract**, not a statement that every domain is already fully implemented.
2. The active local runtime still lives primarily in the desktop Tauri/Rust backend.
3. Future cloud-control-plane work should adopt this taxonomy instead of inventing parallel folder nouns.

## Relationship to Other Contracts

1. [workspace-provider.md](./workspace-provider.md) remains authoritative for workspace authority, provider boundaries, terminal authority, Git authority, and local-vs-cloud mode rules.
2. [workspace-environment-graph.md](./workspace-environment-graph.md) remains authoritative for manifest execution shape, node kinds, and dependency ordering.
3. [cloud-terminal-attach.md](./cloud-terminal-attach.md) remains authoritative for cloud attach transport details.
4. [events.md](./events.md), [errors.md](./errors.md), and [state-machines.md](./state-machines.md) remain authoritative for event, failure, and lifecycle semantics.
5. [../backlog/agent-workspace.md](../backlog/agent-workspace.md) remains authoritative for the deferred center-panel agent session model.
6. Execution sequencing and refactors belong in `docs/execution/*`, not here.

## Why This Exists

Lifecycle now spans multiple architectural planes:

1. local provider execution inside the desktop app
2. future cloud provider execution and control plane
3. preview and attach transports
4. external platform integrations
5. multi-step user workflows such as fork, share, preview, and PR creation

Without a stable taxonomy, new modules drift into vague buckets such as `manager`, `helpers`, or transport-specific feature code.

## Core Rule

If a new runtime concern does not clearly fit one of the domains below, the design is not ready yet.

## Domain Map

### `contracts`

Purpose:

1. shared type contracts and schemas
2. normalized command inputs and query outputs
3. event, error, and state-machine shapes
4. manifest parsing and validation contracts

Owns:

1. types that must be shared across app, CLI, provider, and control-plane boundaries
2. wire-safe payload shapes
3. provider-agnostic domain nouns

Does not own:

1. process supervision
2. transport clients
3. platform SDK calls
4. workflow orchestration

### `providers`

Purpose:

1. authority boundary for workspace-scoped lifecycle operations
2. local-vs-cloud runtime selection
3. provider-owned mutations and snapshots

Owns:

1. `LocalWorkspaceProvider`
2. `CloudWorkspaceProvider`
3. workspace-scoped reads and mutations that depend on authoritative execution context
4. provider-specific assembly of lower-level execution, transport, and integration modules

Does not own:

1. shared contracts
2. frontend presentation concerns
3. long-lived workflow coordination that spans multiple providers or control-plane entities

Decision rule:

1. If `workspace.mode` changes who is authoritative, the concern belongs here.

### `execution`

Purpose:

1. live runtime behavior inside the authoritative provider
2. stateful machinery that runs workloads, supervises services, or projects activity

Expected subdomains:

1. `environment`
2. `service`
3. `terminal`
4. `process`
5. `preview`
6. `sources`
7. `git`
8. `activity`
9. `attachments` when they are runtime-owned rather than pure UI state

Owns:

1. process spawning and cancellation
2. service supervision and readiness
3. terminal session lifecycle
4. runtime projection and activity recording
5. local preview routing and service-port resolution
6. source checkout / worktree materialization
7. workspace-scoped Git execution

Does not own:

1. auth providers
2. external API account linkage
3. preview invite policy
4. UI-only state

Decision rule:

1. If it supervises or inspects a live workspace runtime, it belongs in `execution`.

### `transport`

Purpose:

1. move bytes, tokens, streams, or requests between surfaces and the authoritative runtime
2. keep connection mechanics separate from execution semantics

Expected subdomains:

1. `attach`
2. `preview-proxy`
3. `tunnel`
4. streaming or subscription adapters when they are transport concerns rather than event semantics

Owns:

1. remote attach bridges
2. preview gateway / proxy mechanics
3. tunnel registration and redemption
4. websocket / SSE / local IPC client-server connection logic

Does not own:

1. lifecycle state machines
2. provider selection
3. product authorization policy
4. frontend feature state

Decision rule:

1. If the concern is primarily about how a caller reaches the authoritative runtime, it belongs in `transport`.

### `integrations`

Purpose:

1. isolate platform-specific identity, API, and SDK glue
2. prevent provider and workflow code from being littered with third-party specifics

Expected subdomains:

1. `github`
2. `workos`
3. `cloudflare`
4. `mcp`
5. future external systems such as Slack or Linear when they become runtime/control-plane inputs

Owns:

1. API clients and token exchange helpers
2. webhook adapters
3. external platform request/response normalization
4. provider-neutral wrappers around third-party SDK usage

Does not own:

1. first-class Lifecycle workflow semantics
2. workspace authority decisions
3. renderer concerns

Decision rule:

1. If the noun is the name of an external platform, the concern probably belongs here.

### `workflows`

Purpose:

1. compose multiple domains into user-visible verbs
2. keep long-running multi-step actions explicit

Expected subdomains:

1. `fork`
2. `share`
3. `pr`
4. `deploy`
5. `snapshot`
6. `status`

Owns:

1. user-facing orchestration across provider, transport, integration, and execution domains
2. sequencing, retries, rollback decisions, and progress reporting for multi-step flows

Does not own:

1. low-level process control
2. raw API client implementation
3. event schema definitions

Decision rule:

1. If the feature is a verb that composes several domains, it belongs in `workflows`.

## Domain Interaction Rules

1. `contracts` may be imported by every other domain.
2. `providers` may assemble `execution`, `transport`, `integrations`, and `workflows`, but should not become a dumping ground for their internals.
3. `execution` should depend on `contracts` and, when necessary, narrow `integrations`, but should not directly absorb transport concerns.
4. `transport` may depend on `contracts` and narrow `integrations`, but should not become the source of truth for lifecycle semantics.
5. `workflows` may compose `providers`, `execution`, `transport`, and `integrations`, but should keep the underlying domain boundaries visible.
6. Frontend feature code should call the appropriate provider or workflow surface, not reach directly into low-level execution or integration modules.

## Naming Guardrails

Prefer these nouns:

1. `provider`
2. `execution`
3. `transport`
4. `integration`
5. `workflow`
6. explicit concrete domain names such as `preview`, `attach`, `sources`, `git`, or `activity`

Avoid these nouns as primary homes for new work:

1. `manager`
2. `helpers`
3. `misc`
4. `common`
5. `internal` as a semantic catch-all

`util` is acceptable only for leaf-level helpers that are truly generic and have no domain ownership implications.

## Mapping to the Current Repo

Current placement should trend toward:

1. `packages/contracts`
   - shared contracts and schemas
2. `packages/runtime`
   - provider interfaces plus provider-agnostic runtime APIs
3. `apps/desktop/src-tauri/src/platform/*`
   - local provider implementation, execution machinery, and local transport/runtime plumbing
4. future cloud control-plane surfaces
   - cloud provider implementation, transport, workflows, and external integrations
5. `apps/desktop/src/features/*`
   - frontend feature ownership; this document does not redefine frontend feature grouping

## Milestone Alignment

### M4

Primary domains:

1. `providers`
2. `execution`
3. `transport` for local preview routing

### M5

Primary domains:

1. `providers`
2. `execution`
3. `workflows`
4. CLI-facing domain adapters over the same contracts

### M6

Primary domains:

1. `providers`
2. `transport`
3. `integrations`
4. `workflows`

Cloud auth, preview, shared-terminal attach, and PR creation should extend these domains rather than inventing parallel architecture.

## Frontend Boundary

This taxonomy is for backend, provider, transport, and CLI architecture.

Frontend code should remain feature-oriented and route-authoritative. Do not mirror backend runtime folders directly into React feature layout unless a real UI ownership need exists.

## Test for New Work

Before adding a new runtime module, answer these questions:

1. Is this a shared contract, a provider authority decision, live execution machinery, a transport path, an external integration, or a composed workflow?
2. Does it change who is authoritative for a workspace?
3. Is the primary complexity runtime state, connectivity, third-party API glue, or multi-step orchestration?
4. Can the module name be a concrete domain noun instead of `manager` or `helpers`?

If those answers are fuzzy, stop and refine the boundary first.
