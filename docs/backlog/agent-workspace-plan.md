# Agent Workspace Execution Plan

> Status: active backlog execution plan
> Parent spec: [agent-workspace.md](./agent-workspace.md)
> Related: [docs/plan.md](../plan.md), [docs/learnings/2026-03-21-first-party-agent-backends-spike.md](../learnings/2026-03-21-first-party-agent-backends-spike.md)

This document is the working build plan for the Lifecycle-native agent workspace.

Use [agent-workspace.md](./agent-workspace.md) for the full product contract and durable architecture.
Use this file for sequencing, implementation slices, and task-level tracking.

## Planning Rules

1. This plan does not promote agent workspace work into the main milestone board yet.
2. `agent_session` is the canonical product object.
3. Claude and Codex are backend adapters behind one Lifecycle-owned session, turn, tool, approval, attachment, and artifact model.
4. Raw harness terminals remain available, but they are fallback surfaces rather than the center-panel authority.
5. Each milestone here should ship a coherent vertical slice, not only scaffolding.

## Execution Status

| Milestone | Status | Outcome |
| --- | --- | --- |
| A0 | done | Shared agent contracts and initial desktop persistence exist |
| A1 | in_progress | A real local agent session can bind to a harness runtime and accept prompt input |
| A2 | planned | Agent transcript becomes a real persisted center-panel surface |
| A3 | planned | Attachments and image-first composer flows work end-to-end |
| A4 | planned | Structured tools, approvals, and task state replace terminal inference |
| A5 | planned | Claude runs through a first-party adapter rather than terminal write-through |
| A6 | planned | Codex runs through the same first-party contract |
| A7 | planned | Local and cloud-ready portability boundaries are locked |

## A0. Contracts and Session Foundation

**Outcome**

Lifecycle owns the first shared `agent_*` domain boundary in contracts, desktop persistence, and frontend query seams.

**Status**

Done.

**Tasks**

- [x] Add `packages/contracts/src/agent.ts` with canonical backend, runtime, session status, and message role types.
- [x] Export agent contracts through `packages/contracts/src/index.ts`.
- [x] Add contract coverage in `packages/contracts/src/agent.test.ts`.
- [x] Add `agent_session` desktop migration and indexes.
- [x] Add desktop `agents` capability with create/list/get session commands.
- [x] Add frontend `features/agents/api.ts`, query keys, queries, and hooks for session records.
- [x] Add `packages/agents` for shared adapter/orchestrator/runtime contracts.

**Exit gate**

- Sessions exist as first-party records independent of terminal ids or provider thread ids.

## A1. Harness-Backed Local Agent Session

**Outcome**

A user can open an agent tab, type a prompt, and route it into a real local Claude or Codex harness session while Lifecycle owns the tab and session identity.

**Status**

In progress.

**Tasks**

- [x] Create `AgentTab` / `AgentSurface` naming across the workspace canvas.
- [x] Launch a real harness terminal when creating an `agent_session`.
- [x] Persist the bound runtime terminal id on `agent_session.runtime_session_id`.
- [x] Add terminal write-through API for sending prompt text to a bound runtime.
- [x] Add desktop query for reading normalized transcript messages from harness session logs.
- [x] Render a real agent transcript in the center panel from query data instead of fake local state.
- [x] Restyle the center panel to a TUI-like transcript and prompt buffer.
- [ ] Update `agent_session.status` and `last_message_at` from runtime events instead of leaving sessions mostly idle.
- [ ] Add a focused end-to-end desktop test that creates an agent tab, sends a prompt, and verifies transcript hydration.
- [ ] Decide whether the hidden native-terminal bootstrap remains the right local runtime bridge or should move behind a cleaner runtime activation command.

**Exit gate**

- A real Claude session can be opened from the workspace and accept typed prompts through the agent surface.

## A2. Persisted Center-Panel Transcript

**Outcome**

The center panel stops being a harness-log view and becomes a Lifecycle-owned transcript with replayable turns and renderable message parts.

**Tasks**

- [ ] Add `agent_message` and `agent_message_part` tables plus indexes.
- [ ] Persist normalized user and assistant turns into `agent_*` tables instead of reading raw harness logs on every load.
- [ ] Add agent event reducers or explicit invalidation rules for transcript updates.
- [ ] Build a message mapper from persisted rows to center-panel render state.
- [ ] Support streaming text updates through `agent.message.part.delta` / `completed` events.
- [ ] Add explicit system/status rows for lifecycle events like running, failed, and cancelled.
- [ ] Keep transcript replay correct after app restart without requiring a live stream.

**Exit gate**

- Reloading the app reconstructs the full center-panel transcript from Lifecycle persistence alone.

## A3. Attachments and Composer

**Outcome**

The agent composer is image-first and supports screenshot, paste, drag/drop, and file pickers through Lifecycle-owned attachment records.

**Tasks**

