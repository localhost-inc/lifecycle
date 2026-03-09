# Theming and Shadcn Readiness - 2026-03-04

## Context

We need frontend foundations that scale beyond `dark/light/system` into named IDE-style themes and remain reusable if we add a web app alongside desktop.

## Observation

- Desktop UI had no explicit theme model; styles were mostly hardcoded Tailwind color classes.
- There was no shared UI workspace package for tokens/utilities across apps.

## Decision

1. Introduce `@lifecycle/ui` under `packages/ui` as the shared UI foundation package.
2. Split theme model into:
   - `appearance`: `light | dark | system`
   - `preset`: named themes (`lifecycle`, `nord`, `monokai`, extendable)
3. Store shared tokens in `packages/ui/src/styles/theme.css` and consume from app CSS.
4. Keep shadcn adoption package-first: reusable primitives should land in `@lifecycle/ui` before app-local duplication.

## Impact on milestones

- M3 now includes UI foundation readiness tasks for theme architecture and shared UI packaging.
- Deferred agent workspace work plus M4/M6 can build operations and cloud UI on semantic tokens instead of one-off palette choices.

## Follow-up actions

1. Add initial shadcn primitives to `packages/ui` (`button`, `tabs`, `dialog`, `scroll-area`, `tooltip`).
2. Move remaining desktop hardcoded color utilities toward semantic token usage.
3. Add persisted organization-level theme preference in cloud mode (M6+).
