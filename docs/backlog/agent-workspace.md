# Backlog: Lifecycle-native agent workspace

> Status: backlog
> Former milestone concept deferred from the active delivery sequence
> Introduces: `agent_session`, `agent_message`, `agent_message_part`, `agent_attachment`, `agent_tool_call`, `agent_task`, `agent_approval_request`, `agent_artifact`, center-panel agent UI, AI SDK `useChat` integration, structured tool execution, local/remote portable persistence
> Tracker: high-level backlog reference lives in [`docs/plan.md`](../plan.md). This document preserves the deferred implementation concept.

## Goal

The workspace center panel becomes a Lifecycle-native agent workspace instead of a terminal passthrough. A user can prompt an agent, attach screenshots or files, follow structured progress, inspect tasks and artifacts, answer approval requests, and still open a raw shell when needed. The interaction model, persistence contract, and tool semantics must work for both local and future cloud workspaces without branching the UI around provider-specific transcript shapes.

## What You Build

1. A center-panel Lifecycle agent workspace with conversation, attachments, task state, approvals, artifacts, and contextual workspace metadata.
2. A `useChat`-backed interaction surface that uses Lifecycle-owned transport and persistence rather than provider-native UI state.
3. A normalized agent execution boundary that can support a Lifecycle-native execution path and, when explicitly needed, external harness-backed sessions without copying their TUIs.
4. A structured tool layer for filesystem, search, shell, git, and workspace-context operations.
5. A SQLite schema renovation for append-friendly agent history plus queryable projections for attachments, tools, tasks, approvals, artifacts, and replay.
6. Typed `agent.*` fact streaming distinct from PTY byte streaming.
7. Local-first authority rules that keep local sessions portable to future remote/cloud execution without redesigning the desktop query layer.
8. A desktop state model that is session-centric rather than terminal-centric for the main agent surface.

## Non-Goals (Explicit)

1. No attempt to faithfully emulate every terminal-based coding agent UI inside the center panel.
2. No removal of raw shell terminals; shell access remains a first-class fallback.
3. No requirement that local and remote sessions share the exact same execution implementation in this milestone; they must share the same domain model, transport contract, and UI contract.
4. No standalone model gateway product surface in this milestone.
5. No parsing of raw PTY bytes into tasks, approvals, or artifacts.
6. No provider SDK calls directly from React components.
7. No requirement to reach feature parity with Claude Code or Codex center-panel behavior before this backlog item ships.

## Architecture Overview

### Product split

1. Lifecycle owns the primary agent workspace UI, session model, attachment model, task model, approvals, artifacts, and persistence.
2. Terminal sessions remain available as shell/debug surfaces, but are not the source of truth for the center panel.
3. `workspace` remains the root execution noun. The agent domain is namespaced as `agent_*` at database, API, and fact-event boundaries and always references `workspace_id`.
4. The center panel should sit on the shared workspace-surface contract: provider-backed runtime tabs plus client-owned document tabs.

### Core data flow

```text
user input
  -> AgentWorkspaceSurface
  -> useChat + LifecycleChatTransport
  -> agent_send_prompt(session_id, message, attachment_ids)
  -> runtime adapter
  -> model step / tool call / approval / artifact publish
  -> persist agent_* rows
  -> emit typed `agent.*` fact events
  -> QueryClient reducers
  -> center panel, attachment previews, task pane, approval cards, artifact pane
```

### Design calls

1. `useChat` is a UI edge helper, not the authoritative source of session history.
2. The authoritative record for replay is persisted `agent_*` state in SQLite for `workspace.mode=local`.
3. Runtime adapters normalize provider-specific signals into canonical `agent.*` facts before they touch query state or UI code.
4. Attachments are first-class inputs distinct from artifacts. Screenshots and files should not be smuggled through ad-hoc file path strings.
5. Structured tools are the default path for filesystem and workspace interaction. Shell remains available, but it is not the only tool.
6. The UI must render from normalized queries, not from provider transcripts or terminal attachment state.
7. Compatibility with Claude/Codex should be framed as backend interoperability, not UI-parity work.
8. AI SDK should supply loop mechanics and UI helpers, not become the source of truth for Lifecycle persistence or product semantics.

