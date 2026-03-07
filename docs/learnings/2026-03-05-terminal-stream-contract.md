# Terminal Stream Contract Before M3

## Context

The original M3 milestone doc mixed together several different concerns:

1. PTY byte streaming and terminal metadata events were treated as the same transport problem.
2. The local terminal story assumed detach/reattach after app restart, even though the local process supervisor lives inside Tauri and there is no daemon.
3. Harness integration overcommitted to fragile CLI-specific session internals.
4. The provider surface exposed only `openTerminal(...)`, which is too small for real terminal lifecycle management.

## Learning

The right contract for M3 is:

1. Use typed command calls for terminal control (`create`, `attach`, `write`, `resize`, `detach`, `kill`).
2. Use a dedicated ordered stream channel for PTY output and replay, not the generic store event bus.
3. Keep terminal metadata reactive through the desktop store, but keep raw PTY bytes outside reducer-driven query updates.
4. Scope local detach/reattach to the running desktop app session. App restart persistence is a daemon problem and should not be smuggled into M3.
5. Treat `harness_session_id` as optional opaque adapter metadata. Only require resume where a harness exposes a stable documented path.

## Milestone Impact

1. M3: terminal architecture becomes channel-based, store-aware, and local-first without pretending daemon semantics already exist.
2. M6: CLI attach/bridge work stays explicitly deferred instead of leaking into the desktop milestone.
3. M7: cloud terminal transport can slot in later without rewriting the terminal domain model.

## Follow-Up Actions

1. Expand the provider contract from `openTerminal(...)` to explicit terminal lifecycle methods before implementing PTY flows.
2. Add terminal metadata events to `apps/desktop/src/store/events.ts` and terminal hooks alongside a dedicated attachment stream.
3. Define the Rust terminal supervisor around bounded replay buffers and ordered chunk streaming, not line-based events.
