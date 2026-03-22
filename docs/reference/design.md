# Design Language

Component-level rules for building Lifecycle UI. All tokens referenced below are CSS custom properties defined in `packages/ui/src/styles/theme.css`.

## Units

- **Use `rem` for all sizing, spacing, and layout values** — font sizes, padding, margins, widths, radii, indentation. The app sets a configurable base font size on `<html>` (Settings → Appearance), so `rem` values scale the entire interface when the user adjusts it.
- **Exceptions that stay in `px`**: native compositor alignment (e.g. terminal surface gutters), pointer-coordinate math from drag/resize interactions, and `border-width` (1px borders should not scale).
- When computing `rem` from a pixel design spec, divide by 16 (the default base). A `48px` sidebar becomes `3rem`; a `12px` font becomes `0.75rem`.
- Inline styles that derive from numeric props (e.g. an avatar `size` prop in pixels) should convert at render time: `` `${size / 16}rem` ``.

## Surfaces & Containers

- Radius scale: `--radius-xs` (0.125rem), `--radius-sm` (0.25rem), `--radius` (0.375rem), `--radius-md` (0.5rem), `--radius-lg` (0.625rem), `--radius-xl` (0.75rem), `--radius-2xl` (1.125rem), `--radius-3xl` (1.5rem). Cards and buttons use `rounded-xl`, inputs use `rounded-lg`, badges use `rounded-full`.
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
- **Sidebar section labels** are an exception: use normal title case with sans-serif font (`text-xs font-medium text-[var(--muted-foreground)]`), not the `app-panel-title` utility class — uppercase mono feels too technical for sidebar headers

## Overlays & Scrims

- Overlay backdrops use a **light scrim** (`bg-black/25`) — no `backdrop-blur-sm` or heavy opacity (`bg-black/50`)
- The background must remain visible to preserve spatial context when modals, command palettes, or dialogs are open
- Never blur overlay backdrops

## User-Facing Copy

- User-facing surfaces (homepage, settings, onboarding) must never reference internal milestones, debug info, or dev-speak
- No runtime paths, auth source labels, or implementation details in product UI
- Lead with product value. Ask: "would a non-developer user care about this?" — if no, remove it

## Status and Errors

- Functional status colors resolve through semantic tokens: `--status-info`, `--status-success`, `--status-warning`, `--status-danger`, `--status-neutral`
- Git-specific colors (`--git-status-*`) are reserved for diff/file-state rendering, not generic shell status UI
- Destructive/error states use `--destructive` with subtle mixed fills; avoid hardcoded red/rose utility classes in shell chrome

---

# Animations

Motion guidelines for Lifecycle UI. Animations are purposeful — they orient the user, signal state changes, and reinforce brand personality. They never decorate.

## Principles

1. **Motion earns attention** — animate only when it helps the user understand what changed or where to look. If removing the animation wouldn't confuse anyone, remove it.
2. **Fast by default** — interactions (hover, press, toggle) resolve in 150ms or less. Transitions that move layout settle within 200–300ms. Only narrative sequences (onboarding, celebrations) may exceed 1s.
3. **Physics over math** — prefer `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out-expo feel) for most transitions. Linear is reserved for continuous/looping motion (progress bars, draw-on strokes). Never use `ease-in` alone — things should arrive fast and decelerate, not accelerate into view.
4. **Reduced motion is not an afterthought** — every animation must be wrapped in a `prefers-reduced-motion` check. CSS animations get `animation: none` in a `@media (prefers-reduced-motion: reduce)` block. JS-driven sequences check `usePrefersReducedMotion()` and skip to the final state immediately.

## Timing Reference

| Category | Duration | Easing | Examples |
|----------|----------|--------|----------|
| Micro | 100–150ms | `ease` or `linear` | Hover bg, color shift, opacity toggle |
| Standard | 200–300ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Panel slide, collapse/expand, fade-in |
| Emphasis | 600–1000ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Button reveal, content enter |
| Narrative | 1–6s | Varies | Logo draw, typewriter, idle float |

## Interaction Animations

Interaction-level motion lives in CSS `transition` properties, not keyframes.

```css
/* Hover/active bg shift — 150ms max */
transition: background-color 150ms ease, color 150ms ease;

