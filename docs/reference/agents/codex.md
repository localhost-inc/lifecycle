# Codex Provider Contract

Canonical contract for Lifecycle's OpenAI Codex provider integration.

Last verified on 2026-03-23 against OpenAI's official Codex SDK and approvals docs, the official `openai/codex` repository, and the installed Codex CLI app-server protocol generated from the shipped binary in this repo.

## Upstream Authority

Use these in order:

1. OpenAI's official Codex docs for product semantics and approval/sandbox policy.
2. The installed Codex CLI app-server protocol for concrete JSON-RPC methods, request shapes, and streamed notifications.
3. The official `openai/codex` repository for transport direction and implementation clues when docs are less specific.
4. Lifecycle reference docs for how those provider facts map into `agent_session`, `agent_event`, `agent_message`, and `agent_message_part`.

## Thread Identity

Codex is thread-based, and Lifecycle should integrate through the app-server protocol rather than the TypeScript SDK wrapper.

Rules:

1. Lifecycle `agent_session.provider` is `codex`.
2. Lifecycle `agent_session.provider_session_id` maps to the real Codex `thread_id`.
3. Lifecycle must not store a terminal ID in `provider_session_id`.
4. `Thread.id` may be `null` until the first turn starts; the Lifecycle session binding must tolerate that startup window.
5. Resume uses the provider-owned thread ID.

Relevant upstream surfaces:

1. `initialize`
2. `thread/start`
3. `thread/resume`
4. `turn/start`
5. `turn/steer`
6. `turn/interrupt`

## Runtime Model

Codex's app-server protocol is thread + turn based over JSON-RPC stdio or websocket transport.

Rules:

1. Lifecycle should treat the Codex thread as the provider continuity boundary.
2. `turn/start` plus server notifications are the preferred path for normalized event fanout because they expose turn lifecycle, item lifecycle, streaming deltas, and server-initiated approval requests.
3. Terminal sessions are shell sessions only; they are not the Codex transport boundary.
4. Lifecycle should normalize provider events from the SDK stream, not infer them from terminal logs.

The shipped CLI exposes the app-server as `codex app-server --listen stdio://`, and the protocol begins with `initialize` followed by an `initialized` notification.

## Event Model

The current app-server notification surface includes these core Lifecycle-relevant events:

1. `thread.started`
2. `turn.started`
3. `turn.completed`
4. `item.started`
5. `item.completed`
6. `item/agentMessage/delta`
7. `item/reasoning/textDelta`
8. `item/mcpToolCall/progress`
9. `thread/tokenUsage/updated`
10. `error`

The current app-server item surface includes typed items such as:

1. `agentMessage`
2. `reasoning`
3. `commandExecution`
4. `fileChange`
5. `mcpToolCall`
6. `dynamicToolCall`
7. `webSearch`
8. `plan`

Rules:

1. Lifecycle raw persistence must preserve the exact event type and typed item payload.
2. Normalized transcript projections may flatten these into `agent_message` and `agent_message_part`, but the raw event log must remain lossless.
3. Error and failure events are first-class provider facts and must not be collapsed into generic "assistant failed" text.

## Configuration Surface

Important provider-facing options currently exposed in the published TypeScript surface include:

1. `model`
2. `modelReasoningEffort`
3. `approvalPolicy`
4. `sandboxMode`
5. `workingDirectory`
6. `additionalDirectories`
7. `networkAccessEnabled`
8. `webSearchMode`
9. `webSearchEnabled`
10. `skipGitRepoCheck`

Observed approval-policy values in the published TypeScript surface:

1. `never`
2. `on-request`
3. `on-failure`
4. `untrusted`

Rules:

1. Lifecycle UI selectors should map to the real Codex option names and allowed values.
2. Sandbox and approval policy are coupled in the provider contract; do not present them as unrelated toggles.
3. Working-directory and additional-directory scope are part of the provider boundary and should be persisted when they define thread behavior.

## Approvals and Permissions

OpenAI's public Codex docs describe approval as a provider policy and sandbox concern, and the app-server protocol exposes server-initiated approval and user-input requests.

Rules:

1. Lifecycle should preserve the configured approval policy on the session.
2. Lifecycle-hosted approval UX is contract-correct only when it is backed by concrete app-server server requests such as:
   `item/commandExecution/requestApproval`
   `item/fileChange/requestApproval`
   `item/permissions/requestApproval`
   `item/tool/requestUserInput`
   `mcpServer/elicitation/request`
3. Lifecycle must answer those server requests with the protocol-defined response payloads rather than by injecting synthetic chat text.
4. Approval policy still matters even with host callbacks; it determines when Codex asks in the first place.

## Lifecycle Mapping

Codex facts should land in Lifecycle as follows:

1. Provider thread lifecycle -> `agent_session`
2. Raw stream events -> `agent_event`
3. Renderable transcript -> `agent_message` and `agent_message_part`
4. Structured command, file, MCP, search, and todo items -> typed `agent_message_part` payloads or other normalized tables when Lifecycle needs separate querying

Rules:

1. Preserve provider-native thread and item IDs.
2. Keep Lifecycle storage provider-faithful; do not coerce Codex into a terminal-harness model.
3. Reprojection must remain possible as OpenAI expands the SDK event surface.

## Sources

1. OpenAI Codex SDK docs: https://developers.openai.com/codex/sdk
2. OpenAI Codex approvals and security: https://developers.openai.com/codex/agent-approvals-security
3. Official `openai/codex` repository: https://github.com/openai/codex
