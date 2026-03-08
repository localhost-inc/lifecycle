# Events and Hook Kernel

Canonical contract for Lifecycle's internal event kernel.

This document defines the normalized event and command-hook model that sits between provider/runtime authority and app consumers such as the desktop store, notifications, metrics, audit, and future plugins.

## Scope

Use this contract for:
1. Typed fact events that describe state changes or notable runtime outcomes
2. Typed command-hook phases around imperative operations
3. Normalization rules between provider-specific runtime signals and Lifecycle domain events

Do not use this contract for:
1. PTY byte streams
2. Terminal input transport
3. Line-by-line log streaming
4. Large artifact transfer
5. Ad hoc UI-local state notifications

## Core Model

Lifecycle separates three concerns:

1. `commands`
   - imperative requests such as `workspace.start`, `workspace.stop`, `terminal.create`
2. `events`
   - facts that already happened such as `workspace.status_changed`, `service.status_changed`, `terminal.renamed`
3. `hooks`
   - lifecycle observation points around commands: `before`, `after`, `failed`

These are intentionally not the same thing.

- Commands ask the system to do work.
- Events report what the authoritative runtime decided or observed.
- Hooks allow trusted Lifecycle-owned modules to observe or extend command execution without redefining the command surface itself.

## Authority Boundary

1. Provider/runtime code is authoritative for workspace, service, terminal, and future agent lifecycle facts.
2. The control plane may enrich or aggregate those facts, but it must not let UI-local state become authoritative lifecycle state.
3. React/store code consumes normalized events; it does not define the canonical event model.
4. Provider-specific signals must be normalized before they reach app consumers.

## Canonical Event Envelope

Canonical field names use `snake_case` at the kernel boundary so the shape stays portable across Rust, TypeScript, persistence, and future remote transport. Language-specific adapters may map casing at the edge.

```ts
interface LifecycleEvent<TPayload = unknown> {
  id: string;
  type: string;
  version: number;
  occurred_at: string;
  source: {
    layer: "provider" | "control_plane" | "desktop" | "cli" | "plugin";
    component: string;
    runtime: "local" | "cloud" | "system";
    provider?: string;
  };
  workspace_id?: string;
  project_id?: string;
  terminal_id?: string;
  service_name?: string;
  correlation_id?: string;
  causation_id?: string;
  payload: TPayload;
}
```

## Canonical Hook Envelope

Hooks are command-scoped, not event-scoped.

