# Harness Session Ownership Must Be Bound At Launch

Date: 2026-03-15
Milestone: M3

## Context

Lifecycle was assigning harness session ownership after launch by scanning provider session stores and matching discovered sessions back to terminals. That made prompt and completion routing depend on discovery timing instead of a durable launch contract.

## Learning

1. Terminal-to-session ownership is not a reconciliation problem in the steady state. It is a launch contract problem.
2. Claude should be launched with an explicit session id from the start, and future respawns should switch to resume once the session log exists.
3. Codex should run inside a terminal-owned `CODEX_HOME` so session files and runtime state live in an exclusive namespace from the moment the terminal record is created.
4. A terminal that needs post-launch discovery should only ever discover inside its own provider-owned scope. Global provider session stores are not an acceptable normal-path source of truth when multiple terminals share one workspace.
5. Frontend cache updates for harness session metadata need an explicit terminal update event. Session capture should not depend on incidental refetches.

## Milestone Impact

1. M3: same-provider harness terminals in one workspace now route prompt and completion activity deterministically because ownership is pinned before the provider session appears.
2. M3: Codex resume behavior is reproducible because the session scope is durable and keyed to the terminal/session lifecycle rather than the shared global home.

## Follow-Up Actions

1. If Codex exposes a documented launch-time session id flag for interactive mode, replace the temporary terminal-id scope with a direct session-id launch contract.
2. Consider persisting a terminal launch sequence for UI ordering so tab/history ordering is as deterministic as session ownership.