## Frontend Architecture Contract

### `useChat` role

1. Use AI SDK UI `useChat` in the center panel for:
   - input draft state
   - multi-part message composition with attachment references
   - submit / retry / abort actions
   - incremental assistant message UX
   - tool invocation rendering hooks where useful
2. Do not treat `useChat`'s internal message array as the durable source of truth.
3. Attachment drafts should be Lifecycle-owned composer state rather than ephemeral DOM file handles.
4. At the AI SDK UI boundary, attachments should be hydrated as message `file` parts because that is the native `useChat` / `UIMessage` attachment shape.
5. Hydrate UI messages from persisted `agent_message`, `agent_message_part`, and `agent_attachment` records via a Lifecycle-owned mapper.
6. `agent_attachment` remains the Lifecycle persistence contract underneath the AI SDK-facing `file` part shape.
7. Implement a custom `LifecycleChatTransport`:
   - local mode submits prompts through Tauri commands
   - future cloud mode can swap to HTTP/SSE/WebSocket transport without changing the surface API
8. The React tree should tolerate app reload by rebuilding from persisted queries even if `useChat` state is empty on first mount.

### AI SDK UI mapping rules

1. At the UI boundary, screenshots and files should be represented as AI SDK `file` parts because that is the native `UIMessage` attachment model.
2. Persisted `agent_attachment` records must be mapped into AI SDK `file` parts for rendering, not stored only as opaque provider payloads.
3. `convertToModelMessages()` should be treated as the handoff into model-facing messages, not as the Lifecycle persistence format.
4. Do not depend on AI SDK's browser-side implicit `FileList` conversion as the long-term persistence strategy; Lifecycle-owned attachment import should remain authoritative.

### Attachment input contract

1. Attachments are first-class user inputs, not a subtype of output artifact.
2. The composer must support:
   - file picker
   - drag and drop
   - paste from clipboard
   - screenshot capture flow
3. Attachment creation must happen through Lifecycle-owned APIs before prompt submission so the runtime receives stable attachment ids rather than raw browser `File` objects.
4. Image attachments must render preview thumbnails in the composer and transcript.
5. The primary v1 attachment target is screenshots and images, but the metadata model should allow arbitrary file attachments later.
6. Attachment bytes must be fetched by a Lifecycle attachment handle, not by exposing raw local filesystem paths to React.

### Desktop module layout

1. Add `apps/desktop/src/features/agents/*` as the home for the new center-panel feature.
2. Expected modules:
   - `api.ts`: invoke wrappers and subscription helpers
   - `hooks.ts`: query descriptors and hooks
   - `message-mapper.ts`: persisted record -> UI message mapping
   - `components/*`: center panel, composer, attachment tray, screenshot action, task pane, approval cards, artifact pane, session switcher
   - `transport.ts`: `LifecycleChatTransport`
3. `WorkspaceLayout` should compose `AgentWorkspaceSurface` as the main center surface and keep terminal entry points visible but secondary through the shared workspace-surface tab model.
4. The query layer should extend the existing `QueryClient` pattern rather than introducing a second query/cache system.

### Surface shape

1. Center panel:
   - conversation transcript
   - attachment previews in messages
   - streaming assistant output
   - tool activity blocks
   - composer with attachment tray and screenshot action
2. Right rail / side surface:
   - active tasks
   - pending approvals
   - recent attachments
   - recent artifacts
   - workspace metadata and service status
3. Secondary entry points:
   - open raw terminal
   - jump to existing terminal tabs
   - inspect workspace services/previews

## Runtime Architecture Contract

### Runtime adapter boundary

