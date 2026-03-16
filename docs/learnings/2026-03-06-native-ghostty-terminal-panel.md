# Native Ghostty is the right terminal panel for macOS, but it is a host integration not a renderer swap

Date: 2026-03-06
Milestone: M3

## Context

The browser-backed terminal path remained materially worse than native terminals even after switching to `ghostty-web`, fixing replay duplication, fixing split UTF-8 decoding, and tightening font/rendering policy. Codex startup in particular was noticeably faster in native Ghostty than in the app, which pointed at the webview/IPC path rather than the CLI itself.

We needed to answer a narrower question than the original `libghostty` evaluation: if terminal quality is the product requirement on macOS, what is the smallest architecture change that gets us there without rewriting the rest of the desktop shell?

## Learning

1. `libghostty` is viable for Lifecycle on macOS only if we treat it as a native terminal host, not as a replacement parser inside the existing browser renderer.
2. Tauri can support that model by keeping the React tab shell in the `WKWebView` and mounting a native Ghostty `NSView` above it. The DOM layer measures geometry and focus state; the native view owns rendering, input, IME, selection, clipboard, and the terminal child process.
3. The existing Rust PTY supervisor should not shape the desktop product path once native Ghostty is the terminal host. On macOS, Ghostty owns the local session process lifecycle directly, and any future browser fallback should return only as a separate contract.
4. GhosttyKit needs explicit macOS build wiring:
   - compile the Objective-C bridge inside the Tauri crate
   - link `IOSurface` in addition to AppKit/Metal/QuartzCore and related frameworks
   - align the desktop app deployment target with the GhosttyKit slice (`macOS 13.0` in this integration)
5. The right abstraction boundary is now "terminal surface host" rather than "browser renderer." The desktop app can keep the existing tab/workspace UI while swapping the terminal panel implementation by platform.

## Decision

For M3 local terminals on macOS, Lifecycle should use a native Ghostty terminal panel hosted inside the Tauri window.

Current stance:

1. macOS Tauri builds require the native Ghostty panel; missing GhosttyKit is a build failure, not a product fallback.
2. Browser terminal hosting is not part of the current desktop product path.
3. The rest of the desktop shell remains React/Tauri for now; only the terminal panel becomes native.

## Impact

1. Terminal rendering quality, input latency, and startup behavior on macOS can improve without forcing a full native UI rewrite.
2. Terminal lifecycle code no longer needs to carry a product browser-terminal compatibility path alongside the native desktop host.
3. M3 docs must describe a native-first desktop terminal architecture instead of a browser-only PTY client.

## Follow-up

1. Validate the native panel interactively in the desktop app for focus, tab switching, window resize, clipboard, and IME behavior.
2. If a browser fallback ever returns, reintroduce it as an isolated contract instead of letting it shape the native desktop architecture by default.
3. If remote/shared terminals arrive later, keep the shared text transport independent from the local macOS-native host implementation.
