# Titlebar Bleed Pattern for Desktop - 2026-03-04

## Context

We want a Conductor/VSCode-like visual where sidebar chrome bleeds into the top app bar area while keeping native window controls.

## Observation

Using default decorated windows keeps native titlebar styling separate from app content, so theme tokens cannot visually extend into the top chrome region.

## Decision

1. Use macOS titlebar overlay mode in Tauri (`titleBarStyle: Overlay`, `hiddenTitle: true`).
2. Render a custom top strip in the webview with:
   - left segment width matching sidebar (`w-64`) and `var(--panel)` background
   - right segment using main surface token (`var(--background)`)
3. Mark the strip as draggable via `data-tauri-drag-region`.
4. Keep native traffic lights (do not disable decorations).

## Impact on milestones

- M3 desktop shell now has theme-aware top chrome structure that can host terminal-level navigation controls.
- Deferred agent workspace navigation can extend into the same top chrome without reworking the window model.
- M7 org theming can extend into top chrome by changing semantic tokens only.

## Follow-up actions

1. Add real back/forward/workspace controls into the right side of the title strip.
2. Add platform-specific spacing polish for non-macOS if needed.
3. Evaluate full custom window chrome (`decorations: false`) only if native-control constraints block desired UX.