1. The center-panel UI consumes normalized `agent.*` facts, not PTY escape sequences.
2. Define a Lifecycle-owned runtime interface for the main agent surface:

```typescript
interface AgentRuntimeAdapter {
  createAttachment(input): Promise<{ attachmentId: string }>;
  createSession(input): Promise<{ sessionId: string }>;
  sendPrompt(input): Promise<void>;
  cancelSession(sessionId: string): Promise<void>;
  resolveApproval(input): Promise<void>;
  subscribe(workspaceId: string, listener: (event: AgentEvent) => void): Promise<() => void>;
}
```

3. The runtime interface is Lifecycle-owned even if the backing executor changes later.
4. Local native runtime and compatibility adapters must both emit the same conceptual `agent.*` fact families, following the runtime event foundation contract in [`.skills/reference--runtime/SKILL.md`](../../.skills/reference--runtime/SKILL.md):
   - session lifecycle and metadata facts
   - message and message-part facts
   - attachment facts
   - tool-call facts
   - task facts
   - approval-request facts
   - artifact publication facts

### Native runtime implementation stance

1. The first native runtime path should be built around AI SDK Core `ToolLoopAgent`, not a custom loop from scratch.
2. Drop to lower-level AI SDK generation primitives only when the product needs workflow control that `ToolLoopAgent` cannot express cleanly.
3. Tool execution, approvals, and persistence integration points should be Lifecycle-owned wrappers around AI SDK tools rather than provider-owned side effects.
4. Experimental AI SDK callbacks may be used for observability, but correctness-critical persistence should rely on stable tool wrappers and completion boundaries.

### Provider strategy

1. This backlog item should still ship a strong Lifecycle-native agent workspace even if no external CLI adapter is fully integrated into the center panel on day one.
2. Claude Code and Codex are valuable execution backends and raw-terminal escapes, but they are not the UI contract.
3. Adapter support should be accepted only where it cleanly normalizes into `agent.*` facts and tool/approval semantics.
4. Do not block this backlog item on reproducing provider-specific slash commands, transcript formatting, keyboard semantics, or TUI affordances.

### Transport placement decision

1. If the runtime executes in the same JS runtime as the UI, AI SDK `DirectChatTransport` is acceptable.
2. If the runtime sits behind Tauri commands/events or a future cloud boundary, keep the custom `LifecycleChatTransport`.
3. This backlog item should default to the transport that preserves the Tauri/cloud boundary cleanly rather than optimizing for the shortest demo path.

### Attachment transport rules

1. `sendPrompt` must accept explicit attachment references instead of embedding large payloads directly in the message row.
2. Attachment upload/import is a separate transport step from prompt submission.
3. The runtime should receive normalized attachment metadata:
   - attachment id
   - media type
   - display name
   - logical URI / retrieval handle
   - image dimensions when known
4. The center panel must support image attachments in both user and assistant-visible transcript rendering.

### Local runtime stance

1. This backlog item should prioritize a Lifecycle-native execution path for the center panel rather than trying to mirror Claude/Codex terminal UX.
2. The local execution layer may use AI SDK Core for orchestration, but React must only talk to it through Lifecycle transport.
3. Do not bind React components directly to provider SDKs, API keys, or tool execution logic.
4. If compatibility adapters are supported in this backlog item, they must publish normalized events and cannot force raw TUI rendering into the center panel.

## Tool Execution Contract

Attachments and tools are different capabilities:

1. Attachments are user- or system-provided media/file inputs that become part of message context.
2. Tools are executable actions the execution layer performs against the workspace or environment.
3. Screenshot capture may create an attachment, but that does not make screenshots an artifact or tool result by default.

### Minimum v1 tool catalog

1. Read-only filesystem tools:
   - `workspace_list_directory`
   - `workspace_read_file`
   - `workspace_search_files`
   - `workspace_stat_path`
2. Mutating filesystem tools:
   - `workspace_apply_patch`
   - `workspace_write_file`
   - `workspace_move_path`
   - `workspace_delete_path`