/* Panel resize — use linear to track pointer exactly */
transition: width 200ms ease-linear;
```

Rules:
- `background-color`, `color`, `opacity`, `border-color` transitions: 150ms
- `transform` transitions (scale, translate): 200ms with `cubic-bezier(0.4, 0, 0.2, 1)`
- Never transition `box-shadow` — use opacity on a pseudo-element if you must
- Never transition `height: auto` — use a measured max-height or `grid-template-rows: 0fr → 1fr`

## Enter/Exit Animations

Elements entering the viewport fade in and slide up slightly. Exiting elements simply disappear (opacity to 0) — no slide-out unless the exit direction is meaningful.

```css
@keyframes content-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.content-enter {
  animation: content-enter 600ms cubic-bezier(0.4, 0, 0.2, 1) both;
}
```

Rules:
- Translate distance: 4–8px. Never more than 12px — this isn't a page transition.
- Use `animation-fill-mode: both` so the element starts invisible before the animation begins.
- Stagger groups by 50–80ms per item. Cap at 5 items — after that, enter them all at once.

## SVG Path Drawing

Used for the brand logo animation. The technique: set `stroke-dasharray` and `stroke-dashoffset` to the path's total length, then animate `stroke-dashoffset` to 0.

```css
@keyframes stroke-draw {
  to {
    stroke-dashoffset: 0;
  }
}
```

Implementation pattern:
1. Render the path invisibly, measure with `getTotalLength()` in `useLayoutEffect`
2. Set `stroke-dasharray` and `stroke-dashoffset` to the measured length via inline style
3. Apply the CSS animation class only after measurement (prevents flash)
4. Use `clip-path` to constrain the visible stroke to the final filled shape

Rules:
- Always use `linear` easing for draw-on — constant speed reads as intentional
- Split complex shapes into segments with staggered delays (e.g. left loop 0ms, right loop 1100ms)
- `strokeWidth` should be generous enough that the stroke fully covers the clip region

## Idle/Ambient Loops

Subtle continuous motion for elements at rest. Used sparingly — only on hero/brand moments, never on functional UI.

```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.float {
  animation: float 6s ease-in-out infinite;
}
```

Rules:
- Duration: 4–8s. Shorter feels anxious, longer feels broken.
- Amplitude: 4–8px translate or 1–2deg rotate. Keep it peripheral.
- Easing: `ease-in-out` for smooth oscillation.
- Only one ambient animation per viewport. Two floating things compete.

## Typewriter

Character-by-character text reveal driven by React state, not CSS.

```tsx
const TYPE_INTERVAL_MS = 140;

useEffect(() => {
  if (typedCount >= text.length) return;
  const timer = setTimeout(() => setTypedCount(c => c + 1), TYPE_INTERVAL_MS);
  return () => clearTimeout(timer);
}, [typedCount, text.length]);
```

Pair with a blinking cursor:

```css
@keyframes cursor-blink {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0; }
}

.cursor-blink {
  animation: cursor-blink 1200ms ease-in-out infinite;
}
```

Rules:
- Interval: 100–160ms per character. Faster feels robotic, slower feels broken.
- Cursor blinks throughout — don't stop it after typing finishes.
- Cursor element: thin rectangle (`width: 0.12em`, `height: 0.85em`), same color as text.

## Phase Sequencing

Complex animations are state machines, not CSS chains. Each phase is a React state that triggers the next via `setTimeout`.

```
logo → pause → settle → typing → reveal → complete
```

Pattern:
- Define phases as a union type: `type Phase = "logo" | "pause" | "settle" | ...`
- Each phase transition is a separate `useEffect` with a `setTimeout`
- Guard transitions with a ref (`phaseRef.current === expectedPhase`) to prevent races after unmount/re-render
- Reduced motion skips directly to the final phase on mount

Rules:
- Always include a **pause** phase between visual beats — let each moment land before the next begins (800–1500ms)
- Settle/layout transitions use CSS `animation` with `forwards` fill mode, JS state tracks completion via matching `setTimeout`
- The final phase should be stable — no timers running, only ambient loops if applicable

## Reduced Motion

```tsx
// Hook
const prefersReducedMotion = usePrefersReducedMotion();

// Skip to final state
const [phase, setPhase] = useState<Phase>(() =>
  prefersReducedMotion ? "complete" : "logo"
);
```

```css
@media (prefers-reduced-motion: reduce) {
  .welcome-snake-draw-left,
  .welcome-snake-draw-right,
  .welcome-logo-settle,
  .welcome-logo-float,
  .welcome-button-enter,
  .welcome-cursor-blink {
    animation: none;
  }
}
```

Rules:
- CSS: blanket `animation: none` on all animated classes
- JS: skip phase machine to terminal state, set all counters to final values
- Interaction transitions (150ms hover/color) are fine — `prefers-reduced-motion` targets animation, not micro-feedback
