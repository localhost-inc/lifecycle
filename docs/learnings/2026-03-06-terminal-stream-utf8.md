# terminal PTY reads need streaming UTF-8 decoding

Date: 2026-03-06
Milestone: M3

## Context

After fixing terminal replay duplication on tab reattach, some separator and box-drawing glyphs still rendered as replacement characters (`�`) in the desktop terminal.

## Learning

The corruption was happening before the renderer saw the text:

1. The PTY reader was decoding each raw `read()` buffer independently with `String::from_utf8_lossy`.
2. Terminal output regularly contains multibyte UTF-8 characters.
3. A single glyph can be split across two PTY reads.
4. Per-chunk lossy decoding turns those split sequences into replacement characters even though the combined byte stream is valid.

The correct model is streaming decode with a pending-byte buffer:

1. Append new PTY bytes to a small carry buffer.
2. Decode only the valid UTF-8 prefix.
3. Preserve incomplete trailing bytes for the next read.
4. Only fall back to replacement characters for genuinely invalid sequences.

## Decision

Keep terminal output transport as UTF-8 text, but decode the PTY stream incrementally instead of decoding each raw read in isolation.

## Impact

1. Prevents box-drawing and other multibyte glyphs from randomly turning into `�`.
2. Removes a class of renderer false positives that looked like Ghostty Web rendering bugs but were actually transport corruption.
3. Makes the terminal stream contract closer to what a native terminal expects from the upstream byte stream.

## Follow-up

1. Reload the desktop app and validate the previously corrupted separators in live Claude/Codex sessions.
2. If glyph issues remain after reload, inspect font coverage and Ghostty Web canvas shaping next.
3. Preserve this streaming decode behavior if terminal transport moves or gets refactored; raw PTY reads are not text-safe boundaries.

## Sources

1. Repo implementation:
   - `apps/desktop/src-tauri/src/platform/runtime/terminal.rs`