3. Shell and git tools:
   - `workspace_run_command`
   - `workspace_git_status`
   - `workspace_git_diff`
4. Workspace context tools:
   - `workspace_get_manifest`
   - `workspace_list_services`
   - `workspace_open_terminal`

### Tool design rules

1. Tools must return structured JSON, not terminal-formatted strings.
2. Filesystem tools operate relative to the authoritative workspace root, not arbitrary host paths.
3. Mutating tools must declare approval class before execution (`file_write`, `file_delete`, `shell`, `network`, or `question`).
4. Routine file reads/writes should prefer structured tools over shelling out.
5. `workspace_run_command` exists for escape-hatch execution and command output capture, not as the only mechanism for interacting with the repository.
6. Tool results that matter to the user should optionally publish artifacts in addition to tool-call history.

### Ownership

1. Tool registry and schemas should be shared across local and future cloud execution environments.
2. Actual tool execution remains provider-authoritative:
   - local mode uses desktop/Tauri-owned workspace access
   - cloud mode later uses cloud provider/control-plane workspace access
3. Tool execution must never depend on scraping terminal output.

## Entity Contracts

### `agent_session` (agent interaction thread)

1. Purpose:
   - normalized interaction thread attached to a workspace
   - primary unit of user-visible agent history in the center panel
   - can be executed by a Lifecycle-native execution path or another adapter, but the persisted record shape is Lifecycle-owned
2. Required fields:
   - `id`
   - `workspace_id`
   - `runtime_kind` (`native|adapter`)
   - `runtime_name` (nullable string)
   - `title`
   - `status` (`idle|running|waiting_input|waiting_approval|completed|failed|cancelled`)
   - `created_by` (nullable for local pre-auth sessions)
   - `last_message_at`
   - `created_at`, `updated_at`, `ended_at`
3. Invariants:
   - every `agent_session` belongs to exactly one `workspace`
   - `ended_at` is required when `status=completed|failed|cancelled`
   - provider-specific identifiers are adapter metadata, not the primary key or authority boundary

### `agent_message` (message envelope)

1. Purpose:
   - ordered record in an `agent_session`
   - captures user, assistant, system, and tool/runtime-originated messages
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `role` (`user|assistant|system|tool`)
   - `sequence`
   - `created_at`
3. Invariants:
   - unique (`agent_session_id`, `sequence`)
   - message ordering is stable and replayable
   - content lives in `agent_message_part`, not the envelope row

### `agent_message_part` (renderable content segment)

1. Purpose:
   - normalized render units for the center-panel UI
   - separates storage and rendering from provider-specific token/event shapes
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `agent_message_id`
   - `part_type` (`text|thinking|attachment_ref|tool_call|tool_result|artifact_ref|task_ref|approval_ref|status`)
   - `status` (`streaming|complete|failed`)
   - `sequence`
   - `text_value` (nullable)
   - `json_value` (nullable)
   - `created_at`, `updated_at`
3. Invariants:
   - unique (`agent_message_id`, `sequence`)
   - `part_type` determines whether `text_value` or `json_value` is populated
   - a part may grow while `status=streaming`; once final, it becomes immutable

### `agent_attachment` (durable input media/file reference)

1. Purpose:
   - first-class input object for screenshots, pasted images, and uploaded files
   - stable attachment metadata that can be referenced by messages and replayed after reload
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `source_kind` (`upload|paste|screenshot|generated`)
   - `media_type`
   - `display_name`
   - `storage_kind` (`local_blob|workspace_file|remote_blob|external_url`)
   - `uri`
   - `byte_size` (nullable)
   - `sha256` (nullable)
   - `width_px` (nullable)
   - `height_px` (nullable)
   - `created_by` (nullable)
   - `created_at`
