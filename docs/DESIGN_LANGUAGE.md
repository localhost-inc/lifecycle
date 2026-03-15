# Design Language

Component-level rules for building Lifecycle UI. These encode the visual system defined in [BRAND.md](./BRAND.md) into concrete implementation guidance.

All tokens referenced below are CSS custom properties defined in `packages/ui/src/styles/theme.css`.

## Surfaces & Containers

- Radius scale: `--radius-xs` (2px), `--radius-sm` (4px), `--radius` (6px), `--radius-md` (8px), `--radius-lg` (10px), `--radius-xl` (12px), `--radius-2xl` (18px), `--radius-3xl` (24px). Cards and buttons use `rounded-xl` (12px), inputs use `rounded-lg` (10px), badges use `rounded-full`.
- Thin 1px borders using `var(--border)` for structure
- Shadows reserved for floating affordances only — tabs use `var(--tab-shadow)`; general surfaces use borders and background shifts
- Cards use `var(--card)` bg with 1px border — bordered containers, not floating surfaces
- Primary project/workspace/terminal planes use `var(--surface)`
- Shell chrome uses `var(--background)` for the backmost app frame; project sidebars use `--sidebar-background`; page-tab rails and similar durable project chrome use `--surface`
- Active content bodies stay on `var(--surface)`; do not add extra filled chrome bands inside the active body unless the surface actually changes scope

## Buttons

- Default: `var(--muted)` bg, `var(--foreground)` text
- Secondary: 1px border, transparent bg, `var(--muted-foreground)` text
- Outline: 1px border, transparent bg, `var(--foreground)` text
- Ghost: transparent, no border
- Destructive: 1px `var(--destructive)` border, `var(--destructive)` text
- White: white bg, black text (dark brand surfaces)
- All buttons use `rounded-xl` (12px), no gradients

## Form Controls

- Inputs/selects: 1px `var(--border)` border, `var(--card)` bg, `rounded-lg` (10px), placeholder in `var(--muted-foreground)`
- Toggles/switches: monochrome — `var(--primary)` track when on, `var(--border)` track when off
- Segmented controls: pill container (`var(--muted)` bg, 12px radius), active segment gets `var(--surface-selected)` fill
- Checkboxes: `var(--primary)` fill with `var(--primary-foreground)` check when active

## Data Display

- Tables: thin horizontal rules using `var(--border)`, no zebra striping, no cell borders
- Badges/tags: `rounded-full`, outline default with 1px `var(--border)` border; success/warning/info variants use `color-mix` translucent fills
- Charts: flat fills, no 3D effects, minimal gridlines, monochrome with one functional accent

## Feedback & Status

- Status dots (green/amber/red) — small, functional, never decorative
- Error states: `var(--destructive)` border or text, not red backgrounds
- Empty states: centered layout — icon + heading + description + single action

## Interaction States

- Hover: `var(--surface-hover)` background shift — no shadows
- Selected/active: `var(--surface-selected)` bg or solid `var(--primary)` fill
- Sidebar rows use `--sidebar-hover` and `--sidebar-selected`, not the generic surface states
- Focus: `var(--ring)` outline, offset from element, no glow
- No color/background transitions longer than 150ms

## Panel Titles

- `.app-panel-title`: mono (`var(--font-mono)`), 12px, weight 500, uppercase, 0.1em tracking, `var(--sidebar-muted-foreground)`

## Status and Errors

- Functional status colors resolve through semantic tokens: `--status-info`, `--status-success`, `--status-warning`, `--status-danger`, `--status-neutral`
- Git-specific colors (`--git-status-*`) are reserved for diff/file-state rendering, not generic shell status UI
- Destructive/error states use `--destructive` with subtle mixed fills; avoid hardcoded red/rose utility classes in shell chrome
