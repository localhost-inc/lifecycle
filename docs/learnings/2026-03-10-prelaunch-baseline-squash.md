# Pre-Launch Baseline Squash

## Context

We had started to accumulate compatibility code for unshipped local persistence:

1. Browser-only state accepted legacy field names.
2. UI primitives preserved selector bridges for older consumer contracts.
3. Desktop SQLite migrations still described older intermediate schemas even though the product has not launched.

That creates maintenance cost without protecting real users.

## Decision

Before launch, treat repo-owned persistence and UI state as current-shape only:

1. Do not keep field-translation shims for unshipped browser or local storage data.
2. Do not preserve UI selector or prop compatibility only for internal pre-launch consumers.
3. Prefer squashing the desktop migration baseline to the current schema instead of carrying upgrade history for unshipped database shapes.
4. Reset local development state when necessary instead of adding compatibility branches.

## Impact

1. Milestone impact: M3, M5, and M7 work can add stateful surfaces without inheriting dead compatibility paths.
2. Fresh bootstrap paths become the primary test target for desktop persistence.
3. Developers may need to clear local storage or delete local desktop databases after baseline changes.

## Follow-Up

1. Add lightweight guardrails that flag new repo-owned `Legacy*` types or versioned local storage keys in app code.
2. Keep product fallbacks separate from compatibility shims in code review language so we do not remove legitimate runtime behavior by accident.
