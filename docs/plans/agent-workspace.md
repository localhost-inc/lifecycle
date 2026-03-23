# Plan: Lifecycle-native agent workspace

> Status: active execution plan
> Context: parallel to the active milestone contract in [docs/milestones/README.md](../milestones/README.md) and tracked with other future work in [docs/plans/README.md](./README.md)
> Related: [docs/learnings/2026-03-21-first-party-agent-backends-spike.md](../learnings/2026-03-21-first-party-agent-backends-spike.md), [docs/reference/vision.md](../reference/vision.md), [docs/reference/workspace.md](../reference/workspace.md), [docs/reference/vocabulary.md](../reference/vocabulary.md)

This document is the canonical build plan for the Lifecycle-native agent workspace.

Use this file for:
1. the product shape we are actually building
2. milestone sequencing for this execution stream
3. task-level execution tracking
4. exit gates for each delivery slice

## Planning Rules

1. This plan sits outside the active milestone set until the harness becomes a primary tracked delivery stream.
2. `agent_session` is the canonical product object.
3. Claude and Codex are `agent providers` behind one Lifecycle-owned session, turn, tool, approval, attachment, and artifact model.
4. `workspace runtime` means where work runs: `local`, `docker`, `remote`, or `cloud`.
5. `terminal` means the separate shell surface in the product. It is not the harness, not the provider boundary, and not the source of truth for agent state.
6. Each milestone here should ship a coherent vertical slice, not only scaffolding.
7. Legacy harness-terminal integration is a reset target. Rebuild through the provider model rather than preserving compatibility layers.

## Product Shape

1. Lifecycle owns a first-party GUI `harness` in the workspace center panel.
2. `agent_session` is the first-party interaction thread inside that harness.
3. `agent provider` means the Claude or Codex integration behind that session.
4. `workspace runtime` means the execution placement for the workspace.
5. `terminal` remains a first-class shell surface in the product, but separate from harness state.
6. Provider-native events must enter the desktop through a Lifecycle-owned `AgentOrchestrator` layer that emits normalized `agent.*` facts for the UI and persistence layers.
7. The app owns one `AgentOrchestrator` initialized with the Lifecycle store.
8. `AgentOrchestrator` creates `AgentSession` objects backed by persisted `agent_session` records.
9. Each `AgentSession` interfaces with an `AgentWorker` deployed on the target `WorkspaceRuntime`.
10. The harness UI should talk to `AgentSession`, not terminal APIs or provider-specific transport details.

## Architectural Reset

The existing agent integration should be treated as legacy and replaced through one forward-only model:

```text
Harness UI
  -> AgentOrchestrator
    -> AgentSession
      -> AgentWorker
        -> ClaudeAgentSessionProvider | CodexAgentSessionProvider
          -> WorkspaceRuntime
            -> local | docker | remote | cloud execution
```

Rules:

1. `AgentOrchestrator` is the only UI-facing runtime contract for agent execution.
2. `AgentOrchestrator.startSession(...)` creates an `AgentSession` backed by a persisted `agent_session` record through one shared API.
3. `AgentSession` is the harness-facing live object for one persisted `agent_session`.
4. `AgentWorker` is the deployed execution unit for an `AgentSession` on `local`, `docker`, `remote`, or `cloud`.
5. `WorkspaceRuntime` is the deployment boundary for `AgentWorker`, not an app-level owner of agent state.
6. On `local`, the first real worker path should be a Lifecycle-owned process launched as `lifecycle agent worker <provider>`, with stdin/stdout as the control stream and `provider_session_id` reported back by the worker.
4. `terminal` becomes a dumb shell/filesystem surface and must not carry harness state, transcript state, or approval state.
5. Existing harness-terminal glue should be deleted rather than migrated behind compatibility shims.

## Provider Overlay Contract

Both Claude and Codex must be projected into one Lifecycle-owned contract rather than exposing SDK-native shapes to the app.

```text
AgentOrchestrator.startSession({ provider, workspace_id })
  -> AgentSession
    -> AgentWorker
      -> sendTurn(...)
      -> cancelTurn(...)
      -> resolveApproval(...)
```

Rules:

1. Lifecycle owns `agent_session.id`; provider SDK ids live only in `agent_session.provider_session_id`.
2. `agent_event` is the append-only lifecycle event log. `agent_message` and `agent_message_part` are durable query projections derived from that log for the harness UI.
3. `AgentSession` is backed by a live `AgentWorker` bound to that persisted row.
4. Providers must emit normalized `agent.*` events for message creation, message streaming, turn lifecycle, approvals, tools, and artifacts.
5. The harness UI reads Lifecycle state only. It must not branch on Claude-specific or Codex-specific transcript semantics.
6. `WorkspaceRuntime` is a per-session execution dependency used to deploy the `AgentWorker` in the correct workspace environment.
7. `provider_session_id` is discovered by the worker and reported back during worker startup; it is not the transport address the desktop app uses to command the worker.

