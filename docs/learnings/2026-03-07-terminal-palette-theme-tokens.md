# Terminal ANSI Palette Belongs In Theme Tokens

## Context

- Milestone: M3 terminal workspace
- Area: desktop terminal theming

## What Changed

The terminal surface background already came from shared theme tokens, but the ANSI palette and effective terminal text color still lived in `apps/desktop/src/features/terminals/terminal-theme.ts`.

We moved palette ownership into `packages/ui/src/styles/theme.css` via `--terminal-*` tokens and kept the TypeScript palette table only as a fallback. We also split `--terminal-foreground` from the app-wide `--foreground` token so light presets can tune reverse-video terminal UI separately from general app text. For light presets, the neutral ANSI slots now behave like light-theme surfaces and text instead of inheriting dark-theme assumptions:

1. `black` and `brightBlack` are light neutral surfaces.
2. `white` and `brightWhite` are dark neutral text colors.

That keeps harness prompts such as Claude Code from reading as a separate dark slab inside an otherwise light app surface.

## Why It Matters

Prompt chrome inside embedded tools is often drawn with ANSI colors or reverse-video text, not the terminal background color. If those colors are not theme-owned, the app background can match while command input rows still feel visually foreign.

Keeping the palette in theme tokens gives us one place to tune:

1. Terminal surface background
2. Terminal foreground used by reverse-video UI
3. Cursor color
4. ANSI prompt and status colors used by embedded tools

## Follow-up

1. If personalization grows, expose terminal palette tuning through named presets rather than per-color ad hoc controls.
2. Keep browser and native terminal paths reading the same resolved token set so theme regressions show up identically in both modes.
