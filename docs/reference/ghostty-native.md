# Native Ghostty

Canonical contract for Ghostty integration in the renewal macOS app.

## Scope

This document covers the native Ghostty boundary for [apps/desktop-mac](/Users/kyle/dev/lifecycle/apps/desktop-mac).

It does not describe the TUI VT parser path. The TUI's `libghostty-vt` usage is a separate dependency and must not shape the native macOS embedding contract.

## Ownership

The renewal app owns Ghostty directly:

1. `apps/desktop-mac` is the authoritative `libghostty` consumer.
2. `apps/desktop-legacy-do-not-touch` is legacy reference material only and must not remain a dependency of the renewal app.
3. Native Ghostty hosting code lives in [apps/desktop-mac/Sources/LifecycleGhosttyHost](/Users/kyle/dev/lifecycle/apps/desktop-mac/Sources/LifecycleGhosttyHost).

## Pinning

`vendor/ghostty.lock` is the single source of truth for the upstream Ghostty repository and commit Lifecycle builds against.

Rules:

1. Bump the lock file to update Ghostty.
2. Do not pin Ghostty independently inside `apps/desktop-mac`.
3. Treat the upstream embedding API as unstable until proven otherwise; document any relied-on behavior in this repo when upgrading.

## Materialization

The Swift app owns its generated Ghostty artifacts.

Paths:

1. Bootstrap script: [apps/desktop-mac/scripts/prepare-ghosttykit.sh](/Users/kyle/dev/lifecycle/apps/desktop-mac/scripts/prepare-ghosttykit.sh)
2. Generated checkout: [apps/desktop-mac/.generated/ghostty/source](/Users/kyle/dev/lifecycle/apps/desktop-mac/.generated/ghostty/source)
3. Built framework: [apps/desktop-mac/.generated/ghostty/GhosttyKit.xcframework](/Users/kyle/dev/lifecycle/apps/desktop-mac/.generated/ghostty/GhosttyKit.xcframework)

Rules:

1. Generated Ghostty artifacts are disposable build outputs.
2. The generated source checkout must not become the canonical place to edit Ghostty behavior.
3. `Package.swift` should only link against the app-owned `GhosttyKit` path.

## Runtime Boundary

Ghostty is a rendering and terminal-hosting primitive, not a workspace model.

The boundary is:

1. `bridge` owns terminal session, terminal record, and terminal connection contracts.
2. `desktop-mac` owns canvas, group, and surface state.
3. A terminal surface binds to a bridge terminal id.
4. The native Ghostty host renders that surface and connects using bridge-provided runtime information.

Clients must not:

1. infer terminal semantics from old Tauri codepaths
2. synthesize host policy from Ghostty details
3. treat Ghostty as the authority for canvas structure

## Integration Rules

1. Keep Ghostty-specific Objective-C and C glue behind the `LifecycleGhosttyHost` boundary.
2. Swift surface code should consume typed terminal surface data, not raw Ghostty FFI details.
3. When Ghostty behavior changes, prefer updating the host boundary once instead of spreading workarounds through the canvas or bridge layers.

## Verification

After changing the Ghostty pin or host integration:

1. run `./apps/desktop-mac/scripts/prepare-ghosttykit.sh`
2. run `./apps/desktop-mac/scripts/build.sh`
3. verify the packaged app launches and mounts a terminal surface
