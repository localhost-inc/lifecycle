# Brand Guide

## Positioning

- One-liner: "Lifecycle is the control plane for development workspace lifecycle."
- Audience phasing: solo devs -> small teams -> platform engineers
- Agent-agnostic infrastructure ("where agents run"), not a competing coding-agent product

## Personality

- Sharp, minimalist, zero-chrome
- Confident but not arrogant. Precise but not cold.
- Anti-patterns: never enterprise/corporate, never playful/emoji-heavy, never marketing-forward

## Emotional Promise

- Empowered, fast, in control, professional
- "Calm velocity" -- things work immediately, no surprises, no friction

## Name Treatment

- Always "Lifecycle" (title case) in prose
- `lifecycle` (lowercase) in code, CLI commands, config files, package names
- Logo mark: `docs/brand/lifecycle-logo.svg`
- Wordmark: pixelated SVG wordmark using Geist Pixel Square, implemented in `packages/ui/src/components/wordmark.tsx`

## Voice & Tone

- Developer-native by default -- assumes fluency, no hand-holding
- Accessible when explaining decisions -- precise but welcoming (Stripe-style)
- Code speaks where possible -- minimal prose, maximum examples
- Tone inspirations: Linear (opinionated peer), Stripe (generous authority), Vercel (typographic restraint), Raycast (power-user energy)

### CLI Output Voice

- Opinionated polish: thoughtful spinners, structured progress, summary blocks
- Silence is not success -- confirm what happened, concisely
- Errors: typed, structured, with suggested next action
- No emoji in CLI output

### Docs & Copy Voice

- Lead with what, not why
- Short sentences. Active voice. Present tense.
- Technical terms unadorned -- don't scare-quote or over-explain
- One idea per paragraph

## Visual Identity

### Color

- Dark-first: dark surfaces are the canonical brand context
- Temperature: warm neutral (stone-brown blacks, warm mid-tones)
- Accent: warm white/cream -- the accent is the light itself against dark surfaces
- Status colors (green/amber/red) are functional, not brand
- One color moment > five competing ones

### Palette

- Background: #0d0c0a (warm stone near-black)
- Card: #151412 (elevated surface)
- Panel: #181614 (recessed/secondary surface)
- Border: #282724 (subtle separation)
- Muted: #78756e (secondary text, metadata)
- Foreground: #fafaf9 (warm white -- the accent)
- Functional: status green #22c55e, amber #f59e0b, red #ef4444

Extended token categories (sidebar, terminal ANSI, git status) are defined per-theme in `packages/ui/src/styles/themes/`.

### Typography

- Display/headings: Geist, with Inter as system fallback
- Technical content, UI chrome, code: Geist Mono, with JetBrains Mono as fallback
- Brand/display moments: Geist Pixel Square
- Tight tracking on display type, open tracking on small caps/labels
- Maximize weight contrast: heavy display, light/regular labels
- Minimum body text: 14px. No text below 12px except all-caps labels.

### Theme Presets

- 7 presets: dark (default), light, nord, monokai, catppuccin, dracula, rose-pine
- Each preset defines appearance (light/dark) and a full semantic token set
- Dark preset is the canonical brand context; community presets are alternatives
- Defined in `packages/ui/src/styles/themes/`

### Spacing & Layout

- Generous negative space -- white space is a feature
- Tighter spacing to group related elements, generous spacing for hero/primary content
- Prefer asymmetry and scale contrast over grid-like sameness
- Information on surfaces > boxing everything in cards

### Design Principles

1. Restraint over decoration -- when choosing between adding and removing, remove
2. Typography is the primary visual tool -- invest in hierarchy, weight, and spacing
3. One intense moment is stronger than five moderate ones
4. Dark surfaces, warm light -- the brand tension
5. Timeless over trendy -- no gradients, shadows only for functional affordances (floating tabs), no "SaaS purple"
