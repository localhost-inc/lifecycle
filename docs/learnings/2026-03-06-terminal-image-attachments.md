# Terminal Image Attachments

- Date: 2026-03-06
- Milestone: M3 terminal workspace

## Context

Lifecycle embeds Codex and Claude inside an xterm surface. Native terminal CLIs can support image-aware input flows, but a browser-backed terminal does not automatically forward clipboard image data or Finder drag-and-drop image files into the PTY.

## Decision

Lifecycle now treats pasted and dropped images as workspace attachments:

- The desktop app captures image clipboard/drop events at the terminal host.
- Images are persisted into `WORKTREE/.lifecycle/attachments/`.
- Claude accepts saved image paths as ordinary pasted terminal text.
- Codex only upgrades saved image paths into real image attachments when they arrive through bracketed paste, so Lifecycle must emit Codex-specific bracketed-paste payloads instead of ordinary typed text.

## Impact

- This restores practical image input inside embedded harness sessions without depending on terminal-native binary attachment protocols.
- Codex now receives image attachments through the same paste classification path it uses in native terminals, including quoted paths that contain spaces.
- Theme, renderer, and PTY lifecycle remain separate from attachment persistence.

## Follow-up

- Add a visible drop affordance for terminal image attachments.
- Keep attachment insertion provider-aware. Codex and Claude do not treat pasted image paths the same way.
