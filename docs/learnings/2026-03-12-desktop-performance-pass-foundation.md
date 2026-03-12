# 2026-03-12 Desktop Performance Pass Foundation

## Summary

This pass established the desktop performance foundation around the local workspace route instead of trying to micro-optimize isolated widgets.

The main shifts were:

- workspace route boot now starts from a single `get_workspace_snapshot` read model instead of separate initial reads for workspace, services, and terminals
- inactive heavy workspace panels now unmount instead of staying mounted behind hidden tabs, while preserving minimal per-tab view state (`scrollTop`)
- expensive git polling is now gated by the active Git surface and by document visibility
- SQLite-backed workspace reads now run on an explicit blocking boundary in Tauri and emit internal timing diagnostics in debug builds
- route and panel boundaries now lazy-load heavier document surfaces, including the workspace panel shell, patch viewer body, and markdown renderer

## Measured Baseline

- Previous desktop production build baseline before this pass:
  - main app chunk: `1,386.15 kB`
  - gzip: `423.34 kB`
- Current desktop production build after this pass:
  - main app chunk: `676.40 kB`
  - gzip: `212.70 kB`

The largest moved costs now sit behind lazy boundaries instead of the base route:

- `workspace-panel`: `140.61 kB`
- `git-patch-viewer-body`: `332.67 kB`
- `markdown-file-renderer`: `138.56 kB`

## Why This Direction Held

The biggest win came from reducing always-on work:

- fewer initial Tauri round-trips for the workspace route
- fewer mounted heavy surfaces competing for render and memory
- less polling churn from history and pull-request tabs the user is not looking at
- no synchronous SQLite work on the async command lane for workspace read models

This is a better long-term shape than incremental memoization because it removes work instead of trying to cache around it.

## Milestone Impact

- Reinforces M5 workspace lifecycle responsiveness by making local workspace state cheaper to load and refresh
- Improves the desktop shell foundation needed for later M6 observability work because timings now exist at the read-model and lifecycle phase boundaries

## Follow-Up Actions

- Split remaining large syntax/highlighter payloads out of the base app chunk; the current main chunk is materially smaller but still larger than ideal
- Extend timing diagnostics to more lifecycle mutations beyond the current create/start phase coverage if future SLO work needs deeper attribution
- Consider priming any remaining detail queries from the snapshot cache if new consumers reintroduce route fan-out
