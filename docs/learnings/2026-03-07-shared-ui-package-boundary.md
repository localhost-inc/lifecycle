# Shared UI Package Boundary - 2026-03-07

## Context

The desktop app had started to accumulate duplicate UI primitives and thin re-export shims while `packages/ui` only owned theme tokens and a small utility surface. That made basic controls like buttons, alerts, tabs, status dots, and selectors diverge between settings, git, terminals, and workspace surfaces.

## Learning

The durable package boundary is:

1. `packages/ui` owns generic primitives, shared widgets, and theme state (`Button`, `Input`, `Select`, `Tabs`, `ToggleGroup`, `Alert`, `Card`, `Badge`, `StatusDot`, `SetupProgress`, `ThemeProvider`, `ThemeSelector`).
2. `apps/desktop` owns domain composition, shell layout, runtime surfaces, resizers, and feature-specific state machines.
3. Theme persistence and DOM dataset sync belong in the shared package, while Tauri-native window chrome sync stays in the desktop app.
4. Feature rows and panels should map domain state onto shared primitives instead of reimplementing styling inline.
5. Re-export shims are short-lived migration tools at most; once a feature imports the real implementation directly, the shim should be deleted.

## Milestone Impact

1. M3: terminal and workspace surfaces now share the same primitive vocabulary without forcing a shell-level rewrite.
2. M5: service/runtime status presentation can evolve on top of shared badges and status dots instead of duplicating variants per feature.
3. M6: CLI-centric flows and future web surfaces can reuse the same theme/provider contract and primitive set from `packages/ui`.

## Follow-Up Actions

1. Keep future reusable controls in `packages/ui` first, then compose them inside `apps/desktop`.
2. Add shared UI tests alongside every new primitive or widget so visual contract drift is caught before feature adoption.
3. Continue trimming remaining feature-local styling helpers when they collapse to direct shared primitive usage.