Required normalized provider outputs:

1. `agent.message.created`
2. `agent.message.part.delta`
3. `agent.message.part.completed`
4. `agent.turn.completed`
5. `agent.turn.failed`
6. `agent.approval.requested`
7. `agent.approval.resolved`
8. `agent.tool_call.updated`
9. `agent.artifact.published`

## SDK Mapping

We should build to the stable documented SDK shapes and wrap them into the overlay contract above.

### Codex

1. Use the Codex SDK thread model as the primary integration target.
2. `provider_session_id` maps to the Codex `threadId`.
3. `AgentSession.sendTurn(...)` maps to `thread.run(...)`.
4. The Codex-backed `AgentWorker` must normalize streamed Codex items/events into Lifecycle `agent.*` events and persisted `agent_*` rows.
5. App Server concepts are transport details, not app architecture.

### Claude

1. Use the Claude TypeScript V2 preview session surface as the primary integration target behind the Lifecycle contract.
2. `provider_session_id` maps to the Claude `session_id`.
3. `AgentSession.sendTurn(...)` wraps Claude session send/stream semantics into the Lifecycle session model.
4. The Claude-backed `AgentWorker` must normalize Claude hooks, permission checks, and user-input callbacks into Lifecycle approvals, tools, and message parts.
5. Claude-specific session continuity must remain an implementation detail behind `AgentSession`.

## Execution Status

| Milestone | Status | Outcome |
| --- | --- | --- |
| A0 | done | Shared agent contracts and initial desktop persistence exist |
| A1 | in_progress | A real local agent session can bind to a local provider session and accept prompt input |
| A2 | planned | Agent transcript becomes a real persisted center-panel surface |
| A3 | planned | Attachments and image-first composer flows work end-to-end |
| A4 | planned | Structured tools, approvals, and task state replace terminal inference |
| A5 | planned | Claude runs through a first-party provider integration rather than terminal write-through |
| A6 | planned | Codex runs through the same first-party contract |
| A7 | planned | Local and cloud-ready portability boundaries are locked |

## A0. Contracts and Session Foundation

**Outcome**

Lifecycle owns the first shared `agent_*` domain boundary in contracts, desktop persistence, and frontend query seams.

**Status**

Done.

**Tasks**

- [x] Add `packages/contracts/src/agent.ts` with canonical provider/runtime/session/message contracts.
- [x] Export agent contracts through `packages/contracts/src/index.ts`.
- [x] Add contract coverage in `packages/contracts/src/agent.test.ts`.
- [x] Add `agent_session` desktop migration and indexes.
- [x] Add desktop agent session persistence and frontend query seams without introducing a Rust-side agent runtime boundary.
- [x] Add frontend agent queries/hooks for session records and message hydration.
- [x] Add `packages/agents` for shared provider/session contracts.

**Exit gate**

- Sessions exist as first-party records independent of terminal ids or provider thread ids.

## A1. Local Provider Session Bridge

**Outcome**

A user can open an agent tab, type a prompt, and route it into a real local Claude or Codex provider session while Lifecycle owns the harness UI, tab, session identity, and normalized event flow.

**Status**

In progress.

**Tasks**

- [x] Create `AgentTab` / `AgentSurface` naming across the workspace canvas.
- [x] Define `AgentOrchestrator` as the first-class session factory and lifecycle coordinator.
- [x] Move `AgentOrchestrator` ownership to the app/store layer instead of `WorkspaceRuntime`.
- [x] Implement `ClaudeAgentSessionProvider` and `CodexAgentSessionProvider` against the shared contract.
- [x] Bind each `agent_session` to a provider-owned local runtime session.
- [x] Persist the bound provider session identifier on `agent_session.provider_session_id`.
- [x] Add first-party turn submission that routes prompts through `AgentSession` to the bound runtime worker.
- [x] Hydrate the center-panel transcript from Lifecycle-owned agent state rather than terminal UI state.
- [x] Render a real agent transcript in the center panel from query data instead of fake local state.
- [x] Restyle the center panel to a TUI-like transcript and prompt buffer.
- [x] Route worker/provider activity through `AgentOrchestrator` so normalized `agent.*` facts drive the UI and persistence layers for the real local Claude worker path.
- [x] Delete the current terminal-coupled harness integration instead of preserving it behind fallback layers.
- [ ] Update `agent_session.status` and `last_message_at` from normalized agent-provider events instead of leaving sessions mostly idle.
- [ ] Add a focused end-to-end desktop test that creates an agent tab, sends a prompt, and verifies transcript hydration.
- [x] Remove `AgentSurface` dependence on terminal lifecycle events and hidden native-terminal bootstrap state.
- [ ] Finalize the local runtime activation boundary through app-level `AgentOrchestrator`, harness-facing `AgentSession`, runtime-deployed `AgentWorker`, and store-owned agent state.

