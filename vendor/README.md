# Vendor Pins

`vendor/ghostty.lock` is the source of truth for the pinned Ghostty revision used to build `GhosttyKit.xcframework` for the desktop app.

The lock file tracks:

1. The upstream repository URL.
2. The exact commit Lifecycle builds against.

Materialized source checkouts and built framework outputs stay under `apps/desktop/src-tauri/.generated/ghostty/`; `vendor/` only stores the pin metadata.
