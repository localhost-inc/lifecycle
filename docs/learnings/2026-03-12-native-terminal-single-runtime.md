# Native Terminal Runtime Must Stay Single-Path

Date: 2026-03-12
Milestone: M3

## Context

Lifecycle originally moved to a native libghostty terminal host, but parts of the Rust runtime, provider contract, and docs still described a PTY fallback path with attach, write, resize, and replay semantics.

## Learning

Once libghostty is the only supported local terminal runtime, keeping a second PTY-oriented contract around is actively misleading. It suggests recovery paths, error reasons, and transport semantics that the product no longer supports, which makes terminal bugs harder to reason about and encourages new code to target the wrong abstraction.

The desktop terminal contract needs to stay explicit:

1. One authoritative local runtime path: native libghostty sessions.
2. Typed lifecycle operations for session creation, detach/hide, and kill.
3. Surface synchronization for geometry, visibility, focus, and theming.
4. No fallback PTY supervisor API, replay cursor contract, or PTY-specific failure codes in public types.

## Impact

- Local terminal behavior is now described and implemented as a native-session lifecycle, not as a stream attachment protocol.
- Failure catalogs and provider interfaces no longer imply a legacy PTY fallback that does not exist.
- Future terminal work can focus on native surface behavior without preserving dead compatibility seams.

## Follow-Up

- If cloud or remote terminal transport is introduced later, model it as its own authoritative provider contract instead of reviving the removed local PTY API surface.
- Keep future terminal docs anchored to native libghostty semantics first, then add provider-specific extensions only where the implementation truly differs.
