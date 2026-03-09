# Event Foundation Docs First

Date: 2026-03-09
Milestone: Cross-milestone foundation with immediate M3 and M6 impact

## Context

The repo had started to mix several different ideas under the word "event":

1. authoritative lifecycle facts
2. transport-specific Tauri or store notifications
3. command hooks
4. PTY or log streaming
5. derived activity and usage records

That drift was already showing up across milestone and backlog docs, which made the future event foundation harder to reason about before it existed in code.

## Learning

The durable documentation model is:

1. Clean up the source-of-truth docs before expanding the implementation.
2. Treat commands, fact events, streams, hooks, and projections as separate product concepts.
3. Make `docs/reference/events.md` a forward-looking v1 contract, not a mixed reference-plus-rollout note.
4. Keep the docs focused on the canonical model rather than preserving transport-local or legacy adapter names.
5. Treat activity, audit, and usage as downstream projections over canonical facts and command outcomes.
6. Treat the event foundation as a semantic notification layer with replay and refetch rules, not as an implied full event-sourcing guarantee.

## Milestone Impact

1. M3: terminal docs now describe semantic terminal facts separately from PTY transport.
2. M6: cloud activity is framed as a projection over canonical facts instead of a competing event model.
3. Backlog agent workspace: future agent work now has a single event vocabulary to plug into.

## Follow-Up Actions

1. Add canonical event and hook types to `packages/contracts`.
2. Route provider-owned publishers through one event foundation path in runtime code.
3. Make the desktop store consume canonical facts rather than define its own lifecycle model.
4. Teach consumers to dedupe by event id and refetch authoritative state on unknown versions or suspected gaps.
