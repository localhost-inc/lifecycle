# First-Party Agent Backends Spike

> Status: investigation
> Date: 2026-03-21
> Scope: Lifecycle-owned agent system with Claude and Codex as backend adapters
> Related: [docs/plans/agent-workspace.md](../plans/agent-workspace.md), [docs/reference/vision.md](../reference/vision.md), [docs/reference/terminal.md](../reference/terminal.md)

## Decision

Lifecycle should own the primary agent system.

Claude and Codex should route through the same Lifecycle session, turn, tool, approval, attachment, and artifact contracts. They are backend adapters, not UI contracts and not the source of truth for workspace interaction state.

Raw terminal harnesses should remain available as fallback and power-user surfaces, but they should stop being the primary product substrate.

## Why This Spike Exists

The current terminal-first approach has the wrong center of gravity for the product we are building:

1. The user experience depends on third-party terminal rendering, input, clipboard, and overlay behavior.
2. Agent state is harder to reason about because session, turn, tool, and approval semantics are mixed with terminal transport.
3. Claude and Codex already expose enough structured surface area that Lifecycle can own the interaction model instead of mirroring their TUIs.
4. The repo already points in this direction through the [agent workspace plan](../plans/agent-workspace.md).

If terminal harnesses are the core product today, then a first-party agent surface is not optional follow-up work. It is the path to make the product coherent.

## Backend Facts From Official Docs

### Claude Agent SDK

Claude Agent SDK already supports the core execution loop we need, but it is not an app-server protocol. It is a local SDK/runtime surface.

Important facts:

1. Sessions are persisted automatically and can be continued, resumed by `session_id`, or forked. The SDK writes conversation history to disk automatically and treats the session as the durable conversation context.
2. Permission prompts and `AskUserQuestion` happen in-loop rather than ending the query.
3. The SDK exposes approval controls through permission modes, `canUseTool`, and hooks.
4. Hooks can observe and shape tool calls, prompt submission, stop, notifications, permission requests, and session lifecycle events.
5. The SDK supports built-in tools and MCP tools, which means Lifecycle can provide its own tool servers while keeping Claude as the execution backend.

Implication:

Lifecycle must wrap Claude's session store and event stream rather than treat the SDK as a UI surface. Claude is a backend executor plus hookable event source.

### Codex App Server

Codex App Server is already shaped like an embeddable product protocol.

Important facts:

1. It exposes JSON-RPC auth, thread, turn, approval, skill, app, and event surfaces.
2. Approval flows are explicit and structured for command execution, file changes, user-input requests, and app tool calls.
3. Approvals are scoped by `threadId` and `turnId`, which maps cleanly onto Lifecycle session and turn records.
4. It streams item lifecycle events such as `item/started`, approval requests, and `item/completed`.
5. It supports multiple auth modes: API key, ChatGPT-managed login, and externally managed ChatGPT tokens.

Implication:

Codex App Server can plug into a first-party Lifecycle client almost directly, but its thread/item model still needs normalization before it enters our app state.

## Recommended Ownership Boundary

Lifecycle should own all of the following:

1. Session list and session identity in the workspace.
2. Turn submission and turn lifecycle state.
3. Transcript rendering and message-part streaming.
4. Attachment import, storage handles, and preview fetching.
5. Tool registry, tool schemas, and approval policy classes.
6. Approval UX and approval persistence.
7. Artifact publication and replay.
8. Query/cache reducers and event normalization.
9. Terminal escape hatches.

Claude and Codex should each own only:

1. Model execution.
2. Provider-native session/thread identifiers as adapter metadata.
3. Provider-native auth handshakes where applicable.
4. Provider-native event payloads before normalization.

## Proposed Lifecycle System

### Top-level architecture

```text
AgentWorkspaceSurface
  -> Lifecycle agent API
  -> Agent Orchestrator
  -> Agent Backend Adapter (claude | codex)
  -> normalized agent events
  -> SQLite + attachment store + query reducers
  -> transcript / tasks / approvals / artifacts / terminal escape hatch
```

