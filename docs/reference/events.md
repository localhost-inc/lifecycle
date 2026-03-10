# Event Foundation

Canonical contract for Lifecycle's internal event foundation.

This document defines the forward-looking v1 model for fact events and command hooks. Commands, fact events, streams, and derived projections are separate concepts. The rest of the product should build on this model rather than inventing transport-local event dialects.

## Purpose

Use this contract for:
1. Typed fact events that describe authoritative state changes or notable environment outcomes
2. Command hooks around imperative operations
3. Normalization rules between provider and environment signals and Lifecycle domain facts

Do not use this contract for:
1. PTY byte streams
2. Terminal input transport
3. Line-by-line log streaming
4. Large artifact transfer
5. Ad hoc UI-local notifications

### Design Goals

1. Keep one canonical event vocabulary across local environment, cloud environment, desktop, CLI, and future plugin consumers.
2. Preserve a clear authority boundary: provider and environment code publish facts, while UI/query/projection code consumes them.
3. Keep facts semantic and compact so they remain portable across transports and storage layers.
4. Make missed delivery recoverable through authoritative refetch rather than forcing every consumer to depend on a perfect event stream.
5. Leave room for future domains without redefining the event model again.

### Non-Goals

1. This is not a full event-sourcing requirement for the whole product.
2. This does not replace imperative commands or their typed results.
3. This does not carry high-volume streams such as PTY output, setup logs, or artifact bytes.
4. This does not define consumer-specific projection schemas such as activity rows, audit records, or metrics tables.
5. This does not freeze transport-local event names that exist only for rollout or adapter compatibility.

## Mental Model

Lifecycle separates five concerns:

1. `commands`
   - imperative requests such as `workspace.start`, `workspace.destroy`, `terminal.create`
2. `fact events`
   - statements about what already happened, such as `environment.status_changed` or `git.head_changed`
3. `streams`
   - ordered transport channels for high-volume data such as PTY output or log output
4. `hooks`
   - command-scoped observation points with phases `before`, `after`, and `failed`
5. `projections`
   - derived read models such as activity feeds, audit logs, metrics, usage records, or UI query caches

These are intentionally different layers.

- Commands ask the system to do work.
- Fact events describe what the authoritative system committed or observed.
- Streams move transport-heavy data that should never be treated as coarse lifecycle facts.
- Hooks let Lifecycle-owned modules observe or extend command execution.
- Projections consume commands and facts; they do not define them.

## Workspace vs Environment Event Boundary

Fact domains should follow the thing that actually changed.

1. `workspace.*`
   - durable workspace lifecycle and shared metadata
   - examples: `workspace.created`, `workspace.renamed`, future `workspace.archived`
2. `environment.*`
   - execution-state transitions for the singleton environment attached to a workspace
   - examples: future `environment.status_changed`
3. `service.*`
   - per-service runtime changes inside that environment

Implementation note:

1. Current local rollout still emits `workspace.status_changed` because environment state is still stored on `workspace.status`.
2. M4 should migrate that execution-state fact to `environment.status_changed` rather than deepening long-lived dependencies on `workspace.status_changed`.
3. Until that migration lands, consumers should treat `workspace.status_changed` as an environment-state fact in disguise, not as durable workspace lifecycle.

## Authority Boundary

1. Provider/runtime code is authoritative for workspace, service, terminal, and git facts.
2. The control plane may enrich, persist, or project those facts, but it must not let UI-local state become authoritative lifecycle state.
3. React query/cache code, Tauri listeners, Convex reactive queries, CLI output, and future transports are delivery or subscription surfaces, not the canonical event model.
4. Activity, audit, and usage records are downstream projections over facts and command outcomes. They are not the internal event foundation itself.
5. Provider-specific signals must be normalized before they reach app consumers.
6. If a consumer misses an event or cannot reduce it safely, the recovery path is to refetch authoritative state rather than infer history from local assumptions.

## Canonical Event Envelope

Canonical field names use `snake_case` at the foundation boundary so the shape stays portable across Rust, TypeScript, persistence, and remote transport.

