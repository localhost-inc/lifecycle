# AGENTS.md - Engineering Playbook

This file defines engineering execution standards for agents working in this repository.

## Scope

1. Prioritize implementation quality, correctness, and reproducibility.
2. Keep changes small, testable, and contract-aligned.
3. Treat this repo as a production codebase, not a sandbox.

## Core References

Use these as external contracts, without duplicating their full detail here:

1. `README.md`
2. `docs/vision.md`
3. `docs/plan.md`
4. `docs/reference/*.md`
5. `docs/milestones/*.md`
6. `docs/BRAND.md`

When behavior changes and docs are now wrong, update docs in the same change.

## Triage Router

Use this section to route work before implementation.

1. Anchor UI decisions to the destination design and map them to the active milestone contract.
2. Compare current implementation against `docs/plan.md` before starting broad UI changes.
3. If destination and milestone text diverge, update docs first, then implement.

### Destination-to-Milestone Mapping

1. Center terminal workspace (tabbed sessions, harness flows, attach/detach) -> M3.
2. Workspace lifecycle controls, service runtime states, sleep/wake/destroy UX -> M5.
3. CLI-centric workspace control and observability flows -> M6.
4. Org/workspace hierarchy, cloud surfaces, activity, previews, PR actions -> M7.
5. Deferred agent workspace/native runtime concepts -> `docs/backlog/*` (not active milestone work).

### Frontend Organization Rules

1. React component filenames must use lowercase hyphen-case (for example, `workspace-panel.tsx`).
2. Keep React component symbols in PascalCase; filename style and symbol style are intentionally different.
3. Exception: framework-required entrypoint names may keep ecosystem defaults (for example, `App.tsx`, `main.tsx`).
4. Prefer feature-oriented grouping as UI scope grows (for example, `apps/desktop/src/features/*`).
5. Keep cross-feature reusable primitives in `apps/desktop/src/components`.

### Theming and UI Library Rules

1. Theme architecture must support `appearance` (`light|dark|system`) and named `preset` themes independently.
2. Shared design tokens live in `packages/ui/src/styles/theme.css`; app-level CSS should compose on top of those tokens.
3. New reusable primitives should be added to `packages/ui` first, then consumed by `apps/desktop` (and future web apps).
4. Shadcn usage is allowed, but generated components should be normalized to repository naming/style rules before adoption.
5. Avoid hardcoding palette-specific Tailwind color classes in new components when a semantic token exists.

### Learning Capture Rules

1. Record non-trivial implementation or architecture learnings in `docs/learnings`.
2. Use dated files named `YYYY-MM-DD-short-title.md`.
3. Include explicit milestone impact and follow-up actions in each learning note.

## Engineering Invariants

1. Use `workspace` as the canonical noun across code, APIs, and docs.
2. Do not introduce ad-hoc state values; follow canonical state machines.
3. Use typed errors/failure reasons; do not introduce untyped string-only failures.
4. Preserve local-first operation for local workflows (no mandatory auth/network dependency).
5. Keep provider boundaries explicit; avoid leaking provider-specific behavior across interfaces.
6. Do not add silent fallback paths that hide failures or misconfiguration.

## Change Workflow

1. Classify the request: feature, fix, refactor, tooling, docs.
2. Identify impacted contracts (types, state, errors, API shape, persistence).
3. Implement the smallest coherent change that fully solves the request.
4. Add or update tests for changed behavior.
5. Run verification commands (`bun run qa` by default for code changes).
6. Update execution/milestone docs if status or scope changed.
7. Report what changed, what was verified, and any explicit gaps.

## Implementation Standards

1. Prefer explicit code over implicit magic.
2. Keep modules focused; avoid broad cross-cutting edits without need.
3. Default to forward-only changes: do not add legacy code paths, compatibility wrappers, re-export shims, or duplicate APIs unless the request explicitly requires them.
4. If compatibility is explicitly required, document the scope and planned removal conditions in the same change.
5. Make failure handling first-class: clear error type, message, and recovery path.
6. Keep naming consistent with existing contracts and domain language.
7. Desktop database schema changes must go through numbered SQL migrations in `apps/desktop/src-tauri/src/platform/migrations`; do not add startup-time schema guards or ad hoc `ALTER TABLE` helpers.

## Testing and Verification

Run these from repo root when relevant:

1. `bun run format`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test`
5. `bun run build`
6. `bun run qa` (parallel lint + typecheck + test)

Rules:

1. New behavior should have tests.
2. Bug fixes should include a regression test where practical.
3. If any check is skipped or fails due to environment limits, state that explicitly.
4. Default verification for code changes is `bun run qa`; use narrower checks only for clearly scoped/docs-only edits and call that out explicitly.

## Tooling Baseline

1. Package manager/runtime: Bun.
2. Task graph/orchestration: Turborepo.
3. Lint/format: OXC (`oxlint`, `oxfmt`).
4. Test runner: `bun:test`.
5. Pre-commit quality gate: Lefthook (`lint`, `typecheck`).

## Git and Review Discipline

1. Do not revert unrelated user changes.
2. Keep diffs scoped to the request.
3. Call out risks when changing contracts, state logic, or lifecycle behavior.
4. Prefer follow-up tasks over hidden scope creep.
5. Use Conventional Commits compatible with `std-chglog` (e.g. `feat(scope): ...`, `fix(scope): ...`).

## Definition of Done

A task is done only when:

1. Requested behavior is implemented (or intentionally documented).
2. Contracts and docs are consistent with the change.
3. Relevant checks/tests were run and reported.
4. Remaining risks or open decisions are explicitly listed.
