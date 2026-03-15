## Context

We renamed the shell token model to `--background`, `--surface`, and `--card`, but several presets still behaved like inherited palette dumps rather than a consistent app hierarchy. Some dark presets had the shell and working plane inverted or nearly identical, and a few terminal palettes collapsed semantic lanes like blue, cyan, and green into the same color family.

## Learning

1. Every preset needs an explicit shell-depth hierarchy, not just renamed tokens.
   - `--background` is the outer shell plane.
   - `--surface` is the primary project/workspace/terminal plane.
   - `--card` is the nested or raised plane inside that surface.
2. Terminal theme design cannot be treated as only "16 ANSI colors."
   - Readability depends on the relationship between terminal foreground, surface background, and the distinguishability of ANSI semantic lanes.
3. Preset audits need contract tests, not just visual passes.
   - Theme tests now assert shell/surface/card separation and prevent blue/cyan and green/cyan collisions across all presets.

## Milestone Impact

1. M3: terminal and harness sessions now inherit a more stable cross-preset surface and palette contract.
2. M6: project/workspace shell chrome can rely on the same semantic layering across named themes without per-screen overrides.

## Follow-up Actions

1. Add a terminal-specific readability pass for dim/faint text if Ghostty-rendered secondary command text remains hard to read in lifecycle dark.
2. When new presets are added, require both a shell hierarchy review and a terminal lane review before merging.
