# Native Terminal AppKit Selectors Need Their Own Exception Boundary

Date: 2026-03-12
Milestone: M3

## Context

The native terminal bridge already wrapped some Ghostty key and mouse calls in `@try/@catch`, and a follow-up selection hardening pass added wrappers around drag-selection primitives.

Text highlighting could still terminate the app because AppKit selector entry points such as `mouseDown:`, `copy:`, focus synchronization, IME positioning, and preedit updates still reached Ghostty or adjacent Cocoa APIs without a selector-level exception boundary.

## Learning

For the embedded native terminal, the crash boundary is not just "individual Ghostty C calls that seem risky." It is the full AppKit selector path that owns native terminal interaction.

That means:

1. Selector-exposed Ghostty calls such as focus sync, key binding lookup, key release, preedit updates, IME point reads, and selection cleanup need the same logging and containment as the original key path.
2. Selection-related selectors such as `mouseDown:` and `copy:` should catch Objective-C exceptions around the whole selector body, not only the direct Ghostty call, because responder changes, coordinate conversion, and pasteboard work are part of the same user-visible failure boundary.
3. The native terminal facade should treat "highlight text" as a composed operation that spans mouse events, focus, selection reads, and clipboard cleanup.

## Impact

1. Selection and highlight failures are less likely to escape the bridge as process-fatal Objective-C exceptions.
2. Diagnostics now capture more precise context for selector-level failures, which makes future upstream Ghostty/AppKit investigations easier.
3. Future platform adapters should start from a full native-host exception boundary rather than only wrapping obvious input primitives.

## Follow-Up

1. If highlighting still crashes after selector-level containment, treat that as evidence of a non-Objective-C fault boundary such as a native memory bug or invalid Ghostty surface lifecycle.
2. When a Linux native host exists, mirror this boundary at the platform adapter edge instead of repeating macOS-specific assumptions in shared terminal code.
