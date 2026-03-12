# Native Terminal Selection Must Catch Bridge Exceptions

Date: 2026-03-12
Milestone: M3

## Context

The macOS native terminal surface forwards text selection and highlighting through AppKit mouse callbacks in `apps/desktop/src-tauri/native/lifecycle_native_terminal.m`.

Keyboard and text insertion paths already wrapped Ghostty bridge calls in `@try/@catch`, but the mouse-selection path still called Ghostty directly from `mouseDown:`, `mouseDragged:`, `mouseUp:`, `mouseMoved:`, `mouseExited:`, `scrollWheel:`, and selection reads used by `copy:`.

## Learning

For the embedded native terminal, selection is part of the same crash boundary as keyboard input. If AppKit or Ghostty raises an `NSException` while the user is dragging to highlight text or reading the active selection, letting that exception escape the selector can terminate the whole desktop process.

The bridge needs the same exception containment on mouse/selection callbacks that it already applies to key and paste input:

- wrap Ghostty mouse position, mouse button, and mouse scroll calls in `@try/@catch`
- wrap selection reads used by clipboard actions in `@try/@catch`
- log the exception with terminal context so the diagnostics log identifies which native surface and callback failed

## Impact

- Native text highlighting failures now degrade into logged terminal input failures instead of crashing the entire app.
- Diagnostics capture which terminal and mouse callback threw, which narrows future Ghostty/AppKit investigations.
- The native terminal bridge is more internally consistent: keyboard, paste, and selection all treat Objective-C exceptions as recoverable bridge failures rather than process-fatal events.

## Follow-Up

- If diagnostics still show repeated selection exceptions, isolate whether the underlying Ghostty surface state is invalid during drag-selection or whether AppKit is dispatching an unexpected event ordering.
- Review any remaining direct Ghostty calls inside AppKit selectors and either justify them as non-throwing or wrap them with the same bridge diagnostics contract.
