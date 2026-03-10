# Tailwind Workspace Source Registration

## Context

The desktop app was importing shared React components from `packages/ui`, but Tailwind v4 was only scanning the desktop app's local source tree. Utility classes used inside `packages/ui` therefore did not always make it into the desktop CSS bundle, which left loading indicators like the harness-turn spinner visibly static even though the React state and markup were correct.

## Learning

1. In this monorepo, consuming apps must explicitly register shared workspace packages as Tailwind sources when those packages emit Tailwind utility classes.
2. `@import "tailwindcss";` is not enough by itself for workspace-package utilities; the app also needs an `@source` entry that covers the shared package path.

## Milestone Impact

1. M3: harness session tabs render the expected in-progress loading motion during active turns.
2. Shared UI utilities from `packages/ui` can now ship correctly in the desktop app without component-specific workarounds.

## Follow-Up

1. Keep `apps/desktop/src/main.css` registering `packages/ui/src` as a Tailwind source unless the shared UI consumption model changes.
2. When additional apps consume `packages/ui` source directly, give each app an explicit Tailwind `@source` entry for the shared package instead of assuming auto-discovery will cross workspace boundaries.