**Clarifications**

1. The harness center panel must render from Lifecycle-owned `agent_*` state and normalized `agent.*` events, not from `terminal.*` lifecycle facts.
2. Claude should be modeled against Claude Agent SDK session continuity, hooks, and runtime approval controls.
3. Codex should be modeled against the Codex SDK thread model and normalized into Lifecycle turns, approvals, and message parts.
4. Nothing in the current terminal-coupled harness path is a compatibility constraint. The target architecture is the provider model above.
5. `AgentOrchestrator` is app-level and store-backed; `AgentSession` is harness-facing; `AgentWorker` is runtime-bound per `agent_session`.
6. Rust should not own agent-session orchestration or transcript querying. Local agent execution belongs to the desktop runtime and the TS-side orchestrator/session-provider path.
7. The first real local Claude worker path is `AgentOrchestrator -> AgentSession -> AgentWorker -> lifecycle agent worker claude -> Claude SDK V2 preview`.

**Exit gate**

- A real Claude session can be opened from the workspace and accept typed prompts through the agent surface, with agent state owned by the first-party `AgentOrchestrator` and `AgentSession` boundaries rather than the terminal surface.

## A2. Persisted Center-Panel Transcript

**Outcome**

The center panel stops being a provider-log view and becomes a Lifecycle-owned transcript with replayable turns and renderable message parts.

**Tasks**

- [ ] Add `agent_message` and `agent_message_part` tables plus indexes.
- [x] Add append-only `agent_event` persistence for normalized lifecycle facts.
- [ ] Persist normalized user and assistant turns into `agent_*` tables instead of reading provider logs on every load.
- [ ] Add agent event reducers or explicit invalidation rules for transcript updates.
- [ ] Build a message mapper from persisted rows to center-panel render state.
- [ ] Support streaming text updates through `agent.message.part.delta` / `completed` events.
- [x] Store structured message-part payloads in typed `data` blobs keyed by `part_type`.
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

## A5. First-Party Claude Provider

**Outcome**

Claude runs through a Lifecycle-owned provider integration and event normalization layer rather than through terminal input plus transcript log parsing.

**Tasks**

- [ ] Define the concrete agent-provider runtime contract for local execution.
- [ ] Implement the Claude session provider using the stable Claude Agent SDK query/session continuity surface, hooks, and tool boundaries.
- [ ] Map Claude session identifiers into provider metadata instead of UI identifiers.
- [ ] Persist normalized session, turn, message-part, tool, task, approval, and artifact events.
- [ ] Replace provider log parsing as the primary source of truth for Claude-backed agent sessions.
- [ ] Keep the separate terminal shell surface available for normal shell work without coupling it to harness state.
- [ ] Add local auth/configuration handling for Claude credentials through Lifecycle settings.

**Exit gate**

- Claude-backed agent sessions run through first-party Lifecycle state.

## A6. First-Party Codex Provider

**Outcome**

Codex runs through the same Lifecycle-owned session and event model as Claude.

**Tasks**

- [ ] Implement the Codex session provider against the Codex SDK thread model.
- [ ] Map Codex approvals into Lifecycle approval classes.
- [ ] Normalize Codex items into `agent_message_part`, `agent_tool_call`, `agent_task`, and `agent_artifact`.
- [ ] Add Codex auth/configuration handling through Lifecycle settings.
- [ ] Ensure UI code does not branch on Codex-specific transcript semantics.
- [ ] Keep the separate terminal shell surface available for normal shell work without coupling it to harness state.

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

- The same center-panel model can later consume remote-backed agent records without changing the `AgentOrchestrator` UI contract.

## Immediate Next Tasks

These are the next high-value tasks on the current path.

1. Implement concrete `ClaudeAgentSessionProvider` and `CodexAgentSessionProvider` bindings behind `AgentOrchestrator`.
2. Move the remaining harness UI command/event flow onto `AgentOrchestrator` and remove direct terminal dependencies.
3. Route local provider activity through `AgentOrchestrator` so `agent.*` events drive transcript, status, and approvals.
4. Delete the current terminal-coupled harness path instead of preserving it.
5. Add `agent_message` and `agent_message_part` persistence so transcript state stops depending on bridge log replay.
6. Add one focused end-to-end Claude session test for create -> send prompt -> transcript appears.
7. Decide the clean local runtime activation boundary that remains inside provider implementations if a temporary local bridge is still needed.
8. Start attachment import/store work immediately after persisted transcript rows land.

## Promotion Rule

Promote this work into `docs/milestones/*` only when both are true:

1. It becomes the next actively tracked delivery stream rather than a parallel execution plan.
2. We are willing to maintain it as an active milestone contract alongside M4-M7.