```ts
interface LifecycleEvent<TPayload = unknown> {
  id: string;
  kind: string;
  version: number;
  occurred_at: string;
  source: {
    layer: "provider" | "control_plane" | "desktop" | "cli" | "system";
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

### Envelope Semantics

| Field | Required | Rules |
| --- | --- | --- |
| `id` | yes | Opaque globally unique identifier for this fact delivery identity. Replays and fanout copies of the same fact reuse the same `id`. |
| `kind` | yes | Stable canonical fact name such as `environment.status_changed`. |
| `version` | yes | Positive integer payload schema version for this `kind`. Start at `1`. |
| `occurred_at` | yes | RFC 3339 / ISO-8601 UTC timestamp for when the authoritative fact was committed or observed. |
| `source.layer` | yes | The emitting layer at the point the fact entered the canonical foundation. |
| `source.component` | yes | Stable publisher identifier within that layer, for example a provider module or runtime subsystem. |
| `source.runtime` | yes | Authority location for the fact: `local`, `cloud`, or `system`. |
| `source.provider` | no | Stable provider identifier when the fact crossed a provider boundary and that identity matters. |
| `workspace_id` | no | Required for all workspace-, service-, terminal-, and workspace-scoped git facts. |
| `project_id` | no | Include when the authoritative publisher already knows the project scope without extra lookup. |
| `terminal_id` | no | Required for terminal facts. |
| `service_name` | no | Required for service facts. |
| `correlation_id` | no | Shared trace id that ties one command/request flow to resulting facts. |
| `causation_id` | no | Immediate parent trigger for this fact, such as the command attempt id or a prior fact in the same chain. |
| `payload` | yes | Semantic payload whose schema is determined by `kind` and `version`. |

### Envelope Invariants

1. `kind` plus `version` defines the payload contract; consumers must not infer payload shape from transport or publisher.
2. Envelope scope identifiers are routing keys. Payloads should not duplicate them unless the payload genuinely needs both source and target identities, such as `workspace.forked`.
3. Omit optional scope fields instead of sending empty strings.
4. Facts must not carry secrets, credential material, raw PTY bytes, large diffs, or whole log streams.
5. If a payload repeats an identifier that also exists in the envelope, the values must match exactly.

## Canonical Command Hook Context

Hooks are command-scoped, not event-scoped.

```ts
interface CommandHookContext<TInput = unknown, TResult = unknown> {
  command_id: string;
  command: string;
  phase: "before" | "after" | "failed";
  occurred_at: string;
  source: {
    layer: "desktop" | "cli" | "control_plane" | "system";
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

### Hook Context Rules

1. `command_id` is unique per command attempt, not per command name.
2. `before` runs after input has been parsed into a typed command boundary and before the authoritative side effect begins.
3. `after` runs after the command produced its synchronous result; related fact events may be emitted before or after the hook depending on publisher internals, but they must share the same `correlation_id` when they belong to the same command flow.
4. `failed` runs only when the command attempt produced a typed failure. Silent fallback is forbidden.
5. Hooks are never a substitute for fact events. They describe command execution phases, while facts describe committed outcomes.

## Naming and Versioning

### Commands

- Commands are imperative and use `<domain>.<verb>`
- Examples:
  - `workspace.start`
  - `workspace.stop`
  - `workspace.destroy`
  - `terminal.create`
  - `terminal.kill`
  - `git.commit`

### Fact Events

- Fact events use `<domain>.<fact>`
- Use lowercase dotted names with snake_case segments
- Prefer past-tense outcomes or explicit state-change facts
- Prefer specific names such as `created`, `destroyed`, `renamed`, `forked`, or `status_changed`
- Avoid generic names such as `updated`
- Transport-local prefixes such as `tauri.*`, `convex.*`, or `query.*` do not belong in the canonical contract
- Examples:
  - `workspace.created`
  - `environment.status_changed`
  - `service.status_changed`
  - `terminal.renamed`
  - `git.head_changed`

### Hooks

- Hook phase names are fixed:
  - `before`
  - `after`
  - `failed`

### Versioning

1. `kind` names are stable identifiers for the semantic fact.
2. Breaking payload changes increment `version`.
3. Additive payload fields keep the existing `kind` and `version`.
4. Consumers must ignore unknown additive fields.
5. Transport-specific aliases do not belong in the canonical contract.

## Publication and Normalization Rules

1. Publish fact events after the authoritative state change or observation is committed.
2. Normalize provider-specific signals into canonical domain names and canonical enums before publication.
3. Do not leak transient provider-only statuses that are not part of the canonical state machines in [state-machines.md](./state-machines.md).
4. A single command may emit zero, one, or many facts.
5. A single real-world action that touches multiple aggregates should emit multiple facts, one per aggregate, rather than one overloaded catch-all fact.
6. Facts may be derived from authoritative provider/runtime logs when the log is the durable source of truth for that semantic milestone, such as harness turn completion.
7. If a provider cannot produce a stable semantic fact, do not publish an approximate UI-local substitute. Keep the capability absent until it can be normalized correctly.
8. Publishers should include `correlation_id` on command-caused facts and set `causation_id` to the immediate parent trigger when available.

### Normalization Examples

| Raw source signal | Canonical output | Notes |
| --- | --- | --- |
| Workspace row persisted with a new environment status | `workspace.status_changed` | In the current rollout this is the authoritative environment-state fact because execution state still lives on `workspace.status`. |
| Manual or generated rename committed to shared state | `workspace.renamed` or `terminal.renamed` | UI-only rename draft changes do not publish facts. |
| Terminal PTY output chunk | none | This is a stream attachment, not a fact event. |
| Harness accepts a prompt boundary | `terminal.harness_prompt_submitted` | Emitted once per accepted turn, never per keystroke. |
| Harness provider log reports turn completion | `terminal.harness_turn_completed` | The publisher may synthesize this from authoritative session logs. |
| Git commit completes successfully | `git.head_changed`, `git.log_changed`, `git.status_changed` | Multiple repository facts may result from one command. |
| Activity row appended to an org feed | none | Activity is a projection over facts, not a source fact itself. |

## Delivery, Ordering, Replay, and Dedupe

1. Preserve causal ordering within a single aggregate where practical:
   - per `workspace_id`
   - per `terminal_id`
   - per `service_name` within a workspace
   - per workspace-scoped git repository
2. Do not promise one global total order across the whole product.
3. Replay may happen on reconnect, query cache bootstrap, subscription fanout, or future remote attach flows.
4. Consumers must tolerate duplicate delivery and should dedupe by `id`.
5. Consumers must be idempotent. Applying the same fact twice must not corrupt derived state.
6. If a consumer encounters an unknown `kind`, unsupported `version`, or a suspected gap, the correct fallback is authoritative refetch, not best-effort guesswork.
7. The event foundation is a semantic notification layer. It is not, by itself, a promise of durable historical replay forever.
8. Durable retention, searchability, and compliance history belong to projections and audit stores, not necessarily to every event transport.

## Payload Design Rules

1. Payload fields must use canonical nouns and typed enums from [state-machines.md](./state-machines.md), [errors.md](./errors.md), and shared contracts.
2. Keep payloads semantic and compact. Include what changed and what downstream consumers need to reason about that change.
3. Prefer explicit before/after fields for state transitions instead of one ambiguous `state`.
4. Created facts may include enough metadata for consumer upserts, but they should not embed arbitrarily large nested snapshots.
5. Human-readable summaries, display strings, and analytics rollups belong in projections unless they are themselves authoritative shared state, such as `workspace.name` or `terminal.label`.
6. Do not include raw terminal output, setup log lines, unified diffs, attachment bytes, or secret values.
7. Optional fields should mean "not known" or "not applicable", not "empty placeholder".

## Domain Catalog

The first concrete catalog for v1 is `workspace`, `environment`, `service`, `terminal`, and `git`.

### Shared Helper Types

Payload enums must stay aligned with [state-machines.md](./state-machines.md), [errors.md](./errors.md), [workspace.ts](../../packages/contracts/src/workspace.ts), and [terminal.ts](../../packages/contracts/src/terminal.ts).

```ts
type NameOrigin = "default" | "generated" | "manual";
type LaunchType = "shell" | "harness" | "preset" | "command";
```

### Workspace Facts

Workspace facts describe durable workspace identity, lifecycle, and shared naming.

| Type | Meaning |
| --- | --- |
| `workspace.created` | A workspace record and durable shell were created. |
| `workspace.forked` | A workspace was created by forking another workspace across execution boundaries. |
| `workspace.archived` | The durable workspace was archived. |
| `workspace.unarchived` | The durable workspace returned to active state. |
| `workspace.renamed` | The shared workspace title changed. |
| `workspace.destroyed` | The workspace was destroyed and should be treated as terminal. |

```ts
interface WorkspaceCreatedPayload {
  name: string;
  name_origin: NameOrigin;
  mode: WorkspaceMode;
  source_ref: string;
  source_workspace_id?: string;
  archived_at?: string;
  environment_status?: WorkspaceStatus;
}

interface WorkspaceForkedPayload {
  source_workspace_id: string;
  target_workspace_id: string;
  source_mode: WorkspaceMode;
  target_mode: WorkspaceMode;
  included_uncommitted: boolean;
  source_destroyed?: boolean;
}

interface WorkspaceArchivedPayload {
  archived_at: string;
  previous_environment_status?: WorkspaceStatus;
}

interface WorkspaceUnarchivedPayload {
  previous_archived_at: string;
}

interface WorkspaceRenamedPayload {
  name: string;
  name_origin: NameOrigin;
  worktree_path?: string;
}

interface WorkspaceDestroyedPayload {
  archived_at?: string;
  previous_environment_status?: WorkspaceStatus;
}
```

### Environment Facts

Environment facts describe execution-state transitions for the singleton environment attached to a workspace.

| Type | Meaning |
| --- | --- |
| `workspace.status_changed` | The authoritative workspace environment state machine advanced in the current rollout. |

```ts
interface WorkspaceStatusChangedPayload {
  status: WorkspaceStatus;
  failure_reason?: WorkspaceFailureReason | null;
}
```

Current rollout note:

1. Consumers should treat `workspace.status_changed` as an environment-state fact, not as durable workspace-lifecycle.
2. A future workspace/environment contract split may introduce `environment.status_changed`, but the current shipped contract is `workspace.status_changed`.

### Service Facts

Service facts describe workspace service runtime state and exposure policy. Preview route lifecycle remains a deferred `preview` domain concern even when exposure changes have preview side effects.

| Type | Meaning |
| --- | --- |
| `service.status_changed` | A workspace service changed runtime status. |
| `service.exposure_changed` | A workspace service changed sharing or exposure policy. |

```ts
interface ServiceStatusChangedPayload {
  status: WorkspaceServiceStatus;
  previous_status?: WorkspaceServiceStatus;
  status_reason?: WorkspaceServiceStatusReason;
}

interface ServiceExposureChangedPayload {
  exposure: WorkspaceServiceExposure;
  previous_exposure?: WorkspaceServiceExposure;
}
```

### Terminal Facts

Terminal facts describe terminal lifecycle, naming, and harness turn boundaries. They do not carry PTY stream bytes.

| Type | Meaning |
| --- | --- |
| `terminal.created` | A terminal session was created. |
| `terminal.status_changed` | The authoritative terminal lifecycle changed. |
| `terminal.renamed` | The shared terminal label changed. |
| `terminal.removed` | The terminal record was removed from shared state. |
| `terminal.harness_prompt_submitted` | A harness accepted a submitted prompt as a turn boundary. |
| `terminal.harness_turn_completed` | A harness finished responding for a turn. |

```ts
interface TerminalCreatedPayload {
  launch_type: LaunchType;
  status: TerminalStatus;
  label: string;
  label_origin: NameOrigin;
  harness_provider?: string;
  harness_session_id?: string;
}

interface TerminalStatusChangedPayload {
  status: TerminalStatus;
  previous_status?: TerminalStatus;
  failure_reason?: TerminalFailureReason;
  exit_code?: number;
}

interface TerminalRenamedPayload {
  label: string;
  label_origin: NameOrigin;
}

interface TerminalRemovedPayload {
  previous_status?: TerminalStatus;
}

interface TerminalHarnessPromptSubmittedPayload {
  prompt_text: string;
  harness_provider?: string;
  harness_session_id?: string;
  turn_id?: string;
}

interface TerminalHarnessTurnCompletedPayload {
  harness_provider?: string;
  harness_session_id?: string;
  turn_id?: string;
  completion_key?: string;
}
```

`completion_key` is a provider-normalized dedupe token for repeated observation of the same semantic turn completion.

### Git Facts

Git facts are repository-level invalidation points scoped to a workspace. They do not carry patch bytes, per-file diffs, or whole log payloads.

| Type | Meaning |
| --- | --- |
| `git.status_changed` | The authoritative working tree or index summary changed. Consumers should refetch status and current changes patch. |
| `git.head_changed` | The repository head or branch position changed. Consumers should refetch status, history, and commit-scoped views. |
| `git.log_changed` | Visible history may have changed. Consumers should refetch git log views. |

```ts
interface GitStatusChangedPayload {
  branch?: string;
  head_sha?: string;
  upstream?: string;
}

interface GitHeadChangedPayload {
  branch?: string;
  head_sha?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

interface GitLogChangedPayload {
  branch?: string;
  head_sha?: string;
}
```

## Harness Semantics

Harness turn facts are semantic lifecycle facts, not transport streams.

1. `terminal.harness_prompt_submitted` is emitted once per accepted prompt or turn.
2. It is never emitted per keystroke, PTY input chunk, or renderer-local draft change.
3. Auto-title logic should listen to `terminal.harness_prompt_submitted`, not `terminal.harness_turn_completed`.
4. `terminal.harness_turn_completed` means a turn response finished, not that the PTY exited.
5. Publishers may dedupe repeated completion detection for the same turn by `completion_key`.
6. When `terminal.label_origin == default` and `workspace.name_origin == default`, the first submitted harness prompt may trigger title derivation followed by `terminal.renamed` and `workspace.renamed`.

## Command-to-Fact Examples

These examples are illustrative sequencing rules, not exhaustive transport traces.

### `workspace.start`

1. Hook `before` fires for `workspace.start`.
2. Publisher commits `workspace.status_changed` with `status=starting`.
3. Publisher emits zero or more `service.status_changed` facts as services start and settle.
4. Publisher commits `workspace.status_changed` with `status=active` on success, or `status=idle` plus `failure_reason` on failure.
5. Hook `after` or `failed` fires for the command attempt.

### `terminal.create`

1. Hook `before` fires for `terminal.create`.
2. Publisher commits `terminal.created`.
3. Any PTY attach or replay stream starts on a separate stream transport, not as fact events.
4. Later process lifecycle changes publish `terminal.status_changed`.

### `git.commit`

1. Hook `before` fires for `git.commit`.
2. Provider commits the repository mutation.
3. Publisher emits `git.head_changed`, `git.log_changed`, and `git.status_changed` as needed for the new repository state.
4. Hook `after` fires with the typed commit result.

### First Harness Prompt

1. Publisher emits `terminal.harness_prompt_submitted`.
2. If default titles are still in effect, publisher may emit `terminal.renamed` and `workspace.renamed`.
3. Later, when the harness completes the turn, publisher emits `terminal.harness_turn_completed`.

## Streams and Projections

### Streams

Use dedicated transports for:
1. PTY output
2. Terminal input
3. Setup or job log lines
4. Large artifact or attachment bytes

The event foundation may still publish coarse semantic facts about stream-backed workflows, but it does not carry the stream itself.

### Projections

Activity feeds, audit logs, metrics, and usage records are projections over canonical facts and command outcomes.

1. Projection records may persist selected event metadata such as `event_type`, `workspace_id`, `actor`, and human-readable summaries.
2. Projection schemas are consumer-specific and may denormalize data for queryability.
3. Projection record types must not replace the canonical fact event definitions in this document.

## Hook Rules

1. Hooks exist to observe or extend command execution, not to replace the command model.
2. `before` hooks are the only phase that may block command execution.
3. Blocking hooks stay Lifecycle-owned until an explicit trust and permission model exists.
4. Hook failures must surface typed errors rather than silent fallback behavior.
5. Hooks and fact events are complementary surfaces: hooks describe command execution phases, while fact events describe committed outcomes.

## Consumer Rules

Expected consumers include:
1. Desktop reactive query cache and reducer layer
2. Notifications and attention UX
3. Diagnostics and metrics
4. Activity, audit, and usage projections
5. Future plugin subscriptions

Consumers may derive view state, but they must not redefine authoritative lifecycle history.

Consumer-specific rules:
1. If a consumer sees an unsupported `version`, it should fail closed for that fact and refetch authoritative state.
2. Consumers may maintain local cursors or reduction checkpoints, but those checkpoints are not canonical lifecycle history.
3. Consumer-specific display labels, summaries, and badge logic should be derived from facts, not pushed back into the canonical foundation as new fact types.

## Anti-Patterns

Do not introduce:
1. Catch-all facts such as `workspace.updated`
2. Fact types for PTY output, raw log lines, or attachment bytes
3. Projection rows such as `activity.created` as a replacement for canonical facts
4. UI-local event names as cross-layer contracts
5. Silent provider-specific fallback facts when a stable canonical fact does not yet exist

## Deferred Domains

The foundation intentionally reserves additional domains for later work:
1. `preview`
2. `agent`
3. `artifact`
4. `activity`
5. `usage`
6. `repository`

When those domains are introduced, they should follow this document's naming, envelope, ordering, and projection rules instead of creating parallel models.
