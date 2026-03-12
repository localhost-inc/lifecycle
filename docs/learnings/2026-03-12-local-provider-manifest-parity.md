# 2026-03-12 Local Provider Manifest Parity

## Summary

The repo exposed two different kinds of lifecycle drift at once:

- the checked-in `lifecycle.json` had drifted from the canonical manifest contract (`health_check.type` instead of `health_check.kind`)
- the shared `@lifecycle/runtime` local provider had drifted from the current Tauri command surface (`manifest_fingerprint` missing on start, no destroy wiring, and `wake()` lacking the manifest payload required to restart services)

The practical result was that the repo could look healthy in ad hoc local use while still being unreliable as Lifecycle's own guinea-pig workspace.

The fix was to treat the manifest and provider boundary as one contract:

- repo manifests must validate against the same parser/schema the product uses
- local create/start/wake flows must carry the exact manifest content plus `manifest_fingerprint`
- local provider methods should delegate to the real Tauri commands instead of leaving M4 lifecycle behavior stubbed

## Milestone Impact

- Reinforces M4 local workspace lifecycle reliability by keeping manifest parsing, workspace service seeding, and restart flows on the same contract
- Reduces false-negative environment failures when a service is reachable on `localhost` but not on `127.0.0.1`

## Follow-Up Actions

- Add an automated repo-level check that parses the checked-in root `lifecycle.json` during CI so manifest drift is caught before manual dogfooding
- Keep `WorkspaceProvider` docs and runtime types updated in the same change whenever the Tauri lifecycle commands add required manifest fields
- Finish the remaining event-model parity work so preview metadata stays current without requiring snapshot invalidation
