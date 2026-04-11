# Plan: Mac Presentation Boundaries

> Status: planned execution plan
> Depends on: [Runtime Boundaries](./runtime-boundaries.md)
> Plan index: [docs/plans/README.md](./README.md)
> Current execution focus: desktop-mac is maintenance-only at the repo level, but this plan is the contract for keeping the mac app aligned with the bridge-first architecture when we do invest in it.

## Goal

Make the mac app a native rendering shell, not a second application brain.

The mac app should own windowing, terminal hosting, canvas interaction, focus, menus, diagnostics, and native rendering. It should not own agent semantics, transcript projection rules, workspace runtime authority, or bridge/control-plane orchestration logic.

## Core Rule

Swift is the renderer and shell host.

Bridge, control plane, and shared packages own semantics.

Rules:

1. The mac app renders normalized presentation state.
2. The mac app emits typed user intents.
3. Bridge and control plane remain the only runtime authority boundaries.
4. Shared TypeScript packages remain the canonical place for agent/session/workspace semantics unless a cross-client contract is promoted into `contracts` or a bridge route.
5. No feature should require implementing the same state machine once in TypeScript and again in Swift.

## Naming Direction

Do not use `DesktopMac` as the internal architectural prefix for every layer. That name is fine for the folder, package container, and bundle lineage. It is not a good boundary name.

Prefer role-based names inside the codebase:

1. `LifecycleApp` — composition root and executable target
2. `LifecycleUI` — SwiftUI/AppKit views and surface shells
3. `LifecyclePresentation` — immutable render models, view state, tab metadata, and typed UI intents
4. `LifecycleBridgeClient` — bridge discovery, HTTP, WebSocket, reconnect, hydration, and request execution
5. `LifecyclePlatformMac` — Ghostty host, AppKit integrations, menus, window coordination, drag/drop, OS diagnostics

Recommendation:

1. Use `LifecyclePresentation` for the render-model boundary only.
2. Do not use `LifecyclePresentation` as a euphemism for the whole app.
3. If a module is mac-only, say so explicitly with `Mac` in the role name, for example `LifecyclePlatformMac`.

## Target Architecture

The `apps/desktop-mac` package should be split into SwiftPM targets with a one-way dependency graph.

### `LifecyclePresentation`

Owns pure UI-facing state only.

Examples:

1. canvas surface presentation models
2. tab titles, subtitles, icons, activity badges
3. agent transcript render models
4. loading/error/empty phase enums
5. typed user intents for opening tabs, sending prompts, resolving approvals, resizing panes

Rules:

1. No `URLSession`
2. No socket code
3. No file I/O
4. No `ProcessInfo`
5. No bridge model decoding
6. No runtime orchestration

### `LifecycleBridgeClient`

Owns external communication and hydration.

Examples:

1. bridge discovery and reconnect
2. HTTP request execution
3. WebSocket subscription management
4. snapshot hydration
5. translating bridge payloads into presentation models
6. issuing typed intents to bridge and control plane

Rules:

1. No SwiftUI views
2. No AppKit layout logic
3. No Ghostty hosting
4. No canvas gesture logic

### `LifecyclePlatformMac`

Owns the mac-only platform layer.

Examples:

1. Ghostty embedding
2. AppKit bridges
3. menu commands
4. focus and first responder coordination
5. native drag/drop integration
6. OSLog and signposts

Rules:

1. No agent transcript semantics
2. No workspace authority rules
3. No bridge-specific state machines beyond platform lifecycle glue

### `LifecycleUI`

Owns views and view composition only.

Examples:

1. workspace shell
2. canvas views
3. surface views
4. transcript views
5. status bars and toolbars

Rules:

1. Consume `LifecyclePresentation`
2. Emit intents upward
3. Do not parse socket events
4. Do not merge transcript messages
5. Do not debounce authority updates
6. Do not talk to `URLSession` directly

### `LifecycleApp`

Owns app composition.

Examples:

1. root dependency wiring
2. scene/window setup
3. environment injection
4. target registration

## Allowed Dependency Graph

1. `LifecycleUI -> LifecyclePresentation`
2. `LifecyclePlatformMac -> LifecyclePresentation`
3. `LifecycleBridgeClient -> LifecyclePresentation`
4. `LifecycleApp -> LifecycleUI`
5. `LifecycleApp -> LifecycleBridgeClient`
6. `LifecycleApp -> LifecyclePlatformMac`
7. `LifecycleApp -> LifecyclePresentation`

Forbidden:

1. `LifecycleUI -> LifecycleBridgeClient`
2. `LifecycleUI -> BridgeSocket`
3. `LifecycleUI -> URLSession`
4. `LifecycleUI -> FileManager`
5. `LifecycleUI -> ProcessInfo`
6. `LifecyclePlatformMac -> bridge/domain reducers`
7. `LifecyclePresentation -> SwiftUI`

## Domain Ownership Rules

### Agent Sessions

Custom agent surfaces are no longer part of the active desktop product contract.

Rules:

