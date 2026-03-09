# Rust Backend Internal Boundaries

## Context

The Tauri Rust backend had accumulated a few oversized files where multiple responsibilities were living behind one module boundary:

1. `apps/desktop/src-tauri/src/capabilities/workspaces/terminal.rs`
2. `apps/desktop/src-tauri/src/capabilities/workspaces/title.rs`
3. `apps/desktop/src-tauri/src/platform/git/status.rs`

That made behavior-preserving cleanups expensive because persistence, subprocess execution, parsing, native-surface bridging, and workflow logic were intertwined.

## Learning

1. Internal submodules are the right cleanup tool when the public Tauri command surface must stay stable.
2. The useful boundary is not “one file per public capability”; it is “one file per side-effect class” inside a capability.
3. For terminal work, persistence, native-surface bridging, and attachment naming are stable internal seams even when command behavior stays unchanged.
4. For git work, one shared subprocess runner plus one shared `-z` record cursor removes a large amount of duplication without changing adapter contracts.

## Milestone Impact

1. M3: terminal lifecycle work is easier to extend because native-surface and persistence helpers no longer have to evolve inside one monolithic file.
2. M4: workspace lifecycle controls can keep adding terminal and title behavior without reintroducing backend duplication at the command layer.

## Follow-up

1. If harness observer logic keeps growing, split it out of `workspaces/terminal.rs` next using the same internal-module pattern.
2. If more rusqlite-heavy capability modules start repeating query/update shapes, introduce a tiny shared repository helper layer rather than copying more DB plumbing.