### Core modules

1. `Agent Orchestrator`
   - Lifecycle-owned command/event boundary
   - session creation, prompt submission, cancellation, fork, approval resolution, attachment import
2. `Agent Backend Adapter`
   - one implementation for Claude Agent SDK
   - one implementation for Codex App Server
3. `Agent Persistence`
   - SQLite `agent_*` tables from the backlog doc
   - attachment metadata in SQLite, bytes in Lifecycle-managed blob storage
4. `Agent Event Normalizer`
   - translates backend-specific payloads into provider-neutral facts
5. `Agent UI`
   - query-backed center panel
   - no direct provider SDK calls from React

## Shared Lifecycle Contract

The backlog `agent_*` model is the correct base. This spike recommends using it with one important framing change:

`agent_session` is the canonical product object, and backend identifiers are only adapter metadata.

### Commands

Lifecycle should expose one command surface regardless of backend:

1. `createAgentSession(workspace_id, backend, options)`
2. `resumeAgentSession(agent_session_id)`
3. `forkAgentSession(agent_session_id)`
4. `sendAgentTurn(agent_session_id, input_parts, attachment_ids)`
5. `cancelAgentTurn(agent_session_id, turn_id?)`
6. `resolveAgentApproval(agent_approval_request_id, decision)`
7. `importAgentAttachment(workspace_id, source)`
8. `openAgentTerminal(agent_session_id, mode)`

### Normalized events

Lifecycle should stream provider-neutral events into the desktop app:

1. `agent.session.created`
2. `agent.session.updated`
3. `agent.turn.started`
4. `agent.turn.completed`
5. `agent.turn.failed`
6. `agent.message.created`
7. `agent.message.part.delta`
8. `agent.message.part.completed`
9. `agent.tool_call.updated`
10. `agent.task.updated`
11. `agent.approval.requested`
12. `agent.approval.resolved`
13. `agent.artifact.published`
14. `agent.auth.updated`

The UI should render only from these normalized facts and the persisted `agent_*` projections behind them.

## Adapter Mapping

### Codex adapter

Map Codex App Server concepts like this:

1. `threadId` -> adapter metadata on `agent_session`
2. `turnId` -> adapter metadata on the active turn
3. `item/started` and `item/completed` -> `agent_message_part`, `agent_tool_call`, `agent_task`, or `agent_artifact` updates depending on item type
4. approval requests -> `agent_approval_request`
5. `account/*` notifications -> `agent.auth.updated`

Implementation note:

Codex is likely the cleaner first adapter because the protocol is already thread/turn/item oriented and explicitly designed for host applications.

### Claude adapter

Map Claude Agent SDK concepts like this:

1. Claude `session_id` -> adapter metadata on `agent_session`
2. `query()` / `ClaudeSDKClient` execution -> Lifecycle turn execution
3. streamed assistant and result messages -> `agent_message` plus `agent_message_part`
4. `canUseTool`, permission modes, and hooks -> `agent_approval_request` and `agent.tool_call.updated`
5. hook notifications -> session, task, and telemetry updates where useful

Implementation note:

Claude will require more Lifecycle-owned orchestration because the SDK is an execution library, not a fully hosted app protocol. That is acceptable as long as the adapter remains behind the same orchestrator boundary.

## Tooling Strategy

Both backends need to route through the same Lifecycle tool system.

That means:

1. Lifecycle defines the tool catalog, schemas, approval classes, and result shapes.
2. Claude consumes those tools through SDK tools and MCP where appropriate.
3. Codex consumes those tools through app-server dynamic tools and apps where appropriate.
4. The desktop app never scrapes terminal output to reconstruct tool history.

The tool catalog from the backlog doc remains the right minimum:

1. read-only filesystem tools
2. mutating filesystem tools
3. shell and git tools
4. workspace context tools

## Attachment Strategy

Attachments need to be first-party from day one.

