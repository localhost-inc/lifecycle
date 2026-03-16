Date: 2026-03-15
Milestone: M4

## Context

The macOS desktop app had a valid cached `GhosttyKit.xcframework`, but the Tauri build still re-entered the bootstrap path before checking that cache. A transient `xcrun` or `xcodebuild` failure during app relaunch could therefore rebuild the app without `has_ghosttykit`, which turned every terminal attach into `native terminal runtime is unavailable`.

## Learning

1. Native dependency caches have to be resolved before any bootstrap or toolchain-health probe that is only needed for rebuilding the artifact.
2. For the macOS desktop app, GhosttyKit is part of the product contract, not an optional enhancement. If the build cannot produce or reuse it, the build must fail.
3. Silent fallback from a cached native runtime to an unsupported stub is worse than a build failure because it lets persisted workspace state boot into a broken shell with misleading terminal errors.

## Milestone Impact

1. M4 local workspace relaunches stay on the same native-terminal contract instead of flipping to a non-native build after a transient toolchain hiccup.
2. M4 terminal restart behavior is easier to reason about because build-time availability and runtime session recovery are no longer conflated.

## Follow-Up Actions

1. Keep the GhosttyKit cache validation lightweight so relaunches do not depend on live Metal toolchain downloads.
2. If the native dependency bootstrap grows more complex, move it behind an explicit developer command instead of letting build-time fallback logic decide product behavior.
