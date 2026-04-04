# AGENTS.md - Engineering Playbook

This file defines engineering execution standards for agents working in this repository.

## Scope

1. Prioritize implementation quality, correctness, and reproducibility.
2. Keep changes small, testable, and contract-aligned.
3. Treat this repo as a production codebase, not a sandbox.

## Current Product Focus

1. The active product focus is the `lifecycle` CLI, TUI (`apps/tui`), control plane (CF Workers + Durable Objects + D1), and sandbox provider infrastructure.
2. Prefer work that makes workspace lifecycle, shell attach, tmux persistence, host-aware execution, sandbox provisioning, and background agent orchestration more reliable.
3. OpenCode is the agent runtime inside workspaces. Lifecycle provides workspace awareness through custom tools and plugins, not through custom agent provider integrations.
4. Treat desktop, web, and other auxiliary surfaces as maintenance-only unless the user explicitly asks for them or they directly unblock CLI/TUI/control-plane work.

## Operating Context

Lifecycle is a workspace runtime and agent orchestration platform. The working priority is CLI + TUI + control plane + sandbox providers. When the user reports behavioral errors, broken interactions, or "this didn't work", assume they are describing the `lifecycle` CLI, `lifecycle-tui`, control plane, or workspace/environment packages unless they explicitly say desktop, web, or another surface. Investigate CLI/TUI/control-plane codepaths first.

The system has two modes: **interactive** (human in a tmux-backed shell, optionally running an agent) and **background** (headless agent in a sandbox, orchestrated by the control plane). Both share the same workspace contract. See `docs/reference/architecture.md` for the full system design.

Bridge-first execution rule: treat the bridge as the single runtime authority boundary for CLI and TUI work. Clients ask the bridge to do runtime reads and mutations. The bridge streams lifecycle events back to clients. Do not add side paths that shell out to ad hoc `lifecycle` subprocesses or duplicate runtime orchestration in clients when bridge ownership is the intended model.

## Core References

1. `README.md`
2. `docs/reference/*.md` — canonical contracts (see Reference Docs below)
3. `docs/plans/*.md` — tracked execution plans
4. `docs/milestones/README.md` — milestone index
5. `docs/archive/` — historical docs, superseded specs, desktop-specific contracts

When behavior changes and docs are now wrong, update the corresponding reference doc in the same change.

## Reference Docs

Canonical contract documents for each domain. Read the relevant doc before starting work that touches that domain.

| Doc | Context |
|---|---|
| `docs/reference/architecture.md` | System architecture: three tiers, sandbox providers, two modes |
| `docs/reference/vision.md` | Product vision and strategy |
| `docs/reference/journey.md` | Narrative from local dev to background agents to cloud collaboration |
| `docs/reference/tui.md` | Lifecycle TUI contract, shell attach model, and host-aware activity rules |
| `docs/reference/vocabulary.md` | Canonical product terminology |
| `docs/reference/brand.md` | Brand voice, visual identity, color, typography |

## Triage Router

Use this section to route work before implementation.

1. Anchor UI decisions to the destination design and map them to the active milestone contract.
2. Compare current implementation against the relevant milestone doc, plan doc, and reference contract before starting broad UI changes.
3. If destination and contract text diverge, update docs first, then implement.

### Destination-to-Contract Mapping

1. System architecture, sandbox providers, control plane design, background agent orchestration -> `docs/reference/architecture.md`.
2. TUI shell attach, tmux persistence, mouse/keyboard routing, and workspace activity -> `docs/reference/tui.md`.
3. CLI workspace control, shell/runtime commands, and observability flows -> `docs/plans/local-cli.md`.
4. Terminal data-model and legacy terminal persistence questions -> `docs/reference/terminal.md`.
5. Workspace lifecycle controls, service runtime states, local preview exposure, sleep/wake/destroy UX -> M4.
6. Cloud auth, orgs, workspace provisioning, shell attach, PR create/merge -> `docs/plans/kin-cloud-v1.md`.
7. Cloud lifecycle hardening (sleep/wake restore, TTL, quotas) -> `docs/plans/cloud-hardening.md`.
8. OpenCode integration, custom tools, and plugins -> `docs/reference/architecture.md` (OpenCode section).

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

1. When a learning describes stable current state or a durable contract, fold it into the appropriate reference doc (`docs/reference/*.md`) or create a new one. Do not leave it as a standalone learning.
2. When a learning describes a reusable workflow or technique, propose it as a new skill in `.skills/`.
3. Use `docs/learnings/` only for time-bound investigation notes, evaluation results, and decision records that are not yet ready to become reference docs.
4. Use dated files named `YYYY-MM-DD-short-title.md` for learnings that do stay in the log.
5. Periodically review `docs/learnings/` and graduate stable entries into references or archive historical ones.
6. When graduating a learning, add a one-line header noting the reference doc it was folded into and the date (e.g. `> Graduated into docs/reference/native.md on 2026-03-18`).
7. Skills should describe current shipped behavior, not planned or aspirational contracts.

### Reference Doc Maintenance

1. **When to update a doc** — when behavior ships that contradicts or extends a contract documented in a reference doc. Update the doc in the same change that ships the behavior.
2. **When to create a new doc** — when 3+ learnings converge on a stable domain that has no existing reference doc. The domain should be non-obvious and actively iterated.
3. **Graduation workflow** — read the learning, extract the durable contract, fold it into the appropriate reference doc, add a "graduated" note to the learning header. Keep the learning file for historical context.
4. **Doc hygiene** — keep reference docs factual (what IS), not aspirational (what MIGHT BE). Remove milestone-specific follow-ups once the described behavior has shipped. Do not include investigation notes or evaluation details.

## Engineering Invariants

1. Use `workspace` as the canonical noun across code, APIs, and docs.
2. Use the terms in `docs/reference/vocabulary.md` for shell, project, workspace, pane, and surface concepts; do not invent new synonyms for core concepts without updating that doc.
3. Do not introduce ad-hoc state values; follow canonical state machines.
4. Use typed errors/failure reasons; do not introduce untyped string-only failures.
5. Preserve local-first operation for local workflows (no mandatory auth/network dependency).
6. Keep provider boundaries explicit; avoid leaking provider-specific behavior across interfaces.
7. Do not add silent fallback paths that hide failures or misconfiguration.
8. Preserve the bridge-first client model: runtime reads, mutations, and streamed state changes should flow through bridge unless a contract explicitly says otherwise.

## Change Workflow

1. Classify the request: feature, fix, refactor, tooling, docs.
2. Identify impacted contracts (types, state, errors, API shape, persistence).
3. Implement the smallest coherent change that fully solves the request.
4. Add or update tests for changed behavior.
5. Run verification commands (`bun run qa` by default for code changes).
6. Update milestone/reference docs if status or scope changed.
7. Report what changed, what was verified, and any explicit gaps.

## Implementation Standards

1. Prefer explicit code over implicit magic.
2. Keep modules focused; avoid broad cross-cutting edits without need.
3. Default to forward-only changes: do not add legacy code paths, compatibility wrappers, re-export shims, or duplicate APIs unless the request explicitly requires them.
4. If compatibility is explicitly required, document the scope and planned removal conditions in the same change.
5. Make failure handling first-class: clear error type, message, and recovery path.
6. Keep naming consistent with existing contracts and domain language.
7. Desktop database schema changes must go through numbered SQL migrations in `apps/desktop/src-tauri/src/platform/migrations`; do not add startup-time schema guards or ad hoc `ALTER TABLE` helpers.
8. Prefer clean hierarchical feature directories over adding new sibling helper files at the package root; organize by boundary first, then by domain within that boundary.

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
