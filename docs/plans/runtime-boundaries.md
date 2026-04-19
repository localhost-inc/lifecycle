# Plan: Runtime Boundaries

> Status: active execution plan
> Plan index: [docs/plans/README.md](./README.md)

## Goal

Collapse runtime ownership to the smallest shippable boundary.

Clients should have one runtime authority surface: the bridge. The shipped executable boundary should be the CLI. Shared schemas and persistence stay in packages that justify their existence. Everything else should collapse into that boundary or stay presentation-only.

## Current Boundary

### `apps/cli`

Owns the shipped executable, command grammar, and packaged helper payload.

Rules:

1. `lifecycle` is the only Lifecycle-owned executable the desktop app bundles.
2. User-facing bridge control remains `lifecycle bridge start|stop|status`.
3. Any first-party agent runtime the product keeps must stay bridge-owned inside the CLI package instead of reviving a separate runtime package.

### `apps/cli/src/bridge`

Owns local runtime authority.

Rules:

1. Runtime reads, mutations, and lifecycle streaming flow through this boundary.
2. Host adapters, stack runtime, terminal runtime, bridge-owned agent sessions, auth passthrough, and workspace orchestration live here.
3. There is no separate `packages/bridge` workspace package anymore.

### `packages/contracts`

Owns stable cross-boundary nouns and wire payloads.

Examples:

1. workspace, service, repository, and organization records
2. request/response payloads shared across bridge, control plane, CLI, TUI, and native clients
3. stable enums, state values, and typed error codes

### `packages/db`

Owns control-plane persistence and related durable storage helpers.

### `apps/desktop-mac` and `apps/cli/src/tui`

Own presentation only.

Rules:

1. UI state lives here.
2. Runtime authority does not.
3. The shipped TUI is part of the CLI package, not a separate executable boundary.
4. Packaged desktop mode launches the bundled CLI helper by absolute path instead of re-implementing bridge orchestration in Swift.

## Removed Surface Area

The repo has already collapsed several runtime edges:

1. `packages/bridge` is gone; bridge runtime now lives under `apps/cli/src/bridge`.
2. `packages/agents` is no longer part of the active runtime boundary.

## Active Constraints

1. Do not reintroduce a separate bridge package.
2. Do not add new client-side side paths that shell out to ad hoc runtime internals.
3. Keep the desktop shipping boundary to `Lifecycle.app` plus the bundled CLI helper payload.
4. Keep provider-backed agent orchestration inside the bridge boundary instead of reviving client-owned or package-owned side runtimes.

## Remaining Cleanup

1. Remove or archive remaining docs that still describe bridge-owned agent runtime as deleted product scope.
2. Keep trimming desktop presentation code that only existed for removed non-bridge agent paths.
3. Keep narrowing runtime dependencies so the packaged CLI helper stays self-contained and explicit about any staged native addons.

## Exit Gate

This plan is done when:

1. the shipped runtime authority is clearly `apps/cli/src/bridge`
2. the shipped executable boundary is clearly `apps/cli`
3. no active client depends on a separate bridge package or a non-bridge agent runtime
4. docs and packaging scripts describe the same boundary the repo actually ships
