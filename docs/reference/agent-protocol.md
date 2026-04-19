# Agent Protocol

Canonical contract for Lifecycle's normalized agent event layer.

## Scope

Lifecycle currently keeps a bridge-owned agent session runtime. The bridge persists agent records, transcript messages, and append-only agent events, then streams normalized agent events over the bridge WebSocket for clients.

Lifecycle keeps two simultaneous views of provider activity:

1. Raw provider passthrough in `agent.provider.event` for lossless reprojection.
2. Normalized agent events for UI, orchestration, and persistence-friendly consumers.

The normalized layer must be expressive enough for both Claude Agent SDK sessions and Codex app-server threads without forcing consumers to parse provider-native payloads.

## Core Event Families

1. Transcript stream
   `agent.message.created`
   `agent.message.part.delta`
   `agent.message.part.completed`
2. Turn lifecycle
   `agent.turn.started`
   `agent.turn.completed`
   `agent.turn.failed`
3. Structured provider items
   `agent.item.started`
   `agent.item.updated`
   `agent.item.completed`
   `agent.item.delta`
4. Approval and question flow
   `agent.approval.requested`
   `agent.approval.resolved`
5. Generic host request flow
   `agent.provider.requested`
   `agent.provider.request.resolved`
6. Provider signals
   `agent.provider.signal`
7. Raw passthrough
   `agent.provider.event`

## Structured Items

`agent.item.*` is the normalized place for provider-owned work units that are not just transcript text. Current normalized item variants include:

1. `agent_message`
2. `reasoning`
3. `command_execution`
4. `file_change`
5. `tool_call`
6. `image_view`
7. `image_generation`
8. `review_mode`
9. `context_compaction`
10. `error`

Rules:

1. Preserve provider-owned item ids.
2. Preserve the upstream item type in `sourceType` when the normalized type is broader than the provider-native one.
3. Keep provider-specific detail in `metadata` instead of dropping it.
4. Use `agent.item.delta` for incremental per-item streams such as command output, file diffs, plan deltas, reasoning summary deltas, terminal interaction, or realtime audio.

### Provider Coverage

Claude Agent SDK surfaces currently normalize as follows:

1. Assistant text and thinking blocks -> transcript stream
2. Tool use blocks -> transcript stream plus `agent.tool_call.updated` projections
3. Permission requests -> `agent.approval.*` and `agent.provider.request*`
4. Elicitation requests -> `agent.provider.request*`
5. Task lifecycle, hook lifecycle, local command output, compact boundary, files persisted, prompt suggestions, rate limits, API retry, tool-use summary, auth/system status -> `agent.provider.signal`
6. Any remaining SDK message shape -> `agent.provider.event`

Codex app-server surfaces currently normalize as follows:

1. Assistant message text -> transcript stream
2. Plans, reasoning blocks, command executions, file changes, MCP tool calls, dynamic tool calls, web search, collab agent calls, image view/generation, review mode, context compaction -> `agent.item.*`
3. Message text deltas, reasoning-summary deltas, plan deltas, command output, file diff output, terminal interaction, realtime audio -> `agent.item.delta`
4. Command approvals, apply-patch approvals, dynamic tool calls, auth refresh, user input requests -> `agent.provider.request*`
5. Thread, turn, hook, account, config, skills, apps, MCP, realtime, and app-server lifecycle notifications -> `agent.provider.signal`
6. Any remaining app-server notification or response payload -> `agent.provider.event`

Coverage rule:

1. If a provider surface has a stable normalized home, emit it there.
2. If Lifecycle does not yet project a stable normalized shape for that surface, still preserve it in `agent.provider.event`.
3. Do not drop upstream facts.

## Provider Signals

`agent.provider.signal` is for provider-native lifecycle facts that do not belong in the transcript and are not host requests. Signals are grouped by `channel` so consumers can build stable UI reducers without hard-coding one provider.

Current channels are:

1. `account`
2. `apps`
3. `auth`
4. `config`
5. `hook`
6. `item`
7. `mcp`
8. `realtime`
9. `skills`
10. `system`
11. `task`
12. `thread`
13. `turn`

Rules:

1. Keep the provider fact name in `name`.
2. Put the normalized grouping in `channel`.
3. Attach `turnId`, `itemId`, and `requestId` when the upstream event exposes them.
4. Store the remaining upstream shape in `metadata`.

## Host Requests

`agent.provider.requested` and `agent.provider.request.resolved` cover host interactions that are broader than Lifecycle's approval model.

Current normalized request kinds are:

1. `approval`
2. `user_input`
3. `dynamic_tool_call`
4. `auth_refresh`
5. `apply_patch_approval`
6. `command_approval`
7. `other`

Rules:

1. Keep `agent.approval.*` for the existing approval UX and session state machine.
2. Also emit `agent.provider.requested` / `agent.provider.request.resolved` so generic consumers can handle every host callback through one surface.
3. Preserve the provider-native request method and payload in `metadata`.

## Consumer API

Lifecycle does not currently ship a dedicated shared reducer package for this protocol.

Use that reducer/store when a consumer needs:

1. Assistant text and thinking blocks grouped by turn
2. Structured items and per-item delta accumulation
3. Generic provider request tracking
4. Provider signal tracking

The transcript projection remains a separate derived view. Do not force transcript-only shapes to carry the full provider protocol.

## Builder Ergonomics

Lifecycle exposes two builder-friendly entry points:

1. Stream consumers that still work with this protocol should keep their reducer/store local to that surface instead of depending on a dedicated shared package.
2. Hosts that still expose these callbacks should keep the transport explicit and surface-specific.

Rules:

1. Build generic UI against `agent.provider.requested` and `agent.provider.request.resolved` instead of branching on provider callback methods.
2. Build transcript UI against `agent.message.*`.
3. Build tool panes, diff panes, reasoning panes, and rich activity views against `agent.item.*` and `agent.item.delta`.