3. Invariants:
   - attachment metadata lives in SQLite; attachment bytes do not live in `agent_message_part`
   - attachments are immutable references once created
   - the UI should consume attachment handles/URIs, not raw host-specific temporary file paths

### `agent_tool_call` (durable tool execution record)

1. Purpose:
   - queryable record of each structured tool invocation
   - audit and replay surface for tool execution independent of provider transcript detail
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `agent_message_id` (nullable)
   - `agent_task_id` (nullable)
   - `agent_approval_request_id` (nullable)
   - `tool_name`
   - `status` (`queued|running|awaiting_approval|completed|failed|cancelled`)
   - `input_json`
   - `output_json` (nullable)
   - `error_text` (nullable)
   - `created_at`, `started_at`, `ended_at`, `updated_at`
3. Invariants:
   - every tool call belongs to a single `agent_session`
   - `ended_at` is required when `status=completed|failed|cancelled`
   - tool-call rows are the audit record; do not infer tool history by re-parsing assistant text

### `agent_task` (tracked unit of work)

1. Purpose:
   - durable record of a task the agent is currently doing or has completed
   - supports progress presentation and future multi-agent expansion without coupling the UI to terminal output
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `parent_task_id` (nullable)
   - `title`
   - `status` (`queued|running|blocked|completed|failed|cancelled`)
   - `owner_label` (nullable string)
   - `summary` (nullable)
   - `created_at`, `updated_at`, `ended_at`
3. Invariants:
   - `ended_at` is required when `status=completed|failed|cancelled`
   - `parent_task_id`, when set, must reference a task in the same `agent_session`

### `agent_approval_request` (structured permission/decision gate)

1. Purpose:
   - explicit request for user approval or input
   - replaces provider-specific permission UX with a Lifecycle-owned contract
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `agent_task_id` (nullable)
   - `agent_tool_call_id` (nullable)
   - `kind` (`tool|shell|network|file_write|file_delete|question|handoff`)
   - `scope_key`
   - `status` (`pending|approved_once|approved_session|rejected|expired`)
   - `message`
   - `metadata_json`
   - `created_at`, `responded_at`
3. Invariants:
   - `responded_at` is required when `status!=pending`
   - approvals are never silently auto-created from raw terminal bytes; they must originate from a structured runtime or adapter event
   - `scope_key` should be provider-neutral and prefer workspace-relative paths / logical scopes over host-specific absolute paths

### `agent_artifact` (named output of a session or task)

1. Purpose:
   - durable user-facing output such as diffs, files, links, previews, reports, or command output
2. Required fields:
   - `id`
   - `workspace_id`
   - `agent_session_id`
   - `agent_task_id` (nullable)
   - `agent_tool_call_id` (nullable)
   - `artifact_type` (`diff|file|link|preview|note|report|command_output`)
   - `title`
   - `uri`
   - `metadata_json`
   - `created_at`
3. Invariants:
   - artifacts are immutable references; updating an artifact creates a new record rather than mutating historical output invisibly
   - `uri` should be portable across local and remote providers wherever possible (`lifecycle://...`, preview URL, provider URL, or relative logical path)

## Persistence and Query Contract

### Database renovation

1. Add a new migration after terminal schema work (expected file: `0003_agent_workspace_schema.sql`).
2. Local persistence remains in Tauri SQLite for `workspace.mode=local`.
3. The schema should separate:
   - ordered interaction history (`agent_message`, `agent_message_part`)
   - durable input references (`agent_attachment`)
   - mutable projections (`agent_session`, `agent_tool_call`, `agent_task`, `agent_approval_request`)
   - durable outputs (`agent_artifact`)
4. Required indexes:
   - `agent_session(workspace_id, updated_at desc)`
   - `agent_message(agent_session_id, sequence)`
   - `agent_message_part(agent_message_id, sequence)`
   - `agent_attachment(agent_session_id, created_at desc)`
   - `agent_tool_call(agent_session_id, created_at desc)`
   - `agent_task(agent_session_id, status, updated_at desc)`
   - `agent_approval_request(agent_session_id, status, created_at desc)`
   - `agent_artifact(agent_session_id, created_at desc)`
