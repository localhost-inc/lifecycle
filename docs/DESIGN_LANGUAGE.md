# Design Language

Component-level rules for building Lifecycle UI. These encode the visual system defined in [BRAND.md](./BRAND.md) into concrete implementation guidance.

All tokens referenced below are CSS custom properties defined in `packages/ui/src/styles/theme.css`.

## Surfaces & Containers

- Zero border radius on all elements — buttons, inputs, cards, modals, badges, tooltips
- Thin 1px borders using `var(--border)` for structure — never shadows
- No box shadows, no drop shadows, no elevation — use borders and background shifts only
- Cards use `var(--card)` bg with 1px border — bordered containers, not floating surfaces
- Panels use `var(--panel)` bg for recessed/secondary regions

## Buttons

- Primary: `var(--primary)` bg, `var(--primary-foreground)` text
- Secondary: `var(--muted)` bg, `var(--foreground)` text
- Outline: transparent bg, 1px `var(--border)` border
- Destructive: `var(--destructive)` text, no fill by default
- Ghost: transparent bg, no border — text only
- No rounded corners, no pill shapes, no gradients

## Form Controls

- Inputs/selects: 1px `var(--border)` border, transparent bg, placeholder in `var(--muted-foreground)`
- Toggles/switches: monochrome — `var(--primary)` track when on, `var(--border)` track when off
- Segmented controls: 1px bordered container, active segment gets `var(--primary)` fill
- Checkboxes: square (zero radius), `var(--primary)` fill with `var(--primary-foreground)` check when active

## Data Display

- Tables: thin horizontal rules using `var(--border)`, no zebra striping, no cell borders
- Badges/tags: 1px `var(--border)` border, no fill by default, small text
- Charts: flat fills, no 3D effects, minimal gridlines, monochrome with one functional accent

## Feedback & Status

- Status dots (green/amber/red) — small, functional, never decorative
- Error states: `var(--destructive)` border or text, not red backgrounds
- Empty states: centered layout — icon + heading + description + single action

## Interaction States

- Hover: `var(--surface-hover)` background shift — no shadows
- Selected/active: `var(--surface-selected)` bg or solid `var(--primary)` fill
- Focus: `var(--ring)` outline, offset from element, no glow
- No color/background transitions longer than 150ms
