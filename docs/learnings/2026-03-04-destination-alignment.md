# Destination Alignment - 2026-03-04

## Context

We are aligning implementation and roadmap execution with the target desktop design (workspace tree, terminal-first center pane, and operational side panels).

## Observation

Current desktop app state (M2 complete) provides:
- Left sidebar with projects and manifest status.
- Main workspace panel with run/stop, setup progress, and service status.

The target design adds major surfaces not yet implemented:
- Multi-tab terminal workspace at center with harness-aware sessions.
- Right-side operational context (changes/checks + live services/log state).
- Organization/workspace hierarchy and richer navigation context.

## Decision

1. Treat the target design as the north-star UI for M3-M6 work.
2. Keep frontend organization feature-oriented and progressively composable.
3. Standardize React component filenames to lowercase hyphen-case.
4. Record new architectural learnings in this directory as work lands.

## Impact on milestones

- M3 directly owns terminal tab runtime and center-pane interaction model.
- M4 extends operational controls and service lifecycle fidelity that drive side-panel state.
- M6 introduces organization switcher, cloud workspace surfaces, activity feed, and PR actions that complete the design language.

## Follow-up actions

1. Frontend structure:
   - Introduce feature folders under `apps/desktop/src/features` as surfaces grow.
   - Keep shared primitives in `apps/desktop/src/components` only when reused by multiple features.
2. Naming:
   - Use hyphenated filenames for React component modules (for example `workspace-panel.tsx`).
3. Triage discipline:
   - Compare active work with target design and milestone contracts before major UI additions.
   - Capture resulting learnings in `docs/learnings`.
