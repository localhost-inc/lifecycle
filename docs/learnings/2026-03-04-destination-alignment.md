# Destination Alignment - 2026-03-04

## Context

We are aligning implementation and roadmap execution with the target desktop design (workspace tree, Lifecycle-native agent center pane, raw-terminal fallback, and operational side panels).

## Observation

Current desktop app state (M2 complete) provides:
- Left sidebar with projects and manifest status.
- Main workspace panel with run/stop, setup progress, and service status.

The target design adds major surfaces not yet implemented:
- Lifecycle-native agent workspace at center with session/task/approval/artifact UX.
- Raw shell access as a secondary surface rather than the main programming surface.
- Right-side operational context (changes/checks + live services/log state).
- Organization/workspace hierarchy and richer navigation context.

## Decision

1. Treat the target design as the north-star UI for M3-M7 work.
2. Keep frontend organization feature-oriented and progressively composable.
3. Standardize React component filenames to lowercase hyphen-case.
4. Record new architectural learnings in this directory as work lands.

## Impact on milestones

- M3 directly owns terminal tab runtime and raw shell access.
- Deferred backlog item owns the Lifecycle-native agent workspace and portable center-pane interaction model when revisited.
- M5 extends operational controls and service lifecycle fidelity that drive side-panel state.
- M7 introduces organization switcher, cloud workspace surfaces, activity feed, and PR actions that complete the design language.

## Follow-up actions

1. Frontend structure:
   - Introduce feature folders under `apps/desktop/src/features` as surfaces grow.
   - Keep shared primitives in `apps/desktop/src/components` only when reused by multiple features.
2. Naming:
   - Use hyphenated filenames for React component modules (for example `workspace-panel.tsx`).
3. Triage discipline:
   - Compare active work with target design and milestone contracts before major UI additions.
   - Capture resulting learnings in `docs/learnings`.