- [ ] Add `agent_attachment` schema and indexes.
- [ ] Add desktop attachment store plus import/fetch commands.
- [ ] Add attachment metadata contracts to shared packages.
- [ ] Add composer attachment tray UI with preview thumbnails.
- [ ] Support clipboard image paste into the agent composer.
- [ ] Support drag/drop file import into the composer.
- [ ] Add screenshot capture flow that produces `agent_attachment` records.
- [ ] Render attachment references in transcript history and after reload.
- [ ] Keep attachment URIs/provider payloads behind Lifecycle-owned handles.

**Exit gate**

- A user can paste or capture a screenshot, send it with a prompt, and still see that attachment after reload.

## A4. Structured Tools, Approvals, and Tasks

**Outcome**

Lifecycle owns tool history, approval requests, and task state without scraping terminal output.

**Tasks**

- [ ] Add `agent_tool_call`, `agent_task`, `agent_approval_request`, and `agent_artifact` tables and indexes.
- [ ] Define stable approval classes: `file_write`, `file_delete`, `shell`, `network`, `question`, `handoff`.
- [ ] Implement the minimum read-only workspace tools.
- [ ] Implement write/delete workspace tools with approval gating.
- [ ] Implement shell and git escape-hatch tools with structured results.
- [ ] Add a task pane and approval cards to the agent workspace UI.
- [ ] Add artifact publication and artifact list UI.
- [ ] Emit typed `agent.*` lifecycle events for tools, tasks, approvals, and artifacts.

**Exit gate**

- File writes, shell actions, and explicit questions are represented as structured Lifecycle approvals and tool history.

## A5. First-Party Claude Adapter

**Outcome**

Claude runs through a Lifecycle-owned adapter and event normalization layer rather than through terminal input plus transcript log parsing.

**Tasks**

- [ ] Define the concrete `AgentBackendAdapter` runtime contract for local execution.
- [ ] Implement Claude adapter using Claude Agent SDK sessions, hooks, and tool boundaries.
- [ ] Map Claude session identifiers into adapter metadata instead of UI identifiers.
- [ ] Persist normalized session, turn, message-part, tool, task, approval, and artifact events.
- [ ] Replace harness log parsing as the primary source of truth for Claude-backed agent sessions.
- [ ] Keep raw Claude harness terminal available as an explicit fallback/escape hatch.
- [ ] Add local auth/configuration handling for Claude credentials through Lifecycle settings.

**Exit gate**

- Claude-backed agent sessions run through first-party Lifecycle state while raw Claude terminal access remains optional.

## A6. First-Party Codex Adapter

**Outcome**

Codex runs through the same Lifecycle-owned session and event model as Claude.

**Tasks**

- [ ] Implement Codex adapter against Codex App Server thread/turn/item flows.
- [ ] Map Codex approvals into Lifecycle approval classes.
- [ ] Normalize Codex items into `agent_message_part`, `agent_tool_call`, `agent_task`, and `agent_artifact`.
- [ ] Add Codex auth/configuration handling through Lifecycle settings.
- [ ] Ensure UI code does not branch on Codex-specific transcript semantics.
- [ ] Keep raw Codex harness terminal available as an explicit fallback/escape hatch.

**Exit gate**

- Claude and Codex both route through the same Lifecycle session surface and persistence model.

## A7. Portability and Cloud-Ready Boundaries

**Outcome**

The agent workspace is still local-first, but its contracts are ready to back onto remote/cloud execution without redesigning the UI.

**Tasks**

- [ ] Make attachment URIs, artifact URIs, and tool scopes portable beyond local filesystem assumptions.
- [ ] Keep `packages/agents` provider-agnostic and runtime-aware (`local`, `docker`, `remote`, `cloud`).
- [ ] Define transport boundaries for desktop-local versus future remote event streaming.
- [ ] Confirm query contracts do not depend on terminal-only local runtime facts.
- [ ] Add cloud-shape compatibility notes to the reference docs once the contracts stabilize.
- [ ] Decide whether TanStack DB / Tauri SQLite becomes the primary local-first query layer for agent state.
- [ ] Decide when Electric or another sync layer becomes necessary for cloud/live replication rather than local persistence.

**Exit gate**

- The same center-panel model can later consume remote-backed agent records without changing the UI contract.

## Immediate Next Tasks

These are the next high-value tasks on the current path.

1. Update `agent_session.status` and `last_message_at` from runtime activity.
2. Add `agent_message` and `agent_message_part` persistence so transcript state stops depending on harness log replay.
3. Add one focused end-to-end Claude session test for create -> send prompt -> transcript appears.
4. Decide the clean runtime activation boundary that replaces the hidden native-terminal bootstrap if needed.
5. Start attachment import/store work immediately after persisted transcript rows land.

## Promotion Rule

Promote this work into `docs/milestones/*` only when both are true:

1. It becomes the next actively tracked delivery stream rather than parallel backlog execution.
2. We are willing to update [docs/plan.md](../plan.md) so the main milestone board reflects that change.
