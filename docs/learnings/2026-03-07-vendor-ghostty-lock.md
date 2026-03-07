# Ghostty Pin Ownership Lives In vendor/

## Context

- Milestone: M3 terminal workspace
- Area: desktop native terminal dependency management

## What Changed

The Ghostty revision used to build `GhosttyKit.xcframework` was hardcoded directly inside `scripts/prepare-ghosttykit.sh`.

We moved that pin into `vendor/ghostty.lock` and made the bootstrap path read from that file. `apps/desktop/src-tauri/build.rs` now watches the lock file so Cargo rebuilds when the upstream pin changes.

## Why It Matters

The pin is now a repository-level dependency contract instead of an implementation detail buried in a script.

This keeps the mental model cleaner:

1. `vendor/` stores upstream pin metadata.
2. `.generated/` stores materialized source and build outputs.
3. Bootstrap logic reads the pin instead of defining it.

## Follow-up

1. Consider making native dependency bootstrap an explicit developer command so `build.rs` only consumes an existing local artifact.
2. If we add more native upstream pins, keep them alongside `vendor/ghostty.lock` instead of spreading versions across scripts.
