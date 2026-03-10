# Prescriptive Lifecycle Manifest Direction - 2026-03-10

## Context

The repo had no checked-in `lifecycle.json`, and the natural shortcut was to model local development as a single broad runner like `bun run dev`.

That would mirror how this monorepo is commonly launched today, but it would also collapse Lifecycle's execution model into one opaque process group too early.

## Learning

Lifecycle should stay prescriptive about service execution.

1. `lifecycle.json` is the canonical definition of long-lived services.
2. Combined environment logs are a derived UI, not the execution primitive.
3. A broad runner like `bun run dev` can remain a fallback mode later, but it should not define the main product model.
4. The local workspace should prefer explicit service entries that Lifecycle can start, stop, health-check, preview, and eventually share independently.

Applied to this repo:

1. `desktop-web` is modeled as the previewable Vite dev server on port `1420`.
2. `worker` is modeled as the scaffold HTTP service on port `8787`.
3. We intentionally do not launch `tauri dev` from inside the repo manifest because that would recursively spawn the desktop shell rather than define a previewable app service boundary.

## Milestone Impact

1. M4: keeps environment controls aligned with explicit `workspace_service` records instead of an opaque top-level dev script.
2. M4: makes local preview testing possible immediately through concrete service ports and health checks.
3. M6: preserves cloud parity because the same service graph can map onto cloud execution later.

## Follow-Up Actions

1. Add environment-wide aggregated logs in the right rail on top of explicit service supervision.
2. Revisit stable local preview URLs if we adopt a port-abstraction layer like `portless`.
3. Consider a clearly-labeled limited-capability fallback mode for unsupported repos that only expose a broad runner command.
