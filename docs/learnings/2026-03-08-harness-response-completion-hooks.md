# Harness Response Completion Needs Provider-Aware Session Events

Date: 2026-03-08
Milestone: M3

## Context

We want Lifecycle to react when an interactive harness session has finished a response without requiring the harness process itself to exit. Candidate reactions include tab-level indicators, window attention, dock badges, and audible alerts.

The current terminal lifecycle already emits coarse status events when a session is created, detached, finished, or failed, but those events model PTY lifecycle rather than assistant-turn completion.

## Learning

1. The existing `terminal:status-changed` path is sufficient for process exit, but it does not describe "assistant finished responding". Interactive Claude and Codex sessions usually remain alive after a response, so PTY completion and turn completion are different signals.
2. Prompt scraping from PTY bytes is the weakest option. It is ANSI-heavy, provider-specific, and easy to break on CLI updates, alt-screen behavior, or wording changes.
3. Provider-owned session stores are a stronger hook point than PTY output because both harnesses already persist structured JSONL records that survive renderer detach/reattach:
   - Codex session logs include structured `event_msg` records, including `task_complete` with `turn_id` and `last_agent_message`.
   - Claude session logs include `assistant` records whose `message.stop_reason == "end_turn"` when the assistant has completed a text turn.
4. The current frontend does not learn when `harness_session_id` is captured after launch. Rust persists that field asynchronously, but no terminal update event is emitted for it. Any frontend watcher keyed to `harness_session_id` would currently miss the moment the session becomes observable.
5. The workspace surface currently filters out `finished` and `failed` terminals before rendering tabs. Any tab-level completion affordance for terminal exit or post-response attention must stop dropping completed runtime tabs immediately.
6. The cleanest architecture is to keep provider parsing behind the existing harness provider boundary in Rust, emit a typed completion event, and let the React shell decide how to react.

## Recommended Design

1. Extend the harness provider boundary in `apps/desktop/src-tauri/src/capabilities/workspaces/terminal.rs` with provider-specific completion detectors that can resolve a session file path and parse appended JSONL records.
2. Start the detector only after `harness_session_id` is known. When session capture completes, emit a typed terminal metadata update event so the frontend and any observers see the captured session id without polling.
3. Add a new app event for semantic completion, for example `terminal:harness-turn-completed`, carrying:
   - `terminal_id`
   - `workspace_id`
   - `harness_provider`
   - `harness_session_id`
   - `turn_id` when the provider exposes one
   - provider-specific metadata needed for dedupe
4. Consume that event in the desktop shell, not inside terminal rendering code. The shell can then:
   - mark the terminal tab as needing attention
   - call `getCurrentWindow().requestUserAttention(...)`
   - set or clear dock badge counts
   - optionally play a short sound
5. Keep notification policy in app settings so users can choose per-action behavior such as:
   - none
   - mark tab only
   - mark tab and bounce dock
   - mark tab and play sound

## Milestone Impact

1. M3: makes harness terminals observable at the level users actually care about, not just process lifetime.
2. M3: keeps Claude/Codex specifics behind the provider boundary instead of leaking parser logic into React.
3. M5+: opens a clean path for richer workspace attention UX such as dock badges or unread-style runtime indicators.

## Follow-Up Actions

1. Emit a terminal metadata update event when `harness_session_id` changes.
2. Preserve completed runtime tabs long enough to show exit state and attention markers.
3. Prototype Codex completion detection first using `task_complete`, then add Claude `end_turn` handling with the same typed app event.
4. Add notification settings before enabling audible or attention-grabbing behavior by default.