1. Do not add new first-party custom-agent UI, provider-auth flows, or transcript controls to the desktop app.
2. Keep desktop runtime ownership focused on workspace, terminal, stack, and bridge supervision concerns.
3. Any remaining legacy agent presentation code should be treated as cleanup work, not an active product area.

### Canvas

Swift owns canvas presentation state.

Examples:

1. active group
2. tab order
3. split layout
4. focus
5. visibility
6. drag/drop hover state

Swift does not own runtime authority.

Examples:

1. terminal creation semantics
2. session hydration semantics
3. workspace placement authority
4. host selection

### Terminal

Swift owns terminal hosting.

Examples:

1. Ghostty embedding
2. compositor behavior
3. surface focus and visibility integration
4. native shell chrome

Bridge/workspace layers own terminal runtime semantics.

Examples:

1. tmux creation and attach
2. terminal identity normalization
3. remote/local/cloud runtime resolution
4. connection lifecycle payloads

## Enforced File Ownership

Within `apps/desktop-mac/Sources/LifecycleApp`, directory ownership should converge to:

1. `App/` -> `LifecycleApp`
2. `Bridge/` -> `LifecycleBridgeClient`
3. `Features/`, `Surfaces/`, `Components/` -> `LifecycleUI`
4. `Canvas/` -> split between `LifecyclePresentation` models and `LifecycleUI` views
5. `Runtime/` -> move platform-only pieces to `LifecyclePlatformMac`; move authority logic out
6. `Support/Diagnostics/` -> `LifecyclePlatformMac`

## Enforcement Mechanisms

### 1. SwiftPM Target Split

First-class enforcement comes from target boundaries, not conventions.

Phase target split:

1. create `LifecyclePresentation` target and move pure structs/enums there
2. create `LifecycleBridgeClient` target and move bridge bootstrap/socket/request code there
3. create `LifecyclePlatformMac` target and move Ghostty/AppKit integrations there
4. reduce `LifecycleApp` executable target to composition only
5. create `LifecycleUI` target for views once the first three separations are stable

### 2. Import Rules

Add a repo check that fails when forbidden imports appear in forbidden directories.

Examples:

1. fail if files under `Features/`, `Surfaces/`, or `Components/` import `FoundationNetworking`, `URLSession`, or bridge socket types
2. fail if files under `Bridge/` import `SwiftUI` view modules
3. fail if files under `Presentation/` import `SwiftUI`, `AppKit`, or networking code

### 3. Directory-Level Lint

Add a small script under `apps/desktop-mac/scripts/` that runs in `bun run qa` and asserts:

1. no `Task.sleep` inside `Features/` or `Surfaces/`
2. no `JSONDecoder` usage inside `Features/` or `Surfaces/`
3. no `FileManager` usage inside `Features/` or `Surfaces/`
4. no bridge model decoding in view files
5. no direct use of raw socket event types in UI files

### 4. View-Model Contract Tests

Add tests that validate:

1. bridge payloads translate into stable presentation models
2. presentation models are deterministic for the same inputs
3. transcript rendering logic is not spread across view files
4. view files only depend on render-ready models

### 5. ADR-Level Review Gate

Any new desktop-mac feature that introduces domain logic into Swift must answer:

1. why this cannot live in bridge or shared packages
2. whether web or future clients will need the same behavior
3. what the exit path is if it is temporarily local

If that answer is weak, the change should be blocked.

## Migration Order

1. Freeze new semantic logic in `desktop-mac` unless it is strictly presentation or platform glue.
2. Introduce `LifecyclePresentation` and move canvas/surface/tab/view-state models there.
3. Introduce `LifecycleBridgeClient` and move bridge bootstrap, socket, reconnect, and hydration there.
4. Introduce `LifecyclePlatformMac` and isolate Ghostty/AppKit/window integrations there.
5. Move `Features/` and `Surfaces/` to consume only presentation models and intents.
6. Replace mac-local agent reducers/projections with bridge-provided or shared canonical projections.
7. Add CI architecture checks and make them blocking.
8. Shrink the executable target to dependency wiring and scene boot only.

## Immediate First Cuts

These are the first concrete refactors to do, in order:

1. extract canvas and surface presentation structs/enums out of `AppModel.swift` and view files into `LifecyclePresentation`
2. move bridge bootstrap, discovery, HTTP, and socket ownership out of the executable target into `LifecycleBridgeClient`
3. move Ghostty host wrappers and AppKit adapters behind `LifecyclePlatformMac`
4. replace ad hoc mac agent transcript/session semantics with bridge-fed presentation payloads where possible
5. add the first architecture check script and fail CI on forbidden imports in UI directories

## Exit Gate

This plan is done when:

1. SwiftUI/AppKit files render presentation models and emit intents only
2. bridge/control-plane semantics are not duplicated in Swift
3. Ghostty/AppKit integration is isolated from domain logic
4. compile-time target boundaries enforce the architecture
5. CI blocks architectural regressions automatically
6. the mac app can evolve its native shell without becoming a second source of truth for product behavior
