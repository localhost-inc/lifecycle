# Terminal Tool Output Needs A Dedicated Faint Token

## Context

- Milestone: M3 terminal workspace
- Area: desktop terminal theming

## What Changed

We added `--terminal-faint-opacity` to every theme preset and threaded it through the native terminal theme payload into Ghostty's `faint-opacity` setting.

The terminal theme contract already covered:

1. Background
2. Foreground
3. Selection colors
4. Cursor color
5. ANSI palette

That was not enough for embedded agent terminals because tool summaries and secondary status lines often render with terminal faint/dim styling instead of using the ANSI palette directly.

## Why It Matters

Changing ANSI colors alone does not fix low-contrast tool output. If dim text is too faint, command summaries, file-path trails, and secondary metadata become the first thing to fall below the readability bar in dark themes.

Owning faint opacity in theme tokens lets each preset tune that lane independently while keeping browser and native terminal surfaces aligned.

## Follow-up

1. If tool-command diff blocks still look off after faint tuning, inspect whether the agent CLIs are emitting truecolor styles that bypass the 16-color ANSI palette.
2. Keep terminal readability reviews focused on the whole contract: surface, foreground, faint, selection, cursor, and ANSI lanes together.
