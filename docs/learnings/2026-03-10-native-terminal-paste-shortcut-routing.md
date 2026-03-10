# Native Terminal Paste Shortcuts Must Bypass Ghostty Key Translation

Date: 2026-03-10
Milestone: M3

## Context

The macOS native terminal surface was letting `Cmd+V` fall through the normal Ghostty key bridge. That was survivable for plain text clipboards, but a clipboard image could crash the app before the native `paste:` action ran.

## Learning

Native paste shortcuts are not ordinary terminal key input. In the embedded AppKit bridge, `Cmd+V` needs to dispatch through the native paste action first, then map clipboard content into the correct terminal insertion path.

For Lifecycle, that means:

- text clipboards still use Ghostty paste-style text input
- image clipboards must be persisted as workspace attachments and inserted provider-aware into the live terminal session
- the key bridge should remain reserved for real key events, not edit-command shortcuts carrying richer clipboard payloads

## Impact

- Native terminal image paste now follows the same attachment persistence contract the old browser terminal path used, without keeping that browser path alive as a product dependency.
- Clipboard image payloads no longer route through `ghostty_surface_key(...)`, which removes the crash path observed on `Cmd+V`.
- The bridge is closer to the AppKit contract where edit commands and terminal keystrokes are distinct surfaces.

## Follow-Up

- Review the remaining native edit shortcuts (`copy:`, `cut:`, `selectAll:`) to ensure they stay aligned with AppKit command routing instead of drifting back into the raw key path.
- If native attachment insertion expands beyond images, keep the backend insertion logic provider-aware so Codex and Claude continue receiving the expected payload form.