```ts
interface CommandHookContext<TInput = unknown, TResult = unknown> {
  command_id: string;
  command: string;
  phase: "before" | "after" | "failed";
  occurred_at: string;
  source: {
    layer: "desktop" | "cli" | "control_plane" | "plugin";
    component: string;
  };
  workspace_id?: string;
  project_id?: string;
  correlation_id?: string;
  input?: TInput;
  result?: TResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

## Naming Rules

### Commands

- Commands are imperative and use `<domain>.<verb>`
- Examples:
  - `workspace.start`
  - `workspace.stop`
  - `workspace.destroy`
  - `terminal.create`
  - `terminal.kill`
  - `git.commit`

### Events

- Events are facts and use `<domain>.<fact>`
- Prefer past-tense outcomes or state-change facts
- Examples:
  - `workspace.created`
  - `workspace.status_changed`
  - `workspace.renamed`
  - `service.status_changed`
  - `terminal.created`
  - `terminal.status_changed`
  - `terminal.renamed`
  - `terminal.removed`
  - `terminal.harness_prompt_submitted`
  - `terminal.harness_turn_completed`

### Hooks

- Hooks are phases of a command, not standalone domain events
- Hook phase names are fixed:
  - `before`
  - `after`
  - `failed`

## Delivery Rules

1. Publish fact events after the authoritative state change or observation is committed.
2. Preserve causal ordering within a single aggregate where practical:
   - per `workspace_id`
   - per `terminal_id`
   - per `service_name` within a workspace
3. Do not promise one global total order across the whole app.
4. Use `correlation_id` and `causation_id` to connect command execution to resulting events.
5. Consumers must tolerate duplicate delivery and should dedupe by `id` where replay or fanout paths exist.

## Harness Turn Semantics

Harness turn facts are semantic lifecycle events, not transport streams.

1. `terminal.harness_prompt_submitted` means the harness accepted a submitted user prompt as a turn boundary.
2. `terminal.harness_prompt_submitted` is emitted once per submitted turn, not per keystroke, PTY input chunk, or renderer-local input change.
3. `terminal.harness_prompt_submitted` must be emitted by authoritative provider/runtime/backend code after the submit boundary is known.
4. `terminal.harness_turn_completed` is a separate fact that means the harness finished responding for a turn.
5. Auto-title logic that wants immediate first-prompt titles should listen to `terminal.harness_prompt_submitted`, not `terminal.harness_turn_completed`.
6. Until `terminal.harness_prompt_submitted` exists, the backend may temporarily recover the first prompt from the authoritative harness session log when the first `terminal.harness_turn_completed` fact arrives.
7. When `terminal.label_origin == default` and `workspace.name_origin == default`, the first submitted harness prompt may trigger title derivation followed by `terminal.renamed` and `workspace.renamed`.

Suggested normalized payload for `terminal.harness_prompt_submitted`:

```ts
interface TerminalHarnessPromptSubmittedPayload {
  terminal_id: string;
  workspace_id: string;
  harness_provider?: string;
  harness_session_id?: string;
  prompt_text: string;
  turn_id?: string;
}
```

## What Belongs on the Kernel

Use the kernel for:
1. Lifecycle state transitions
2. Semantic runtime milestones
3. Rename/title changes that affect shared state
4. Audit-worthy or metric-worthy domain facts
5. Future artifact and agent session facts

Do not use the kernel for:
1. PTY output chunks
2. Terminal input data
3. High-frequency renderer sync
4. Raw setup stdout/stderr lines
5. Bulk attachment/artifact bytes

Those use dedicated transports. The kernel may still publish coarse facts about them, for example:
- `setup.step_started`
- `setup.step_completed`
- `setup.step_failed`
- `artifact.published`

## Hook Rules

1. Hooks exist to observe or extend command execution, not to replace the command model.
2. `before` hooks are the only phase that may block command execution.
3. Blocking hooks must stay trusted and Lifecycle-owned until there is an explicit plugin permission model.
4. Third-party plugin hooks should default to non-blocking observation until trust, sandboxing, and failure isolation are designed.
5. Hook failures must surface typed errors rather than silent fallback behavior.

## Consumer Rules

Expected kernel consumers include:
1. Desktop reactive store/query reduction
2. Notifications and attention UX
3. Diagnostics and metrics
4. Audit/activity feeds
5. Future plugin subscriptions

Consumers may derive view state, but they must not rewrite authoritative lifecycle history.

## Initial Kernel Domains

The first normalized domains should be:
1. `workspace`
2. `service`
3. `terminal`
4. `project`
5. `git`

Later domains may add:
1. `agent`
2. `artifact`
3. `preview`
4. `activity`
5. `usage`

## Current Lifecycle Mapping

Current runtime signals should normalize into kernel events along these lines:

| Current concept | Kernel event |
| --- | --- |
| workspace status change | `workspace.status_changed` |
| workspace rename | `workspace.renamed` |
| service status change | `service.status_changed` |
| terminal create | `terminal.created` |
| terminal rename | `terminal.renamed` |
| terminal status change | `terminal.status_changed` |
| terminal removal | `terminal.removed` |
| harness prompt submission | `terminal.harness_prompt_submitted` |
| harness response completion | `terminal.harness_turn_completed` |

The desktop store may continue to use narrower in-process event types, but those should be adapters over this kernel, not an independent contract.

## Git Opportunity

The current desktop git Changes flow still depends on status polling plus query invalidation to keep sidebar state and diff surfaces aligned. The stale-diff edge cases in the unified Changes tab are a concrete signal that `git` should graduate from "initial domain" to explicit typed fact events.

Useful future facts include:
1. `git.status_changed`
2. `git.head_changed`
3. `git.index_changed`

Those events should describe repository-level facts after authoritative git mutations such as stage, unstage, commit, checkout, and refresh-worthy file-state transitions. That would let desktop consumers invalidate status and patch queries directly instead of inferring reloads from polling snapshots or UI-local focus changes.

## Implementation Direction

1. Create one event registry that owns event names, versions, and payload schemas.
2. Route provider-owned lifecycle publishers through that registry before fanout.
3. Make the desktop store a subscriber to the kernel rather than the primary fan-in surface.
4. Add command hook registration separately from event subscription.
5. Keep stream transports explicit and outside the kernel.

## Technical Plan

This is the implementation sequence for making the kernel part of the system's default path rather than an optional side abstraction.

### Phase 1: Kernel Spine

Goal: one canonical publish/subscribe surface exists.

Scope:
1. Add shared event name and envelope definitions in `packages/contracts`.
2. Add a backend kernel module under the desktop runtime, for example `apps/desktop/src-tauri/src/platform/events/*`.
3. Add one `publish_event(...)` path instead of scattered raw lifecycle `app.emit(...)` calls for new work.
4. Add one desktop-facing subscription adapter that can fan out normalized kernel events to current consumers.

Suggested landing zones:
- `packages/contracts/src/events.ts`
- `apps/desktop/src-tauri/src/platform/events/mod.rs`
- `apps/desktop/src-tauri/src/platform/events/registry.rs`
- `apps/desktop/src-tauri/src/platform/events/hooks.rs`
- `apps/desktop/src/features/events/api.ts`

### Phase 2: Producer Migration

Goal: authoritative lifecycle publishers emit through the kernel first.

Scope:
1. Migrate workspace lifecycle publishers:
   - create
   - start
   - stop
   - rename
   - failure/status transitions
2. Migrate service lifecycle publishers:
   - status changes
   - health/failure transitions
3. Migrate terminal lifecycle publishers:
   - create
   - status changes
   - rename
   - removal
   - semantic harness prompt submission
   - semantic completion events such as harness turn completion
4. Keep temporary adapters for existing Tauri event names only where needed for rollout.

### Phase 3: Consumer Migration

Goal: app consumers use the kernel path, not ad hoc domain-specific subscriptions.

Scope:
1. Refactor the desktop store fan-in in `apps/desktop/src/store/source.ts` to subscribe through one kernel adapter.
2. Keep feature hooks reducer-driven, but make them consumers of normalized kernel events.
3. Route diagnostics, attention/notification UX, and future activity feeds through kernel consumers rather than direct provider listeners.

### Phase 4: Command Hook Runner

Goal: command interception becomes explicit and trusted.

Scope:
1. Introduce a command runner wrapper around imperative lifecycle operations.
2. Support `before|after|failed` phases for trusted Lifecycle-owned hooks only.
3. Attach `command_id`, `correlation_id`, and `causation_id` so command execution and published facts stay traceable.
4. Keep plugin-facing hooks out of scope until there is a trust and permission model.

### Phase 5: Guardrails

Goal: new work naturally uses the kernel.

Scope:
1. Add contract tests for event names, payload shapes, and per-aggregate ordering assumptions.
2. Add integration tests for one workspace path and one terminal path going through the kernel.
3. Add a lightweight code-review or lint guard against new raw domain lifecycle `emit` calls outside the kernel module.
4. Update docs when new domains join the registry.

## Definition of Done

This effort is integrated into system DNA when:

1. New lifecycle work publishes facts through the kernel by default.
2. The desktop store is a kernel consumer, not the primary lifecycle event definition surface.
3. Commands and hooks are explicit and separate from fact events.
4. PTY/log streams still use dedicated transports and have not leaked into the generic kernel.
5. Event names and payload shapes are centrally registered and tested.

## Deferred Scope

This plan does not include:

1. third-party plugin host/runtime
2. extension permissions or sandboxing
3. marketplace or activation-event model
4. user-installed hook scripts
5. cross-process extension isolation

Those build on top of the internal kernel after the kernel is the authoritative path.