5. Query paths must support:
   - session list by workspace
   - session detail by id
   - message replay by session
   - attachment list by session
   - tool history by session
   - active task list by workspace/session
   - pending approvals by workspace/session
   - artifact list by workspace/session/task
6. This backlog item does not need to migrate historical terminal transcript bytes into `agent_*` tables. Terminal history remains terminal history.

### Binary storage contract

1. Attachment metadata belongs in SQLite. Attachment bytes belong in provider-owned blob storage, not inline table blobs.
2. For `workspace.mode=local`, attachment bytes should live in an app-managed attachment store under Lifecycle control.
3. For future cloud mode, the same metadata model should point at remote blob/object storage without changing the transcript schema.
4. Image previews should resolve through a Lifecycle attachment fetch path rather than direct filesystem reads from React.

### Query Contract

1. Extend `QuerySource`, lifecycle events, and query descriptors for:
   - `useAgentSessions(workspaceId)`
   - `useAgentSession(sessionId)`
   - `useAgentMessages(sessionId)`
   - `useAgentAttachments(sessionId | messageId)`
   - `useAgentToolCalls(sessionId)`
   - `useAgentTasks(sessionId | workspaceId)`
   - `useAgentApprovals(sessionId | workspaceId)`
   - `useAgentArtifacts(sessionId | workspaceId)`
2. Prefer reducer-driven row upserts for agent events instead of whole-query invalidation where practical.
3. App reload must reconstruct the center panel from persisted queries without requiring a live stream to replay old state.

## Local and Remote Authority Model

1. `workspace.mode` remains the authority boundary for live execution.
2. For `workspace.mode=local`:
   - the desktop app and local execution layer own live execution
   - SQLite is authoritative for local `agent_*` state
   - tool execution uses local workspace access under desktop control
3. For `workspace.mode=cloud`:
   - the cloud provider/control plane will later own live execution
   - the desktop app consumes the same logical `agent_*` shapes over transport
   - the center panel must not assume local file paths, local shell access, local-only attachment URIs, or local-only artifact URIs
4. UI code must not branch on provider-specific transcript or permission payloads; adapters normalize them before they enter query state.
5. Sync is additive later. This backlog item only needs the schema, event, and reducer/query model to be portable.

## Backend Ownership Contract

### Desktop / Tauri side

1. Add a new `agents` capability surface alongside `workspaces` and `projects`.
2. Expected Rust module shape:
   - `apps/desktop/src-tauri/src/capabilities/agents/commands.rs`
   - `apps/desktop/src-tauri/src/capabilities/agents/query.rs`
   - `apps/desktop/src-tauri/src/capabilities/agents/events.rs`
   - `apps/desktop/src-tauri/src/capabilities/agents/persistence.rs`
3. Responsibilities:
   - persist normalized `agent_*` rows
   - ingest attachment metadata and store/fetch attachment bytes
   - expose query commands for the desktop query layer
   - expose prompt / cancel / approval commands
   - emit typed agent events to the desktop app
   - mediate access to local workspace filesystem/shell capabilities

### Shared contracts

1. Add agent-domain types to `packages/contracts`.
2. Keep statuses, failure reasons, and event payloads typed there before UI or backend code starts depending on ad-hoc string values.
3. Keep tool names and approval kinds stable across local and remote implementations.
4. Add stable attachment metadata contracts before UI code depends on browser-only file types.

## Implementation Sequence

### Batch 1: Contracts and persistence

1. Add `packages/contracts/src/agent.ts` plus exports/tests.
2. Add SQLite migration for `agent_*` tables and indexes, including `agent_attachment`.
3. Add Tauri attachment import/fetch/query commands and desktop API wrappers for loading sessions/messages/attachments/tasks/approvals/artifacts.
4. Extend `QuerySource` and lifecycle event subscriptions for agent-domain data.

