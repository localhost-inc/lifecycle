# Terminal Session History Surface - 2026-03-08

## Context

The workspace UI already persisted every `terminal` row, including `harness_session_id`, but the center panel only rendered live runtime tabs. Once a session finished or failed, the user lost all in-app discoverability of that history unless they manually remembered and retyped a harness session id.

## Learning

The durable contract is:

1. Terminal session history should render from the existing workspace-scoped `terminal` query, not from a second history store or a tab-local cache.
2. The center panel remains the right place for session history because it already owns runtime-tab discovery and launch controls.
3. History ordering and tab ordering are different concerns:
   - runtime tabs can stay oldest-to-newest so the newest tab lands on the right edge
   - session history should stay newest-first so recent sessions are immediately visible
4. Resume actions should only appear for finished harness sessions that already have a persisted `harness_session_id`; do not invent synthetic resume ids or fallback heuristics in the UI.

## Milestone Impact

1. M3: users can review recent terminal sessions and resume stored harness sessions without leaving the workspace surface.
2. Backlog agent workspace: future agent-session history can reuse the same "existing persisted rows power the history UI" rule without coupling to terminal-tab state.

## Follow-Up Actions

1. If session history grows large, add panel-local filtering before introducing new persistence or server-side search.
2. If shell/session replay across app restarts becomes a requirement, solve it in the runtime host boundary rather than by stretching the UI history surface into process persistence.
