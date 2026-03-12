# Native Terminal Platform Details Must Stop at the Adapter Boundary

Date: 2026-03-12
Milestone: M3

## Context

Lifecycle already treats native libghostty as the only local terminal runtime, but the Rust side still leaked some macOS embed concerns into shared terminal code. The terminal capability had to know about webview extraction and pointer-shaped sync calls, while the adapter facade file also carried macOS-only resource lookup and AppKit bridge setup.

## Learning

The native terminal seam should be explicit and boring:

1. A platform-neutral facade owns the terminal sync and lifecycle API the app calls.
2. Platform modules such as `macos` and `unsupported` own resource discovery, FFI structs, AppKit bridge details, and webview extraction.
3. Shared terminal capability code should pass typed sync data, not raw view pointers or platform-specific bridge concerns.

This keeps platform expansion cheap later without forcing speculative cross-platform abstractions now.

## Impact

- The app-facing terminal contract stays unchanged while the macOS embed path becomes an internal adapter detail.
- Adding a future platform implementation can happen behind the same facade instead of rewriting the terminal capability layer.
- Unsupported platforms keep a clear stub path without shaping the macOS implementation.

## Follow-Up

- If Linux native hosting becomes a scheduled milestone, add a dedicated platform module behind the existing facade instead of broadening the shared terminal capability contract.
- Keep future native terminal work focused on the facade boundary first whenever a new platform-specific requirement appears.