Lifecycle should:

1. import and fingerprint attachments before turn submission
2. persist attachment metadata as `agent_attachment`
3. expose a stable Lifecycle URI/handle to the UI
4. translate that attachment into each backend's input format

Do not let either provider define the persistence format for screenshots, pasted images, or uploaded files.

## Approval Strategy

Approvals are one of the main reasons to own the harness.

Lifecycle should own the policy classes:

1. `file_write`
2. `file_delete`
3. `shell`
4. `network`
5. `question`
6. `handoff`

Provider-specific prompts should be translated into these classes. Session-scoped approval memory should also be Lifecycle-owned, even if an adapter has its own allow-once or allow-for-session concept.

## Auth Strategy

Auth should be normalized, but not faked into one implementation.

### Codex

Codex can support:

1. OpenAI API key
2. ChatGPT-managed login
3. externally managed ChatGPT tokens

Lifecycle should surface those as Codex-specific sign-in options behind a shared backend settings surface.

### Claude

Claude Agent SDK should be treated as credentialed backend access, not consumer ChatGPT-style login. In practice this likely means Anthropic API credentials or other approved Claude deployment credentials configured through Lifecycle-owned settings.

Lifecycle should therefore normalize auth state at the product layer, but keep provider-specific auth setup flows honest.

## Recommended Implementation Order

### Phase 1: lock the shared contract

1. Promote the `agent_*` schema and event model from backlog into implementation-ready contracts.
2. Add a new desktop `agents` capability.
3. Add the first-party attachment store and approval persistence.
4. Add the center-panel query descriptors and reducers.

### Phase 2: implement the Codex adapter first

1. Use App Server threads, turns, approvals, and auth notifications.
2. Normalize them into the shared Lifecycle model.
3. Prove the transcript, approval, and artifact UX end to end.

Reason:

Codex App Server already exposes a host-oriented protocol. It is the fastest way to harden the Lifecycle-owned UI and event model.

### Phase 3: implement the Claude adapter second

1. Wrap the SDK execution loop behind the same orchestrator.
2. Use hooks and permission controls to project tool and approval events into the shared model.
3. Reuse the same center-panel UI, reducer logic, and approval UX.

Reason:

Claude is still a strong backend fit, but it will require more adapter-owned orchestration than Codex.

### Phase 4: demote terminal harnesses to fallback mode

1. Keep raw terminal sessions for shell/debug and direct agent escape hatches.
2. Stop treating terminal transport as the primary source of agent state.
3. Keep terminal launch available from the agent session when a user explicitly wants it.

## Risks

1. Claude and Codex do not expose identical event models, so the normalizer needs to be strict about what becomes canonical versus optional.
2. Claude's local SDK shape may make auth, session import/export, and replay semantics less turnkey than Codex App Server.
3. Tooling needs careful adapter design so the same Lifecycle tools can be presented cleanly to both backends.
4. If we let provider-native transcripts leak into query state early, the first-party system will collapse back into adapter-specific UI.

## Concrete Next Moves

1. Move the `agent_*` contracts from backlog into `packages/contracts`.
2. Add the Tauri `agents` capability skeleton and SQLite migration.
3. Define the normalized `agent.*` event payloads before building adapters.
4. Build the Codex adapter spike against the new orchestrator boundary.
5. Build the Claude adapter spike against the same orchestrator boundary.
6. Replace the default center panel with the first query-backed `AgentWorkspaceSurface` once at least one adapter is operational.

## Sources

1. Claude Agent SDK overview: https://platform.claude.com/docs/en/agent-sdk/overview
2. Claude Agent SDK sessions: https://platform.claude.com/docs/en/agent-sdk/sessions
3. Claude Agent SDK permissions: https://platform.claude.com/docs/en/agent-sdk/permissions
4. Claude Agent SDK hooks: https://platform.claude.com/docs/en/agent-sdk/hooks
5. Codex App Server: https://developers.openai.com/codex/app-server
