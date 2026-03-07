# Native Terminal Theme Ownership

- Date: 2026-03-07
- Milestone: M3 terminal workspace

## Context

The macOS native terminal host embedded Ghostty above the Tauri webview, but the visual theme contract stopped at the React shell. Browser-backed terminals resolved Lifecycle design tokens into their terminal palette, while the native path only received a light/dark appearance flag and also loaded Ghostty's user config from disk.

## Learning

The native embed needs app-owned theme inputs, not terminal-app defaults. Loading Ghostty's default config files leaks user Ghostty window padding and palette choices into Lifecycle, which makes the terminal feel visually detached from the app and can introduce padding or background colors the app did not choose.

## Impact

M3 native terminal hosting now needs a small theme bridge:

1. Shared semantic terminal surface tokens must live in the app theme layer.
2. The native terminal sync contract must carry the resolved terminal background color, not only `light|dark`.
3. The embedded Ghostty surface should start from Lifecycle-owned defaults and receive explicit surface overrides instead of inheriting user Ghostty UI config.

## Follow-up

1. Extend the native bridge beyond background color to cover font family and any other app-owned terminal presentation settings.
2. Decide whether the browser and native terminal paths should share a richer semantic token set for selection and cursor colors, not only the background.
