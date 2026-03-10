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