### Batch 2: Center-panel surface

1. Add `features/agents/*` scaffolding.
2. Replace `TerminalWorkspaceSurface` as the default center panel with `AgentWorkspaceSurface`.
3. Keep a visible raw-terminal entry point.
4. Render persisted transcript, attachments, tasks, approvals, and artifacts from query-backed persisted reads.
5. Add composer attachment tray, thumbnail previews, paste/drop handlers, and screenshot action.

### Batch 3: Prompt loop and streaming

1. Add the native runtime loop using AI SDK Core `ToolLoopAgent`.
2. Add `LifecycleChatTransport` and `useChat` integration, or `DirectChatTransport` only if the runtime is truly colocated with the UI.
3. Implement `createAttachment`, `sendPrompt`, `cancelSession`, and event-driven message streaming.
4. Ensure replay after reload works from persisted state.

### Batch 4: Structured tools and approvals

1. Implement minimum read-only filesystem and workspace-context tools.
2. Add write/delete/shell approval gating through `agent_approval_request`.
3. Persist `agent_tool_call` rows and publish artifacts where useful.

### Batch 5: Compatibility and portability

1. Decide which adapter-backed runtimes, if any, are worth supporting when this backlog item is resumed.
2. Keep adapter output normalized into `agent_*` events.
3. Treat raw Claude/Codex terminals as a supported fallback even when center-panel adapter support is partial.
4. Validate that the same UI can later read equivalent cloud-backed records, including attachments, without redesign.

## Desktop App Surface

- **Agent workspace center panel**: conversation history, attachment previews, streaming assistant output, tool activity, task rail, approvals, and artifacts
- **Composer attachment tray**: drag/drop, paste, file picker, screenshot capture, and preview before send
- **Session switcher**: choose recent `agent_session` threads within the active workspace
- **Task pane**: current and completed tasks with structured status
- **Approval cards**: approve/reject sensitive actions and answer explicit questions
- **Artifact pane**: diffs, generated files, preview links, reports, and command output
- **Raw terminal entry point**: open shell/harness terminal when direct terminal interaction is required

## Exit Gate

- Workspace exists -> opening it lands in a Lifecycle-native agent workspace, not only a terminal pane
- User pastes or captures a screenshot -> attachment preview appears in the composer -> send includes attachment context
- User sends a prompt -> structured assistant response appears in the center panel through `useChat` + Lifecycle transport
- Runtime emits task progress -> task pane updates without parsing terminal output
- Runtime issues structured tool calls -> tool activity appears with persisted history
- Sensitive action requires approval -> Lifecycle approval UI appears and controls execution
- Sent attachments remain queryable and renderable after reload
- Generated diff/file/link/report -> artifact appears in the artifact pane and remains queryable after reload
- User can still open a raw shell terminal without leaving the workspace
- Session history persists locally and replays correctly after app restart
- The same center-panel query model can later be backed by remote transport without redesigning the UI
- This backlog item remains shippable even if Claude/Codex-specific center-panel adapters are incomplete, as long as raw terminal fallback remains available

## Test Scenarios

```text
workspace ready -> open center panel -> see Lifecycle-native agent session surface
paste screenshot -> preview appears in composer -> send prompt -> attachment_ref persists -> reload app -> screenshot still renders in transcript
send prompt -> assistant streams message parts -> reload app -> transcript replays from SQLite
assistant invokes workspace_read_file -> agent_tool_call row persists -> tool result renders in transcript
assistant requests workspace_apply_patch -> approval card appears -> approve once -> execution resumes
session running -> task spawned -> task pane shows queued/running/completed states
runtime publishes diff artifact -> artifact list updates -> reopen workspace -> artifact still present
open raw shell -> run command -> terminal works independently of center-panel session state
switch local workspace to future remote-backed query source -> UI reducers continue to read the same normalized record shape
```
